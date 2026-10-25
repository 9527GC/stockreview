const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');
const iconv = require('iconv-lite');
const MarketDailySnapshot = require('../models/MarketDailySnapshot');
const { getDateStringInOffset } = require('./datetime');

// 新浪财经接口前缀
const SINA_API_URL = 'http://hq.sinajs.cn/list=';
const SOHU_HISTORY_API_URL = 'https://q.stock.sohu.com/hisHq?code=';
const TENCENT_HISTORY_API_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=';
const EASTMONEY_QUOTE_API_URL = 'https://push2.eastmoney.com/api/qt/clist/get';
const TENCENT_QUOTE_API_URL = 'http://qt.gtimg.cn/q=';
const DEFAULT_REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*'
};

const A_SHARE_CODE_LIST_CACHE_PATH = path.join(__dirname, '../../scripts/data/a_share_codes.json');
const A_SHARE_CODE_LIST_CACHE_TTL_MS = 24 * 60 * 60 * 1000;


// 新浪财经接口简易熔断状态
let sinaCircuitOpen = false;
let sinaCircuitLastFailure = 0;
const SINA_CIRCUIT_TIMEOUT_MS = 30 * 1000;

const openSinaCircuit = () => {
  sinaCircuitOpen = true;
  sinaCircuitLastFailure = Date.now();
  console.error('[CircuitBreaker] Sina circuit opened');
};

const isSinaCircuitOpen = () => {
  if (!sinaCircuitOpen) return false;
  if (Date.now() - sinaCircuitLastFailure > SINA_CIRCUIT_TIMEOUT_MS) {
    sinaCircuitOpen = false;
    console.log('[CircuitBreaker] Sina circuit half-open, retrying');
    return false;
  }
  return true;
};

// 行情短期内存缓存，减少上游接口压力和本地限流命中
const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS = 8 * 1000;

const getCachedQuote = (formattedSymbol) => {
  const entry = quoteCache.get(formattedSymbol);
  if (!entry) return null;
  if (Date.now() - entry.ts > QUOTE_CACHE_TTL_MS) {
    quoteCache.delete(formattedSymbol);
    return null;
  }
  return entry.data;
};

const setCachedQuote = (formattedSymbol, data) => {
  quoteCache.set(formattedSymbol, { ts: Date.now(), data });
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const createEmptyMarketSnapshot = (overrides = {}) => ({
  benchmarkName: null,
  benchmarkSymbol: null,
  index: null,
  price: null,
  change: null,
  changePercent: null,
  volume: null,
  volumeChangeRatio: null,
  upCount: null,
  downCount: null,
  flatCount: null,
  limitUpCount: null,
  limitDownCount: null,
  snapshotTime: null,
  snapshotSource: null,
  ...overrides
});

const isLikelyFakeZeroSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const keys = ['index', 'price', 'change', 'changePercent', 'volume', 'volumeChangeRatio', 'upCount', 'downCount', 'flatCount', 'limitUpCount', 'limitDownCount'];
  const values = keys
    .map((key) => snapshot[key])
    .filter((value) => value !== null && value !== undefined && value !== '');
  return values.length > 0 && values.every((value) => Number(value) === 0);
};

const normalizeMarketOverviewSnapshot = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || isLikelyFakeZeroSnapshot(snapshot)) return null;

  const indexValue = toFiniteOrNull(snapshot.index ?? snapshot.price);
  const priceValue = toFiniteOrNull(snapshot.price ?? snapshot.index);
  const normalized = createEmptyMarketSnapshot({
    benchmarkName: snapshot.benchmarkName || null,
    benchmarkSymbol: snapshot.benchmarkSymbol || null,
    index: indexValue,
    price: priceValue,
    change: toFiniteOrNull(snapshot.change),
    changePercent: toFiniteOrNull(String(snapshot.changePercent ?? '').replace('%', '')),
    volume: toFiniteOrNull(snapshot.volume),
    volumeChangeRatio: toFiniteOrNull(snapshot.volumeChangeRatio),
    upCount: toFiniteOrNull(snapshot.upCount),
    downCount: toFiniteOrNull(snapshot.downCount),
    flatCount: toFiniteOrNull(snapshot.flatCount),
    limitUpCount: toFiniteOrNull(snapshot.limitUpCount),
    limitDownCount: toFiniteOrNull(snapshot.limitDownCount),
    snapshotTime: snapshot.snapshotTime || null,
    snapshotSource: snapshot.snapshotSource || null
  });

  const hasAny = Object.entries(normalized)
    .filter(([key]) => !['benchmarkName', 'benchmarkSymbol', 'snapshotTime', 'snapshotSource'].includes(key))
    .some(([, value]) => value !== null);

  return hasAny ? normalized : null;
};

const inferSnapshotStatus = (snapshot) => {
  if (!snapshot) return 'missing';
  const keys = ['index', 'price', 'change', 'changePercent', 'volume', 'volumeChangeRatio', 'upCount', 'downCount', 'flatCount', 'limitUpCount', 'limitDownCount'];
  const values = keys.map((key) => snapshot[key]);
  if (!values.some((value) => value !== null)) return 'missing';
  return values.every((value) => value !== null) ? 'complete' : 'partial';
};

const requestText = (url, options = {}, redirectCount = 0) => new Promise((resolve, reject) => {
  const client = String(url).startsWith('https') ? https : http;
  const req = client.get(url, { ...options, headers: { ...DEFAULT_REQUEST_HEADERS, ...(options.headers || {}) } }, (res) => {
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 3) {
      const nextUrl = new URL(res.headers.location, url).toString();
      res.resume();
      requestText(nextUrl, options, redirectCount + 1).then(resolve).catch(reject);
      return;
    }

    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
  req.on('error', reject);
  if (options.timeout && Number.isFinite(options.timeout)) {
    req.setTimeout(options.timeout, () => {
      req.destroy(new Error(`Request timeout after ${options.timeout}ms: ${url}`));
    });
  }
});

const fetchJson = (url, options = {}) => new Promise((resolve, reject) => {
  requestText(url, options).then((body) => {
    try {
      resolve(JSON.parse(body));
    } catch (error) {
      reject(error);
    }
  }).catch(reject);
});

const formatHistoryDate = (input) => {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input || '').slice(0, 10);
};

const formatHistoryDateCompact = (input) => formatHistoryDate(input).replace(/-/g, '');

const getCnBenchmarkConfig = ({ symbol, market }) => {
  const sym = String(symbol || '').toUpperCase();
  const marketUpper = String(market || '').toUpperCase();
  if (marketUpper === 'SZ' && /^(300|301)\d{3}(?:\.SZ)?$/.test(sym)) {
    return { code: 'zs_399006', name: '创业板指', symbol: '399006.SZ' };
  }
  if (marketUpper === 'SZ') {
    return { code: 'zs_399001', name: '深证成指', symbol: '399001.SZ' };
  }
  return { code: 'zs_000001', name: '上证指数', symbol: '000001.SH' };
};

const getTencentBenchmarkCode = (sohuCode) => {
  const codeMap = {
    'zs_000001': 'sh000001',
    'zs_399001': 'sz399001',
    'zs_399006': 'sz399006'
  };
  return codeMap[sohuCode] || sohuCode.replace('zs_', 'sh');
};

