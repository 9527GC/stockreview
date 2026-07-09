#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
腾讯财经备用数据源：获取 A 股全市场涨跌/涨跌停/成交量统计。

由于当前网络环境访问东方财富/新浪财经 A 股全市场接口受限，
本脚本使用 akshare 获取代码列表，再分批请求腾讯财经 (qt.gtimg.cn)
批量行情接口，最后计算沪深京 A 股全市场指标。

输出 JSON 到 stdout：
{
  "upCount": int,
  "downCount": int,
  "flatCount": int,
  "limitUpCount": int,
  "limitDownCount": int,
  "totalVolume": int,  // 股数（由“手”乘以 100）
  "totalAmount": int  // 成交金额（元）
}
"""

import json
import os
import sys
import time
import traceback

import requests


# 每个批次请求的代码数量；实测 500 可行，5000+ 会超时
CODES_PER_BATCH = 450
# 批次间间隔，降低对腾讯接口的压力和被封概率
BATCH_DELAY_MS = 200
# 单个批次请求超时
REQUEST_TIMEOUT = 30
# 单个批次失败重试次数
MAX_RETRIES = 3

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CODE_LIST_CACHE_PATH = os.path.join(SCRIPT_DIR, 'data', 'a_share_codes.json')
CODE_LIST_CACHE_TTL_SECONDS = 24 * 60 * 60


def ensure_data_dir():
    data_dir = os.path.dirname(CODE_LIST_CACHE_PATH)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)


def load_cached_code_list():
    try:
        if not os.path.exists(CODE_LIST_CACHE_PATH):
            return None
        mtime = os.path.getmtime(CODE_LIST_CACHE_PATH)
        if time.time() - mtime > CODE_LIST_CACHE_TTL_SECONDS:
            return None
        with open(CODE_LIST_CACHE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if isinstance(data, list) and len(data) > 1000:
            return data
    except Exception as e:
        print(f'[AKShare] Failed to load cached code list: {e}', file=sys.stderr)
    return None


def save_cached_code_list(code_list):
    try:
        ensure_data_dir()
        with open(CODE_LIST_CACHE_PATH, 'w', encoding='utf-8') as f:
            json.dump(code_list, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f'[AKShare] Failed to save code list cache: {e}', file=sys.stderr)


def fetch_code_list_from_akshare():
    try:
        import akshare as ak
        df = ak.stock_info_a_code_name()
        if df is None or df.empty:
            return None
        # df columns: ['code', 'name']
        return [
            {'code': str(row['code']).strip(), 'name': str(row.get('name') or '').strip()}
            for _, row in df.iterrows()
        ]
    except Exception as e:
        print(f'[AKShare] stock_info_a_code_name failed: {e}', file=sys.stderr)
        return None


def get_code_list():
    # 优先使用本地缓存，避免每次请求都去拉 akshare 代码列表（该接口较慢且不稳定）
    cached = load_cached_code_list()
    if cached:
        print(f'[AKShare] Using cached code list ({len(cached)} items)', file=sys.stderr)
        return cached

    # 缓存不存在或已过期，尝试从 akshare 刷新
    code_list = fetch_code_list_from_akshare()
    if code_list:
        save_cached_code_list(code_list)
        return code_list

    # 实时刷新失败但有过期缓存时也尽量使用（降级）
    try:
        if os.path.exists(CODE_LIST_CACHE_PATH):
            with open(CODE_LIST_CACHE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
            if isinstance(data, list) and len(data) > 1000:
                print(f'[AKShare] Using stale cached code list ({len(data)} items)', file=sys.stderr)
                return data
    except Exception as e:
        print(f'[AKShare] Failed to load stale code list: {e}', file=sys.stderr)

    return None


def to_tencent_code(code):
    """把 6 位数字代码转换成腾讯接口格式 sh600000 / sz000001 / bj430047。"""
    code = str(code or '').strip()
    if not code or len(code) != 6 or not code.isdigit():
        return None
    # 北交所/新三板：43/83/87/88/92 开头，bj 前缀
    if code.startswith(('4', '8', '9')):
        # 4 开头大部分是新三板/北交所；83/87/88/92 是北交所
        return 'bj' + code
    # 上海：600/601/603/605/688/689
    if code.startswith(('600', '601', '603', '605', '688', '689')):
        return 'sh' + code
    # 深圳：000/001/002/003/300/301
    if code.startswith(('000', '001', '002', '003', '300', '301')):
        return 'sz' + code
    return None


def infer_limit_threshold(code, name):
    """根据代码和名称推断涨跌停阈值（%）。"""
    code = str(code or '')
    name = str(name or '')
    if 'ST' in name or '退市' in name:
        return 5.0
    if code.startswith(('300', '301', '688', '689')):
        return 19.5
    if code.startswith(('4', '8', '92')):
        return 29.5
    return 9.8


def parse_tencent_quote(line):
    """
    解析腾讯行情返回的一行：v_sh600000="1~name~600000~price~close~open~volume~..."
    返回 {code, name, price, close, volume}，解析失败返回 None。
    """
    line = line.strip()
    if not line or 'v_' not in line:
        return None
    parts = line.split('=', 1)
    if len(parts) < 2:
        return None
    val = parts[1].strip().strip('"')
    fields = val.split('~')
    # 最小字段数：至少要有代码、当前价、昨收、成交量
    if len(fields) < 7:
        return None
    try:
        price = float(fields[3])
        close = float(fields[4])
        volume_hands = float(fields[6])
        # 腾讯接口字段 35 格式为 "price/volume/amount"，第三个数字是成交额（元）
        amount = 0.0
        if len(fields) > 35:
            composite = fields[35]
            if '/' in composite:
                composite_parts = composite.split('/')
                if len(composite_parts) >= 3:
                    amount = float(composite_parts[2])
    except (ValueError, IndexError):
        return None

    return {
        'code': fields[2].strip(),
        'name': fields[1].strip(),
        'price': price,
        'close': close,
        'volume_hands': volume_hands,
        'amount': amount
    }


def fetch_batch_with_retry(codes):
    """请求一批腾讯行情，带重试。"""
    url = 'http://qt.gtimg.cn/q=' + ','.join(codes)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(
                url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                    'Accept': '*/*'
                },
                timeout=REQUEST_TIMEOUT
            )
            response.raise_for_status()
            # 腾讯行情接口返回 GBK/GB18030 编码
            text = response.content.decode('gbk', errors='replace')
            return text
        except Exception as e:
            if attempt < MAX_RETRIES:
                print(f'[AKShare] Tencent batch request attempt {attempt} failed: {e}, retrying...', file=sys.stderr)
                time.sleep(0.5 * attempt)
            else:
                raise


def fetch_all_quotes(tencent_codes):
    """分批请求所有代码行情，返回解析后的 quote 列表。"""
    quotes = []
    total = len(tencent_codes)
    batch_count = (total + CODES_PER_BATCH - 1) // CODES_PER_BATCH

    for i in range(batch_count):
        start = i * CODES_PER_BATCH
        end = min(start + CODES_PER_BATCH, total)
        batch = tencent_codes[start:end]
        try:
            text = fetch_batch_with_retry(batch)
            for line in text.split(';'):
                quote = parse_tencent_quote(line)
                if quote:
                    quotes.append(quote)
            print(f'[AKShare] Tencent batch {i + 1}/{batch_count}: {len(batch)} codes requested, {len(quotes)} parsed so far', file=sys.stderr)
        except Exception as e:
            print(f'[AKShare] Tencent batch {i + 1}/{batch_count} failed: {e}', file=sys.stderr)

        if i < batch_count - 1:
            time.sleep(BATCH_DELAY_MS / 1000.0)

    return quotes


def main():
    try:
        code_list = get_code_list()
        if not code_list:
            print(json.dumps({'error': 'Failed to get A-share code list'}), file=sys.stderr)
            sys.exit(1)

        print(f'[AKShare] Loaded {len(code_list)} A-share codes', file=sys.stderr)

        tencent_codes = []
        code_name_map = {}
        for item in code_list:
            code = item.get('code')
            name = item.get('name', '')
            tc = to_tencent_code(code)
            if tc:
                tencent_codes.append(tc)
                code_name_map[tc] = name

        if not tencent_codes:
            print(json.dumps({'error': 'No valid tencent codes'}), file=sys.stderr)
            sys.exit(1)

        quotes = fetch_all_quotes(tencent_codes)
        print(f'[AKShare] Parsed {len(quotes)} quotes from Tencent', file=sys.stderr)

        if not quotes:
            print(json.dumps({'error': 'No quotes returned from Tencent'}), file=sys.stderr)
            sys.exit(1)

        up_count = 0
        down_count = 0
        flat_count = 0
        limit_up_count = 0
        limit_down_count = 0
        total_volume_hands = 0.0
        total_amount_yuan = 0.0

        for quote in quotes:
            price = quote['price']
            close = quote['close']
            if close == 0 or price == 0:
                continue
            pct = (price - close) / close * 100.0

            # 只统计有涨跌幅的股票（price 和 close 都有）
            if abs(pct) < 0.0001:
                flat_count += 1
            elif pct > 0:
                up_count += 1
            else:
                down_count += 1

            # 涨跌停阈值
            code = quote['code']
            name = code_name_map.get('bj' + code if code.startswith(('4', '8', '9')) else 'sh' + code if code.startswith(('6', '9')) else 'sz' + code, '')
            threshold = infer_limit_threshold(code, name)
            if pct >= threshold:
                limit_up_count += 1
            if pct <= -threshold:
                limit_down_count += 1

            volume_hands = quote['volume_hands']
            if volume_hands > 0:
                total_volume_hands += volume_hands
            amount = quote.get('amount', 0.0)
            if amount > 0:
                total_amount_yuan += amount

        # 腾讯接口成交量单位是“手”，1 手 = 100 股；成交金额单位为“元”
        total_volume = int(total_volume_hands * 100) if total_volume_hands > 0 else None
        total_amount = int(total_amount_yuan) if total_amount_yuan > 0 else None

        result = {
            'upCount': up_count,
            'downCount': down_count,
            'flatCount': flat_count,
            'limitUpCount': limit_up_count,
            'limitDownCount': limit_down_count,
            'totalVolume': total_volume,
            'totalAmount': total_amount
        }
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