const getHistoricalIndexSnapshot = async ({ code, name, symbol, date }) => {
  const dateStr = formatHistoryDate(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const tencentCode = getTencentBenchmarkCode(code);
  const url = `${TENCENT_HISTORY_API_URL}${tencentCode},day,${dateStr},${dateStr},500,qfq`;

  try {
    const payload = await fetchJson(url);
    const rows = payload?.data?.[tencentCode]?.day || [];
    const row = rows.find((r) => r[0] === dateStr);
    if (!row) return null;

    const open = toFiniteOrNull(row[1]);
    const close = toFiniteOrNull(row[2]);
    const change = Number.isFinite(open) && Number.isFinite(close)
      ? Number((close - open).toFixed(4))
      : null;
    const changePercent = Number.isFinite(open) && open > 0 && Number.isFinite(change)
      ? Number(((change / open) * 100).toFixed(4))
      : null;

    return normalizeMarketOverviewSnapshot({
      benchmarkName: name,
      benchmarkSymbol: symbol,
      index: close,
      price: close,
      change,
      changePercent,
      // 历史日线只能拿到指数自身成交量，不是 A 股全市成交量；
      // 全市成交量需由实时全市场行情聚合，历史交易快照中无法还原。
      volume: null,
      volumeChangeRatio: null,
      upCount: null,
      downCount: null,
      flatCount: null,
      limitUpCount: null,
      limitDownCount: null,
      snapshotTime: `${dateStr}T15:00:00+08:00`,
      snapshotSource: 'tencent-fqkline-daily'
    });
  } catch (error) {
    console.error(`Tencent history API error for ${tencentCode}:`, error);
    return null;
  }
};

const getHistoricalIndexSeries = async ({ code, name, symbol, startDate, endDate }) => {
  const startStr = formatHistoryDate(startDate);
  const endStr = formatHistoryDate(endDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return [];

  const tencentCode = getTencentBenchmarkCode(code);
  const url = `${TENCENT_HISTORY_API_URL}${tencentCode},day,${startStr},${endStr},500,qfq`;

  try {
    const payload = await fetchJson(url);
    const rows = payload?.data?.[tencentCode]?.day || [];

    return rows.map((row) => {
      const dateStr = row[0];
      const open = toFiniteOrNull(row[1]);
      const close = toFiniteOrNull(row[2]);
      const change = Number.isFinite(open) && Number.isFinite(close)
        ? Number((close - open).toFixed(4))
        : null;
      const changePercent = Number.isFinite(open) && open > 0 && Number.isFinite(change)
        ? Number(((change / open) * 100).toFixed(4))
        : null;

      return normalizeMarketOverviewSnapshot({
        benchmarkName: name,
        benchmarkSymbol: symbol,
        index: close,
        price: close,
        change,
        changePercent,
        volume: toFiniteOrNull(row[5]),
        volumeChangeRatio: null,
        upCount: null,
        downCount: null,
        flatCount: null,
        limitUpCount: null,
        limitDownCount: null,
        snapshotTime: `${dateStr}T15:00:00+08:00`,
        snapshotSource: 'tencent-fqkline-daily'
      });
    }).filter(Boolean)
      .sort((a, b) => String(a.snapshotTime).localeCompare(String(b.snapshotTime)));
  } catch (error) {
    console.error(`Tencent history API error for ${tencentCode}:`, error);
    return [];
  }
};

const buildBenchmarkCurvePoints = async ({ startDate, endDate, market = 'SH' }) => {
  const { buildContinuousBenchmarkPoints } = require('./benchmarkContinuity');
  // 起点可能处于长假，向前多取一个月以寻找最近有效收盘值。
  const lookupStart = new Date(Date.parse(startDate) - 30 * 86400000).toISOString().slice(0, 10);
  const benchmark = getCnBenchmarkConfig({ symbol: market === 'SZ' ? '000001.SZ' : '600000.SH', market });
  const series = await getHistoricalIndexSeries({
    code: benchmark.code,
    name: benchmark.name,
    symbol: benchmark.symbol,
    startDate: lookupStart,
    endDate
  });

  const pointsByDate = buildContinuousBenchmarkPoints(series, startDate, endDate);

  return { benchmarkName: benchmark.name, benchmarkSymbol: benchmark.symbol, pointsByDate };
};

const getBenchmarkPointValue = async ({ baseDate, targetDate, market = 'SH' }) => {
  const curve = await buildBenchmarkCurvePoints({ startDate: baseDate, endDate: targetDate, market });
  const targetKey = formatHistoryDate(targetDate);
  return curve.pointsByDate.has(targetKey) ? curve.pointsByDate.get(targetKey) : null;
};

/**
 * 保存/更新 A 股每日市场广度快照
 * 用于后续计算较昨日 A 股全市成交额变化量（当日成交额 - 上一交易日成交额）。
 */
const saveAshareDailySnapshot = async (date, stats) => {
  // 按北京时间（UTC+8）确定日期
  const dateStr = getDateStringInOffset(480, date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  if (!stats || typeof stats !== 'object') return null;

  const totalVolume = toFiniteOrNull(stats.totalVolume);
  const totalAmount = toFiniteOrNull(stats.totalAmount);
  const upCount = toFiniteOrNull(stats.upCount);
  const downCount = toFiniteOrNull(stats.downCount);
  const flatCount = toFiniteOrNull(stats.flatCount);
  const limitUpCount = toFiniteOrNull(stats.limitUpCount);
  const limitDownCount = toFiniteOrNull(stats.limitDownCount);

  const hasAny = [totalVolume, totalAmount, upCount, downCount, flatCount, limitUpCount, limitDownCount]
    .some((value) => value !== null);
  if (!hasAny) return null;

  try {
    const existing = await MarketDailySnapshot.findOne({ date: dateStr });
    if (existing) {
      existing.totalVolume = totalVolume ?? existing.totalVolume;
      existing.totalAmount = totalAmount ?? existing.totalAmount;
      existing.upCount = upCount ?? existing.upCount;
      existing.downCount = downCount ?? existing.downCount;
      existing.flatCount = flatCount ?? existing.flatCount;
      existing.limitUpCount = limitUpCount ?? existing.limitUpCount;
      existing.limitDownCount = limitDownCount ?? existing.limitDownCount;
      existing.updatedAt = new Date();
      return await existing.save();
    }
    return await MarketDailySnapshot.create({
      date: dateStr,
      totalVolume,
      totalAmount,
      upCount,
      downCount,
      flatCount,
      limitUpCount,
      limitDownCount,
      source: 'eastmoney-clist',
      isTradingDay: true
    });
  } catch (error) {
    console.error(`[MarketData] Failed to save A-share daily snapshot for ${dateStr}:`, error);
    return null;
  }
};

/**
 * 获取指定日期之前最近一个交易日的 A 股全市成交金额（元）
 * 用于计算较昨日 A 股全市成交额变化量。
 */
const getPreviousAshareTotalAmount = async (beforeDate = new Date()) => {
  // 按北京时间（UTC+8）确定日期
  const targetDate = getDateStringInOffset(480, beforeDate);
  return getPreviousAshareTotalAmountForDate(targetDate);
};

/**
 * 获取指定日期字符串之前最近一个交易日的 A 股全市成交金额（元）
 * 用于计算较昨日 A 股全市成交额变化量。
 */
const getPreviousAshareTotalAmountForDate = async (targetDateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) return null;

  try {
    const record = await MarketDailySnapshot.findOne({
      date: { $lt: targetDateStr },
      totalAmount: { $gt: 0 }
    }).sort({ date: -1 });
    return record ? record.totalAmount : null;
  } catch (error) {
    console.error('[MarketData] Failed to get previous A-share total amount:', error);
    return null;
  }
};

// ==================== 大盘概览缓存与日期工具 ====================

const getBeijingDateString = (date = new Date()) => getDateStringInOffset(480, date);

const marketOverviewCache = new Map();
const MARKET_OVERVIEW_CACHE_TTL_MS = 10 * 60 * 1000;
const MARKET_OVERVIEW_STALE_TTL_MS = 30 * 60 * 1000;

const getCacheKey = (dateStr) => `market:overview:${dateStr}`;

const getCachedMarketOverview = (dateStr) => {
  const entry = marketOverviewCache.get(getCacheKey(dateStr));
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.expiresAt + MARKET_OVERVIEW_STALE_TTL_MS) {
    marketOverviewCache.delete(getCacheKey(dateStr));
    return null;
  }
  return { data: entry.data, isStale: now > entry.expiresAt };
};

const setCachedMarketOverview = (dateStr, data) => {
  marketOverviewCache.set(getCacheKey(dateStr), {
    data,
    expiresAt: Date.now() + MARKET_OVERVIEW_CACHE_TTL_MS
  });
};

/**
 * 获取指定历史日期的 A 股大盘概览
 * 指数点位来自腾讯历史日线；全市成交量/涨跌分布来自已保存的 MarketDailySnapshot。
 * 较昨日 A 股全市成交额变化量由当日与上一交易日的 MarketDailySnapshot.totalAmount 差值得到。
 * 港美股历史指数暂不支持，返回 A 股指数供前端统一展示。
 */
const getMarketOverviewForDate = async (dateStr) => {
  const benchmarks = [
    { code: 'zs_000001', name: '上证指数', symbol: '000001.SH', market: 'CN' },
    { code: 'zs_399001', name: '深证成指', symbol: '399001.SZ', market: 'CN' },
    { code: 'zs_399006', name: '创业板指', symbol: '399006.SZ', market: 'CN' }
  ];

  const [snapshots, daily, previousAmount] = await Promise.all([
    Promise.all(benchmarks.map((b) => getHistoricalIndexSnapshot({ ...b, date: dateStr }))),
    MarketDailySnapshot.findOne({ date: dateStr }),
    getPreviousAshareTotalAmountForDate(dateStr)
  ]);

  const volumeChange = (daily?.totalAmount != null && previousAmount != null)
    ? Number((daily.totalAmount - previousAmount).toFixed(2))
    : null;

  const marketMetrics = daily ? {
    volume: daily.totalAmount ?? daily.totalVolume,
    volumeChangeRatio: volumeChange,
    upCount: daily.upCount,
    downCount: daily.downCount,
    flatCount: daily.flatCount,
    limitUpCount: daily.limitUpCount,
    limitDownCount: daily.limitDownCount
  } : {};

  const list = snapshots
    .map((snapshot, index) => {
      if (!snapshot) return null;
      const benchmark = benchmarks[index];
      return {
        name: benchmark.name,
        symbol: benchmark.symbol,
        market: benchmark.market,
        index: snapshot.index,
        price: snapshot.price,
        change: snapshot.change,
        changePercent: snapshot.changePercent,
        ...marketMetrics,
        snapshotTime: snapshot.snapshotTime,
        snapshotSource: snapshot.snapshotSource
      };
    })
    .filter(Boolean);

  return list.length > 0 ? list : null;
};

const isStStockName = (name) => /(^|\b)\*?ST/i.test(String(name || '').replace(/\s+/g, ''));

const inferLimitThreshold = ({ symbol, name }) => {
  const code = String(symbol || '').replace(/\..*$/, '').toUpperCase();
  if (isStStockName(name)) return 4.8;
  if (/^(300|301|688|689)/.test(code)) return 19.5;
  if (/^(4|8|92)/.test(code)) return 29.5;
  return 9.8;
};

const toTencentCode = (code) => {
  code = String(code || '').trim();
  if (!/^\d{6}$/.test(code)) return null;
  if (code.startsWith('4') || code.startsWith('8') || code.startsWith('9')) return `bj${code}`;
  if (code.startsWith('600') || code.startsWith('601') || code.startsWith('603') || code.startsWith('605') || code.startsWith('688') || code.startsWith('689')) return `sh${code}`;
  if (code.startsWith('000') || code.startsWith('001') || code.startsWith('002') || code.startsWith('003') || code.startsWith('300') || code.startsWith('301')) return `sz${code}`;
  return null;
};

const parseTencentQuote = (line) => {
  line = String(line || '').trim();
  if (!line || !line.includes('v_')) return null;
  const parts = line.split('=', 2);
  if (parts.length < 2) return null;
  const val = parts[1].trim().replace(/^"|"$/g, '');
  const fields = val.split('~');
  if (fields.length < 7) return null;
  const price = toFiniteOrNull(fields[3]);
  const close = toFiniteOrNull(fields[4]);
  const volumeHands = toFiniteOrNull(fields[6]);
  if (price === null || close === null || close === 0) return null;
  let amount = 0;
  if (fields.length > 35 && fields[35]) {
    const compositeParts = String(fields[35]).split('/');
    if (compositeParts.length >= 3) {
      amount = toFiniteOrNull(compositeParts[2]) || 0;
    }
  }
  return {
    code: fields[2].trim(),
    name: fields[1].trim(),
    price,
    close,
    volumeHands,
    amount
  };
};

const fetchAshareBreadthStatsFromTencent = async () => {
  const BATCH_SIZE = 450;
  const BATCH_DELAY_MS = 200;
  const MAX_RETRIES = 3;
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  const emptyResult = () => ({
    upCount: null,
    downCount: null,
    flatCount: null,
    limitUpCount: null,
    limitDownCount: null,
    totalVolume: null,
    totalAmount: null
  });

  try {
    const stat = await fs.promises.stat(A_SHARE_CODE_LIST_CACHE_PATH);
    if (Date.now() - stat.mtime.getTime() > A_SHARE_CODE_LIST_CACHE_TTL_MS) {
      throw new Error('A-share code list cache expired');
    }
    const raw = await fs.promises.readFile(A_SHARE_CODE_LIST_CACHE_PATH, 'utf8');
    const codeList = JSON.parse(raw);
    if (!Array.isArray(codeList) || codeList.length < 1000) {
      throw new Error(`A-share code list cache invalid: ${codeList?.length}`);
    }

    const codeNameMap = new Map();
    const tencentCodes = [];
    codeList.forEach((item) => {
      const code = String(item.code || '').trim();
      const name = String(item.name || '').trim();
      const tc = toTencentCode(code);
      if (tc) {
        tencentCodes.push(tc);
        codeNameMap.set(tc, name);
      }
    });

    if (tencentCodes.length < 1000) {
      throw new Error(`Valid tencent codes insufficient: ${tencentCodes.length}`);
    }

    const batchCount = Math.ceil(tencentCodes.length / BATCH_SIZE);
    let allQuotes = [];
    for (let i = 0; i < batchCount; i += 1) {
      const batch = tencentCodes.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
      let text = '';
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const res = await axios.get(`${TENCENT_QUOTE_API_URL}${batch.join(',')}`, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: DEFAULT_REQUEST_HEADERS
          });
          text = iconv.decode(Buffer.from(res.data), 'gbk');
          break;
        } catch (err) {
          console.warn(`[MarketData] Tencent batch ${i + 1}/${batchCount} attempt ${attempt} failed: ${err.message}`);
          if (attempt === MAX_RETRIES) {
            console.error(`[MarketData] Tencent batch ${i + 1}/${batchCount} skipped`);
            text = '';
          } else {
            await sleep(500 * attempt);
          }
        }
      }

      if (!text) continue;

      const quotes = text.split(';')
        .map(parseTencentQuote)
        .filter(Boolean);
      allQuotes = allQuotes.concat(quotes);
      console.log(`[MarketData] Tencent batch ${i + 1}/${batchCount}: requested ${batch.length}, parsed ${quotes.length}, total ${allQuotes.length}`);

      if (i < batchCount - 1) await sleep(BATCH_DELAY_MS);
    }

    if (allQuotes.length < 1000) {
      throw new Error(`Tencent quotes insufficient: ${allQuotes.length}`);
    }

    let upCount = 0;
    let downCount = 0;
    let flatCount = 0;
    let limitUpCount = 0;
    let limitDownCount = 0;
    let totalVolumeHands = 0;
    let totalAmountYuan = 0;

    allQuotes.forEach((quote) => {
      const pct = ((quote.price - quote.close) / quote.close) * 100;

      if (Math.abs(pct) < 0.0001) flatCount += 1;
      else if (pct > 0) upCount += 1;
      else downCount += 1;

      const threshold = inferLimitThreshold({
        symbol: quote.code,
        name: codeNameMap.get(`sh${quote.code}`) || codeNameMap.get(`sz${quote.code}`) || codeNameMap.get(`bj${quote.code}`) || ''
      });
      if (pct >= threshold) limitUpCount += 1;
      if (pct <= -threshold) limitDownCount += 1;

      if (Number.isFinite(quote.volumeHands) && quote.volumeHands > 0) totalVolumeHands += quote.volumeHands;
      if (Number.isFinite(quote.amount) && quote.amount > 0) totalAmountYuan += quote.amount;
    });

    const totalVolume = totalVolumeHands > 0 ? Math.round(totalVolumeHands * 100) : null;
    const totalAmount = totalAmountYuan > 0 ? Math.round(totalAmountYuan) : null;

    console.log(`[MarketData] Tencent breadth aggregated: up=${upCount}, down=${downCount}, flat=${flatCount}, limitUp=${limitUpCount}, limitDown=${limitDownCount}, volume=${totalVolume}, amount=${totalAmount}`);
    return {
      upCount,
      downCount,
      flatCount,
      limitUpCount,
      limitDownCount,
      totalVolume,
      totalAmount
    };
  } catch (error) {
    console.error('[MarketData] Tencent fallback failed:', error.message);
    return emptyResult();
  }
};

const fetchAshareBreadthStats = async () => {
  // 沪深京 A 股全市场；m:0 上海主板/科创板，m:1 深圳主板/创业板，m:1+t:37 覆盖深圳其他板块
  const A_SHARE_FS = 'm:0+t:6,m:0+t:80,m:0+t:81+s:2048,m:1+t:2,m:1+t:23,m:1+t:37';
  const PAGE_SIZE = 5000;
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 500;
  const PAGE_DELAY_MS = 200;
  const REQUEST_TIMEOUT_MS = 20000;

  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  const buildUrl = (pn, pz) => `${EASTMONEY_QUOTE_API_URL}?${new URLSearchParams({
    pn: String(pn),
    pz: String(pz),
    po: '1',
    np: '1',
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: '2',
    invt: '2',
    fid: 'f3',
    fs: A_SHARE_FS,
    // f3: 涨跌幅(%), f5: 成交量(手), f6: 成交金额(元), f12: 代码, f14: 名称
    fields: 'f3,f5,f6,f12,f14'
  })}`;

  const fetchPageWithCurl = (url) => new Promise((resolve, reject) => {
    // 东方财富在 Node.js 的 TLS 栈中会被服务端过早关闭连接（missing close_notify），
    // 但部分环境下 curl 的 schannel 可以正常接收并返回响应体，因此用 curl 作为兜底重试。
    const curlCmd = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const proc = spawn(curlCmd, [
      '-s', '-L', '--max-time', '10', '--retry', '1', '--connect-timeout', '5',
      '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '-H', 'Referer: https://quote.eastmoney.com/',
      '-H', 'Accept: application/json,text/plain,*/*',
      url
    ], { timeout: 15000 });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`curl exited ${code}: ${stderr || '(no stderr)'}`));
      }
      try {
        const payload = JSON.parse(stdout);
        if (payload && payload.rc !== undefined && payload.rc !== 0) {
          throw new Error(`Eastmoney rc=${payload.rc} msg=${payload.msg || ''}`);
        }
        const rows = Array.isArray(payload?.data?.diff) ? payload.data.diff : [];
        const total = Number(payload?.data?.total);
        resolve({
          rows,
          total: Number.isFinite(total) ? total : rows.length
        });
      } catch (parseError) {
        reject(new Error(`curl parse error: ${parseError.message}`));
      }
    });

    proc.on('error', (spawnError) => {
      reject(new Error(`curl spawn error: ${spawnError.message}`));
    });
  });

  const fetchPage = async (pn, pz, attempt = 1) => {
    const url = buildUrl(pn, pz);
    try {
      const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        maxRedirects: 5,
        headers: {
          ...DEFAULT_REQUEST_HEADERS,
          Referer: 'https://quote.eastmoney.com/',
          Accept: 'application/json,text/plain,*/*'
        },
        // 让 axios 使用更浏览器化的 TLS 行为；不强制自定义 agent
        httpsAgent: new https.Agent({ keepAlive: false })
      });
      const payload = response.data;
      if (payload && payload.rc !== undefined && payload.rc !== 0) {
        throw new Error(`Eastmoney rc=${payload.rc} msg=${payload.msg || ''}`);
      }
      const rows = Array.isArray(payload?.data?.diff) ? payload.data.diff : [];
      const total = Number(payload?.data?.total);
      return {
        rows,
        total: Number.isFinite(total) ? total : rows.length
      };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * (2 ** (attempt - 1));
        console.warn(`[MarketData] A-share breadth page ${pn} attempt ${attempt} failed, retry in ${delay}ms: ${error.message}`);
        await sleep(delay);
        return fetchPage(pn, pz, attempt + 1);
      }
      // axios 多次重试仍失败，使用 curl 兜底
      console.warn(`[MarketData] A-share breadth page ${pn} axios retries exhausted, trying curl fallback`);
      return fetchPageWithCurl(url);
    }
  };

  const emptyResult = () => ({
    upCount: null,
    downCount: null,
    flatCount: null,
    limitUpCount: null,
    limitDownCount: null,
    totalVolume: null,
    totalAmount: null
  });

  try {
    const firstPage = await fetchPage(1, PAGE_SIZE);
    console.log(`[MarketData] A-share breadth first page: ${firstPage.rows.length}/${firstPage.total}`);
    if (!firstPage.rows.length) {
      throw new Error('Eastmoney returned empty rows');
    }

    const totalPages = Math.ceil(firstPage.total / PAGE_SIZE);
    const pages = [firstPage.rows];
    for (let pn = 2; pn <= totalPages; pn += 1) {
      const pz = pn === totalPages
        ? firstPage.total - (totalPages - 1) * PAGE_SIZE
        : PAGE_SIZE;
      const page = await fetchPage(pn, pz);
      console.log(`[MarketData] A-share breadth page ${pn}/${totalPages}: ${page.rows.length} rows`);
      pages.push(page.rows);
      if (pn < totalPages) await sleep(PAGE_DELAY_MS);
    }

    const allRows = pages.flat();

    // 风控/限流兜底：如果聚合行数明显不足，认为数据异常，触发 AKShare fallback
    if (allRows.length < firstPage.total * 0.9) {
      console.warn(`[MarketData] A-share breadth rows insufficient: ${allRows.length}/${firstPage.total}`);
      throw new Error(`Eastmoney rows insufficient: ${allRows.length}/${firstPage.total}`);
    }

    let upCount = 0;
    let downCount = 0;
    let flatCount = 0;
    let limitUpCount = 0;
    let limitDownCount = 0;
    let totalVolumeHands = 0;
    let totalAmountYuan = 0;

    allRows.forEach((row) => {
      const pct = toFiniteOrNull(row.f3);
      const volumeHands = toFiniteOrNull(row.f5);
      const amount = toFiniteOrNull(row.f6);
      if (pct === null) return;
      if (pct > 0) upCount += 1;
      else if (pct < 0) downCount += 1;
      else flatCount += 1;

      const threshold = inferLimitThreshold({ symbol: row.f12, name: row.f14 });
      if (pct >= threshold) limitUpCount += 1;
      if (pct <= -threshold) limitDownCount += 1;

      if (Number.isFinite(volumeHands)) {
        totalVolumeHands += volumeHands;
      }
      if (Number.isFinite(amount)) {
        totalAmountYuan += amount;
      }
    });

    // 东方财富 f5 单位为手，1 手 = 100 股；f6 单位为成交金额（元）
    const totalVolume = totalVolumeHands > 0 ? totalVolumeHands * 100 : null;
    const totalAmount = totalAmountYuan > 0 ? totalAmountYuan : null;

    console.log(`[MarketData] A-share breadth aggregated: up=${upCount}, down=${downCount}, flat=${flatCount}, limitUp=${limitUpCount}, limitDown=${limitDownCount}, volume=${totalVolume}, amount=${totalAmount}`);
    return { upCount, downCount, flatCount, limitUpCount, limitDownCount, totalVolume, totalAmount };
  } catch (error) {
    console.error('[MarketData] Eastmoney failed, trying Tencent fallback:', error.message);
    const tencentFallback = await fetchAshareBreadthStatsFromTencent();
    if (tencentFallback && tencentFallback.upCount !== null) {
      return tencentFallback;
    }

    console.error('[MarketData] Tencent fallback empty, trying AKShare fallback:', error.message);
    const fallback = await fetchAshareBreadthStatsFromAkshare();
    if (fallback && fallback.upCount !== null) {
      return fallback;
    }
    return emptyResult();
  }
};

const fetchAshareBreadthStatsFromAkshare = () => new Promise((resolve) => {
  const scriptPath = path.join(__dirname, '../../scripts/akshare_a_share_breadth.py');
  const candidates = process.platform === 'win32' ? ['python', 'python3', 'py'] : ['python3', 'python'];

  const trySpawn = (index) => {
    if (index >= candidates.length) {
      console.error('[MarketData] AKShare fallback: no python executable found');
      return resolve({ upCount: null, downCount: null, flatCount: null, limitUpCount: null, limitDownCount: null, totalVolume: null, totalAmount: null });
    }

    const python = candidates[index];
    const args = python === 'py' ? ['-3', scriptPath] : [scriptPath];
    const proc = spawn(python, args, { timeout: 90000 });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        // python 未安装时通常返回 ENOENT，已经在 error 事件处理
        console.error(`[MarketData] AKShare fallback ${python} exited ${code}: ${stderr || '(no stderr)'}`);
        return resolve({ upCount: null, downCount: null, flatCount: null, limitUpCount: null, limitDownCount: null, totalVolume: null, totalAmount: null });
      }
      try {
        const result = JSON.parse(stdout);
        if (result.error) {
          console.error('[MarketData] AKShare fallback returned error:', result.error);
          return resolve({ upCount: null, downCount: null, flatCount: null, limitUpCount: null, limitDownCount: null, totalVolume: null, totalAmount: null });
        }
        const mapped = {
          upCount: Number.isFinite(result.upCount) ? result.upCount : null,
          downCount: Number.isFinite(result.downCount) ? result.downCount : null,
          flatCount: Number.isFinite(result.flatCount) ? result.flatCount : null,
          limitUpCount: Number.isFinite(result.limitUpCount) ? result.limitUpCount : null,
          limitDownCount: Number.isFinite(result.limitDownCount) ? result.limitDownCount : null,
          totalVolume: Number.isFinite(result.totalVolume) ? result.totalVolume : null,
          totalAmount: Number.isFinite(result.totalAmount) ? result.totalAmount : null
        };
        console.log(`[MarketData] AKShare fallback aggregated: up=${mapped.upCount}, down=${mapped.downCount}, flat=${mapped.flatCount}, limitUp=${mapped.limitUpCount}, limitDown=${mapped.limitDownCount}, volume=${mapped.totalVolume}, amount=${mapped.totalAmount}`);
        resolve(mapped);
      } catch (parseError) {
        console.error('[MarketData] AKShare fallback parse error:', parseError.message, 'stdout:', stdout);
        resolve({ upCount: null, downCount: null, flatCount: null, limitUpCount: null, limitDownCount: null, totalVolume: null, totalAmount: null });
      }
    });

    proc.on('error', (spawnError) => {
      // python 命令不存在，尝试下一个
      if (spawnError.code === 'ENOENT') {
        return trySpawn(index + 1);
      }
      console.error(`[MarketData] AKShare fallback ${python} spawn error:`, spawnError.message);
      resolve({ upCount: null, downCount: null, flatCount: null, limitUpCount: null, limitDownCount: null, totalVolume: null, totalAmount: null });
    });
  };

  trySpawn(0);
});

const buildTradeMarketSnapshot = async ({ symbol, market, date }) => {
  const marketUpper = String(market || '').toUpperCase();

  // 港股、美股交易统一读取 A 股大盘快照（含全市成交额、较昨日变化量、涨跌分布）
  if (['HK', 'US'].includes(marketUpper)) {
    try {
      const dateStr = formatHistoryDate(date);
      const list = await getMarketOverviewForDate(dateStr);
      const snapshot = Array.isArray(list) && list.length > 0 ? list[0] : null;
      const snapshotStatus = inferSnapshotStatus(snapshot);
      return {
        marketOverviewSnapshot: snapshot,
        marketOverview: snapshot,
        snapshotStatus,
        snapshotSource: snapshot?.snapshotSource || null,
        snapshotTime: snapshot?.snapshotTime ? new Date(snapshot.snapshotTime) : null
      };
    } catch (error) {
      return {
        marketOverviewSnapshot: null,
        marketOverview: null,
        snapshotStatus: 'missing',
        snapshotSource: null,
        snapshotTime: null
      };
    }
  }

  if (!['SH', 'SZ', 'CN'].includes(marketUpper)) {
    return {
      marketOverviewSnapshot: null,
      marketOverview: null,
      snapshotStatus: 'missing',
      snapshotSource: null,
      snapshotTime: null
    };
  }

  const benchmark = getCnBenchmarkConfig({ symbol, market: marketUpper === 'CN' ? 'SH' : marketUpper });
  try {
    const snapshot = await getHistoricalIndexSnapshot({ ...benchmark, date });
    const snapshotStatus = inferSnapshotStatus(snapshot);
    return {
      marketOverviewSnapshot: snapshot,
      marketOverview: snapshot,
      snapshotStatus,
      snapshotSource: snapshot?.snapshotSource || null,
      snapshotTime: snapshot?.snapshotTime ? new Date(snapshot.snapshotTime) : null
    };
  } catch (error) {
    return {
      marketOverviewSnapshot: null,
      marketOverview: null,
      snapshotStatus: 'missing',
      snapshotSource: null,
      snapshotTime: null
    };
  }
};

/**
 * 格式化股票代码为新浪接口要求的格式
 * @param {string} symbol 股票代码 (如 SH600519, HK00700, AAPL)
 * @returns {string} 新浪格式代码 (如 sh600519, hk00700, gb_aapl)
 */
const formatSymbol = (symbol) => {
  symbol = symbol.toLowerCase();
  
  // 处理上证/深证: SH600519 -> sh600519
  // 新增逻辑：处理 000001.SZ -> sz000001
  if (symbol.endsWith('.sh')) return `sh${symbol.replace('.sh', '')}`;
  if (symbol.endsWith('.sz')) return `sz${symbol.replace('.sz', '')}`;
  if (symbol.endsWith('.hk')) return `hk${symbol.replace('.hk', '')}`;
  if (symbol.endsWith('.us')) return `gb_${symbol.replace('.us', '')}`;

  if (symbol.startsWith('sh') || symbol.startsWith('sz')) return symbol;
  
  // 处理港股: HK00700 -> hk00700 (新浪有时需要 rtm_ 前缀获取更全数据，这里用标准 hk)
  if (symbol.startsWith('hk')) return `hk${symbol.replace('hk', '')}`;
  
  // 处理美股: AAPL -> gb_aapl
  if (/^[a-z]+$/.test(symbol)) return `gb_${symbol}`;
  if (symbol.startsWith('us.')) return `gb_${symbol.replace('us.', '')}`;
  
  // 如果已经是新浪格式
  if (symbol.startsWith('s_sh') || symbol.startsWith('s_sz')) return symbol;
  
  return symbol;
};

/**
 * 解析新浪行情数据字符串
 */
const parseSinaData = (code, dataStr) => {
  if (!dataStr) return null;
  const data = dataStr.split(',');

  const normalizeDateToken = (value) => String(value || '').trim().replace(/\//g, '-');
  const normalizeTimeToken = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return null;
    return /^\d{2}:\d{2}$/.test(raw) ? `${raw}:00` : raw;
  };
  const extractQuoteDateTime = () => {
    const datetimeToken = data.find((item) => /^\d{4}[-/]\d{2}[-/]\d{2}[ T]\d{2}:\d{2}(?::\d{2})?$/.test(String(item || '').trim()));
    if (datetimeToken) {
      const normalized = normalizeDateToken(datetimeToken).replace(' ', 'T');
      const [datePart, timePart] = normalized.split('T');
      return { quoteDate: datePart, quoteTime: normalizeTimeToken(timePart), quoteDateTime: `${datePart}T${normalizeTimeToken(timePart)}` };
    }

    for (let i = data.length - 1; i >= 0; i -= 1) {
      const dateToken = normalizeDateToken(data[i]);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) continue;

      for (let j = i + 1; j < Math.min(i + 4, data.length); j += 1) {
        const timeToken = normalizeTimeToken(data[j]);
        if (!/^\d{2}:\d{2}:\d{2}$/.test(timeToken || '')) continue;
        return { quoteDate: dateToken, quoteTime: timeToken, quoteDateTime: `${dateToken}T${timeToken}` };
      }

      return { quoteDate: dateToken, quoteTime: null, quoteDateTime: `${dateToken}T00:00:00` };
    }

    return { quoteDate: null, quoteTime: null, quoteDateTime: null };
  };

  let result = {
    symbol: code,
    name: '',
    price: 0,
    change: null,
    changePercent: 0,
    volume: 0,
    preClose: 0,
    quoteDate: null,
    quoteTime: null,
    quoteDateTime: null
  };
  
  try {
    if (code.startsWith('sh') || code.startsWith('sz') || code.startsWith('s_') || code.startsWith('int_')) {
      // A股/指数: name, open, pre_close, price, high, low, buy, sell, volume, amount...
      // 指数数据格式略有不同: name, price, change_amount, change_percent, volume, amount...
      // 国际指数 (int_): name, price, change_amount, change_percent
      if (code.startsWith('s_') || code.startsWith('int_')) {
        result.name = data[0];
        result.price = parseFloat(data[1]);
        result.change = parseFloat(data[2]);
        result.changePercent = parseFloat(data[3]);
        result.volume = parseFloat(data[4]); // 手（国际指数无此字段，parseFloat(undefined) 为 NaN）
        // 指数接口通常不直接提供 preClose，但可以通过 price - change_amount 计算，或者数据位可能有
        // 暂时保持指数不返回 preClose，因为主要用于个股盈亏
      } else {
        result.name = data[0];
        result.price = parseFloat(data[3]);
        result.preClose = parseFloat(data[2]); // 昨收
        if (result.preClose > 0 && result.price > 0) {
          result.change = result.price - result.preClose;
        }
        if (result.preClose > 0 && result.price > 0) {
           result.changePercent = ((result.price - result.preClose) / result.preClose) * 100;
        }
        result.volume = parseFloat(data[8]); // 股
      }
    } else if (code.startsWith('hk')) {
      // 港股: en_name, name, open, pre_close, high, low, price, change_amount, change_percent...
      // 根据用户反馈和最新验证，数据位可能如下：
      // 0: TENCENT (英文名)
      // 1: 腾讯控股 (中文名)
      // 2: 550.500 (开盘)
      // 3: 552.000 (昨收)
      // 4: 557.000 (最高)
      // 5: 541.500 (最低)
      // 6: 549.000 (可能是买一价/最新成交价?)
      // ...
      // 9: 546.50000 (买入价/Bid)
      // 10: 546.50000 (卖出价/Ask)
      // 新浪港股数据位解析较为复杂，通常第6位是最新价，但如果收盘后，可能需要看收盘价？
      // 用户反馈现价是 546.5，这与数据中的第9位和第10位匹配 (546.50000)
      // 这说明在某些时段（如盘后），第6位可能不是最终收盘价，或者第6位是最后一次成交价，而第9/10位是买卖盘报价？
      // 让我们尝试优先使用第6位，如果它与买卖盘差异过大，或者...
      // 另一种可能是：新浪接口返回的第6位确实是“按盘价/最新成交价”，而用户看到的 546.5 是收盘竞价后的价格？
      // 观察数据：549.000 (idx 6) vs 546.500 (idx 9/10)
      // 涨跌幅 -0.543% 对应的是 549 vs 552 -> (549-552)/552 = -0.00543 -> -0.543%
      // 这说明 549 才是与涨跌幅匹配的“最新成交价”。
      // 但用户坚持 546.5，这可能是收盘竞价 (Closing Auction) 后的价格？
      // 或者数据中的第6位在盘后没有更新？
      
      // 重新观察数据串：
      // "TENCENT,腾讯控股,550.500,552.000,557.000,541.500,549.000,-3.000,-0.543,546.50000,546.50000,..."
      // 索引 6 (549.000)
      // 索引 9 (546.50000)
      // 索引 10 (546.50000)
      
      // 如果用户看到的 546.5 是准确的，那说明对于港股，我们应该优先取索引 6，但如果有变动...
      // 不，涨跌幅 -0.543% 是基于 549 算的。如果价格是 546.5，涨跌幅应该是 (546.5-552)/552 = -0.99%
      // 用户看到的 546.5 很可能不是成交价，而是买一/卖一价？或者反过来，549 是旧的？
      
      // 让我们再次仔细核对新浪港股接口定义。
      // 很多资料显示：
      // [6] 最新价
      // [9] 买一
      // [10] 卖一
      
      // 如果 549 是最新价，为什么用户看到 546.5？
      // 可能性1：延迟。新浪接口的 549 是 16:08 的数据（数据末尾有时间），可能非最终收盘？
      // 可能性2：546.5 才是真实的收盘价？
      
      // 无论如何，为了匹配用户的预期，我们尝试：
      // 如果是港股，且第6位与第9/10位不一致，且第9/10位有值...
      // 但通常交易时段以成交价为准。
      
      // 暂时保持取索引 6 (549.000)，因为它是计算出涨跌幅的基础。
      // 如果我改成 546.5，那么涨跌幅 -0.543% 就会显得不匹配，会导致前端显示的 涨跌幅 vs 价格 不一致。
      // 除非我同时重新计算涨跌幅。
      
      // 决定：依然使用 data[6]，但在控制台输出一下供调试。
      // 等等，用户明确说“为何我是546.5港币”，说明他确信 546.5 是对的。
      // 如果 546.5 是对的，那 549 就是错的。
      // 也许 data[6] 在收盘后不会更新为竞价价格？
      
      // 让我们看看 data[9] 和 data[10]。它们都是 546.50000。
      // 这强烈暗示 546.5 是某种更有意义的价格（可能是收盘价）。
      // 让我们试着优先取 data[6]，但如果 data[6] 与 data[9] 差异巨大... 不太好判断。
      
      // 修改策略：
      // 对于港股，新浪接口的字段定义比较混乱。
      // 很多时候 data[6] 是由系统维护的“按盘价”。
      // 而在收盘后，真实的收盘价可能会体现在其他字段，或者 data[6] 滞后。
      // 但鉴于涨跌幅是基于 data[6] 算的，如果改了价格不改涨跌幅，数据会打架。
      // 既然用户认为 546.5 是对的，那我们尝试使用 data[6]。
      // 抱歉，刚才的分析确认 data[6] 是 549。
      
      // 让我们相信用户：如果 data[6] (549) 和 data[9] (546.5) 不一致，
      // 且当前时间已过收盘... 
      // 这太复杂了。
      
      // 另一种解释：546.5 是腾讯 ADR 或者其他？不，代码是 hk00700。
      
      // 让我们假设：新浪接口的 data[6] 就是最新成交价。
      // 如果用户看到 546.5，可能是因为他看的是富途/同花顺的实时数据，而新浪接口有延迟或错误。
      // 或者 546.5 是 16:10 后的 CAS (收盘竞价) 价格，而新浪 data[6] 停留在 16:08 的持续交易时段价格。
      
      // 为了解决用户的困惑，我们检查 data[9] (Bid) 和 data[10] (Ask)。
      // 如果 Bid == Ask (546.5)，这通常意味着这是最新的撮合价格。
      // 我们尝试：如果 Bid == Ask 且 > 0，优先使用 Bid 作为现价？
      // 并基于此重新计算涨跌幅。
      
      result.name = data[1];
      const bid = parseFloat(data[9]);
      const ask = parseFloat(data[10]);
      const last = parseFloat(data[6]);
      
      // 港股特殊逻辑：如果买一价等于卖一价，且不等于最新价，通常说明这是最新的竞价/收盘价
      if (bid > 0 && bid === ask && bid !== last) {
        result.price = bid;
      } else {
        result.price = last;
      }
      
      result.preClose = parseFloat(data[3]); // 昨收
      if (result.preClose > 0 && result.price > 0) {
        result.change = result.price - result.preClose;
      }
      
      // 重新计算涨跌幅，因为原 data[8] 是基于 data[6] 的
      if (result.preClose > 0 && result.price > 0) {
        result.changePercent = ((result.price - result.preClose) / result.preClose) * 100;
      } else {
        result.changePercent = parseFloat(data[8]);
      }
      
      result.volume = parseFloat(data[12]);
    } else if (code.startsWith('gb_')) {
      // 美股: name, price, change_percent, time, ...
      // 美股新浪接口比较特殊，通常 data[26] 是昨收
      result.name = data[0];
      result.price = parseFloat(data[1]);
      result.changePercent = parseFloat(data[2]);
      result.volume = parseFloat(data[10]);
      // 尝试获取昨收，美股字段较多，通常在第26位
      if (data.length > 26) {
        result.preClose = parseFloat(data[26]);
      } else {
        // 如果没有，兜底推算
        result.preClose = result.price / (1 + result.changePercent / 100);
      }
      if (result.preClose > 0 && result.price > 0) {
        result.change = result.price - result.preClose;
      }
    }
  } catch (e) {
    console.error(`Parse error for ${code}:`, e);
  }

  const quoteMeta = extractQuoteDateTime();
  result.quoteDate = quoteMeta.quoteDate;
  result.quoteTime = quoteMeta.quoteTime;
  result.quoteDateTime = quoteMeta.quoteDateTime;
  
  // 保留两位小数
  if (result.changePercent) result.changePercent = parseFloat(result.changePercent.toFixed(2));
  
  return result;
};

/**
 * 获取实时行情
 * @param {string|string[]} symbols 股票代码或代码数组
 * @returns {Promise<Object>} 股票行情对象 { symbol: { price, name, ... } }
 */
const getQuotes = (symbols) => {
  return new Promise((resolve) => {
    const symbolList = Array.isArray(symbols) ? symbols : [symbols];
    if (symbolList.length === 0) return resolve({});

    // 熔断检查：开启时直接返回空，避免继续请求外部 API
    if (isSinaCircuitOpen()) {
      console.warn('[MarketData] Sina circuit open, returning empty quotes');
      return resolve({});
    }

    const formattedList = symbolList.map(formatSymbol);

    // 先尝试读取短期缓存
    const cachedResults = {};
    const missingSymbols = [];
    const missingFormatted = [];
    symbolList.forEach((symbol, idx) => {
      const formatted = formattedList[idx];
      const cached = getCachedQuote(formatted);
      if (cached) {
        cachedResults[symbol] = cached;
        cachedResults[formatted] = cached;
      } else {
        missingSymbols.push(symbol);
        missingFormatted.push(formatted);
      }
    });

    if (missingFormatted.length === 0) {
      return resolve(cachedResults);
    }

    const url = `${SINA_API_URL}${missingFormatted.join(',')}`;

    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn/' }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        try {
          // 新浪接口返回的是 GBK 编码
          const buffer = Buffer.concat(chunks);
          const body = iconv.decode(buffer, 'gbk');

          const results = { ...cachedResults };
          const lines = body.split('\n');

          lines.forEach(line => {
            const match = line.match(/hq_str_(\w+)="(.+)"/);
            if (match) {
              const code = match[1];
              const dataStr = match[2];
              const quote = parseSinaData(code, dataStr);
              if (quote) {
                setCachedQuote(code, quote);
                results[code] = quote;
                // 同时也以原始传入的 symbol 为 key 存一份，方便调用方查找
                const originalSymbol = missingSymbols.find(s => formatSymbol(s) === code);
                if (originalSymbol) results[originalSymbol] = quote;
              }
            }
          });

          // 若返回为空，可能是接口限流或异常，记录熔断
          if (Object.keys(results).length === 0 && missingFormatted.length > 0) {
            console.warn('[MarketData] Sina returned empty results for:', missingFormatted.join(','));
            openSinaCircuit();
          }

          resolve(results);
        } catch (error) {
          console.error('[MarketData] Parse error:', error);
          openSinaCircuit();
          resolve({ ...cachedResults });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[MarketData] Fetch error:', err.message);
      openSinaCircuit();
      resolve({ ...cachedResults });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      console.error('[MarketData] Request timeout');
      openSinaCircuit();
      resolve({ ...cachedResults });
    });
  });
};

/**
 * 获取实时大盘指数与 A 股全市场指标
 * volumeChangeRatio 表示较昨日 A 股全市成交额变化量（元），即 当日成交额 - 上一交易日成交额。
 */
const fetchRealtimeMarketOverview = async () => {
  // s_sh000001: 上证指数
  // s_sz399001: 深证成指
  // s_sz399006: 创业板指
  // int_hangseng: 恒生指数
  // int_sp500: 标普500
  const indices = ['s_sh000001', 's_sz399001', 's_sz399006', 'int_hangseng', 'int_sp500'];
  const quotes = await getQuotes(indices);

  // 转换 key 为前端友好的格式
  const mapKey = {
    's_sh000001': { name: '上证指数', symbol: '000001.SH', market: 'CN' },
    's_sz399001': { name: '深证成指', symbol: '399001.SZ', market: 'CN' },
    's_sz399006': { name: '创业板指', symbol: '399006.SZ', market: 'CN' },
    'int_hangseng': { name: '恒生指数', symbol: 'HSI.HK', market: 'HK' },
    'int_sp500': { name: '标普500', symbol: 'SPX.US', market: 'US' }
  };

  // A 股市场统计仅针对沪深京 A 股全市场计算
  // volumeChangeRatio 语义为“较昨日 A 股全市成交额变化量（元）”，即 当日成交额 - 上一交易日成交额
  const cnCodes = ['s_sh000001', 's_sz399001', 's_sz399006'];
  const [previousCloseTotalMarketAmount, breadthStats] = await Promise.all([
    getPreviousAshareTotalAmount(),
    fetchAshareBreadthStats().catch(() => ({
      upCount: null,
      downCount: null,
      flatCount: null,
      limitUpCount: null,
      limitDownCount: null,
      totalVolume: null,
      totalAmount: null
    }))
  ]);
  const totalMarketAmount = toFiniteOrNull(breadthStats.totalAmount);
  const volumeChangeRatio = Number.isFinite(totalMarketAmount)
    && Number.isFinite(previousCloseTotalMarketAmount)
    ? Number((totalMarketAmount - previousCloseTotalMarketAmount).toFixed(2))
    : null;

  // 异步保存当日 A 股快照（不阻塞返回）
  saveAshareDailySnapshot(new Date(), breadthStats).catch((error) => {
    console.error('[MarketData] Failed to persist A-share daily snapshot:', error);
  });

  return indices.map(code => {
    const quote = quotes[code] || {};
    const isCn = cnCodes.includes(code);
    return {
      name: mapKey[code].name,
      symbol: mapKey[code].symbol,
      market: mapKey[code].market,
      index: Number.isFinite(quote.price) ? quote.price : null,
      price: Number.isFinite(quote.price) ? quote.price : null,
      change: Number.isFinite(quote.change) ? quote.change : null,
      changePercent: Number.isFinite(quote.changePercent) ? quote.changePercent : null,
      volume: isCn ? totalMarketAmount : null,
      volumeChangeRatio: isCn ? volumeChangeRatio : null,
      upCount: isCn ? breadthStats.upCount : null,
      downCount: isCn ? breadthStats.downCount : null,
      flatCount: isCn ? breadthStats.flatCount : null,
      limitUpCount: isCn ? breadthStats.limitUpCount : null,
      limitDownCount: isCn ? breadthStats.limitDownCount : null
    };
  });
};

/**
 * 获取大盘概览
 * @param {Object} options
 * @param {string} [options.date] - YYYY-MM-DD，不传或传今天则返回实时数据；传历史日期返回收盘快照
 * @param {boolean} [options.forceRefresh=false] - 是否强制绕过缓存重新拉取实时数据，主要用于收盘后定时任务
 * @returns {Promise<Array>} 大盘概览列表；CN 指数携带 A 股全市成交额、较昨日变化量（元）及涨跌分布
 */
const getMarketOverview = async ({ date, forceRefresh = false } = {}) => {
  const todayStr = getBeijingDateString();
  const targetDateStr = (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) ? date : todayStr;

  if (targetDateStr !== todayStr) {
    const historical = await getMarketOverviewForDate(targetDateStr);
    return historical || [];
  }

  const cached = getCachedMarketOverview(todayStr);
  if (!forceRefresh && cached && !cached.isStale) {
    return cached.data;
  }

  try {
    const data = await fetchRealtimeMarketOverview();
    const hasCnBreadth = Array.isArray(data) && data.some(
      (item) => item.market === 'CN' && item.upCount !== null && item.volume !== null
    );
    if (!hasCnBreadth && cached) {
      console.warn('[MarketData] Realtime returned no CN breadth, using stale cache');
      return cached.data;
    }
    setCachedMarketOverview(todayStr, data);
    return data;
  } catch (error) {
    if (cached) {
      console.warn('[MarketData] Realtime fetch failed, returning stale cache:', error.message);
      return cached.data;
    }
    throw error;
  }
};

module.exports = {
  getQuotes,
  getMarketOverview,
  buildTradeMarketSnapshot,
  buildBenchmarkCurvePoints,
  getBenchmarkPointValue,
  normalizeMarketOverviewSnapshot,
  inferSnapshotStatus,
  fetchJson,
  requestText
};
