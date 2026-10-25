const { fetchJson } = require('./marketData');
const { normalizeSymbol } = require('./symbol');

const SOHU_HISTORY_API_URL = 'https://q.stock.sohu.com/hisHq?code=';
const TENCENT_HISTORY_API_URL = 'https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=';
const EASTMONEY_HISTORY_API_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

const formatHistoryDate = (input) => {
  if (input instanceof Date) return input.toISOString().slice(0, 10);
  return String(input || '').slice(0, 10);
};

const formatHistoryDateCompact = (input) => formatHistoryDate(input).replace(/-/g, '');

/* ────── 代码转换 ────── */

const getSohuStockCode = (symbol) => {
  const sym = String(symbol || '').toUpperCase();
  if (sym.endsWith('.SH') || sym.endsWith('.SZ')) return `cn_${sym.replace(/\.SH$|\.SZ$/, '')}`;
  if (sym.startsWith('SH')) return `cn_${sym.replace('SH', '')}`;
  if (sym.startsWith('SZ')) return `cn_${sym.replace('SZ', '')}`;
  if (sym.endsWith('.HK')) return `hk_${sym.replace('.HK', '')}`;
  if (sym.startsWith('HK')) return `hk_${sym.replace('HK', '')}`;
  return sym.toLowerCase();
};

const getTencentStockCode = (symbol) => {
  const norm = normalizeSymbol(symbol);
  // A股
  const mA = norm.match(/^(\d+)\.(SH|SZ)$/);
  if (mA) return `${mA[2].toLowerCase()}${mA[1]}`;
  // 港股
  const mHK = norm.match(/^(\d+)\.HK$/);
  if (mHK) return `hk${mHK[1]}`;
  return null;
};

const getEastmoneySecid = (symbol) => {
  const norm = normalizeSymbol(symbol);
  const mA = norm.match(/^(\d+)\.(SH|SZ)$/);
  if (mA) {
    const marketCode = mA[2] === 'SH' ? '1' : '0';
    return `${marketCode}.${mA[1]}`;
  }
  // 港股通
  const mHK = norm.match(/^(\d+)\.HK$/);
  if (mHK) return `116.${mHK[1]}`;
  return null;
};

/* ────── Provider: 搜狐 ────── */

const fetchSohuHistoricalQuotes = async (symbol, startDate, endDate) => {
  const sohuCode = getSohuStockCode(symbol);
  const startCompact = formatHistoryDateCompact(startDate);
  const endCompact = formatHistoryDateCompact(endDate);

  if (!/^\d{8}$/.test(startCompact) || !/^\d{8}$/.test(endCompact)) {
    return [];
  }

  const url = `${SOHU_HISTORY_API_URL}${sohuCode}&start=${startCompact}&end=${endCompact}`;
  const payload = await fetchJson(url, { timeout: 10000 });

  if (!Array.isArray(payload) || !payload[0]?.hq) {
    return [];
  }

  return payload[0].hq.map((row) => ({
    date: row[0],
    open: parseFloat(row[1]),
    close: parseFloat(row[2]),
    change: parseFloat(row[3]),
    changePercent: parseFloat(String(row[4] || '').replace('%', '')),
    low: parseFloat(row[5]),
    high: parseFloat(row[6]),
    volume: parseFloat(row[7]),
    turnover: parseFloat(row[8])
  })).filter(item => item.close > 0);
};

/* ────── Provider: 腾讯 ────── */

const fetchTencentHistoricalQuotes = async (symbol, startDate, endDate) => {
  const tencentCode = getTencentStockCode(symbol);
  if (!tencentCode) return [];

  const startStr = formatHistoryDate(startDate);
  const endStr = formatHistoryDate(endDate);
  // 腾讯非复权 K 线，字段顺序：date, open, close, high, low, volume
  const url = `${TENCENT_HISTORY_API_URL}${tencentCode},day,${startStr},${endStr},500`;

  const payload = await fetchJson(url, { timeout: 10000 });
  const rows = payload?.data?.[tencentCode]?.day || [];

  return rows.map((row) => ({
    date: row[0],
    open: parseFloat(row[1]),
    close: parseFloat(row[2]),
    high: parseFloat(row[3]),
    low: parseFloat(row[4]),
    volume: parseFloat(row[5])
  })).filter(item => item.close > 0);
};

/* ────── Provider: 东方财富 ────── */

const fetchEastmoneyHistoricalQuotes = async (symbol, startDate, endDate) => {
  const secid = getEastmoneySecid(symbol);
  if (!secid) return [];

  const startCompact = formatHistoryDateCompact(startDate);
  const endCompact = formatHistoryDateCompact(endDate);

  const url = `${EASTMONEY_HISTORY_API_URL}?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=0&beg=${startCompact}&end=${endCompact}`;

  const payload = await fetchJson(url, { timeout: 10000 });
  const klines = payload?.data?.klines || [];
  if (klines.length === 0) return [];

  return klines.map((line) => {
    const parts = line.split(',');
    return {
      date: parts[0],
      open: parseFloat(parts[1]),
      close: parseFloat(parts[2]),
      low: parseFloat(parts[3]),
      high: parseFloat(parts[4]),
      volume: parseFloat(parts[5]),
      amount: parseFloat(parts[6]),
      changePercent: parseFloat(parts[8]),
      change: parseFloat(parts[9])
    };
  }).filter(item => item.close > 0);
};

/* ────── 多源聚合（按优先级尝试） ────── */

const PROVIDERS = [
  { name: 'tencent', fetch: fetchTencentHistoricalQuotes },
  { name: 'eastmoney', fetch: fetchEastmoneyHistoricalQuotes },
  { name: 'sohu', fetch: fetchSohuHistoricalQuotes }
];

const getStockHistoricalQuotes = async (symbol, startDate, endDate) => {
  for (const provider of PROVIDERS) {
    try {
      const quotes = await provider.fetch(symbol, startDate, endDate);
      if (quotes.length > 0) {
        return quotes;
      }
    } catch (error) {
      console.error(`[QuoteProvider:${provider.name}] failed for ${symbol}:`, error.message);
    }
  }
  return [];
};

const getStockHistoricalQuoteOnDate = async (symbol, date) => {
  const quotes = await getStockHistoricalQuotes(symbol, date, date);
  return quotes.length > 0 ? quotes[0] : null;
};

const getStockHistoricalQuotesMap = async (symbols, date) => {
  const result = {};

  const promises = symbols.map(async (symbol) => {
    const quote = await getStockHistoricalQuoteOnDate(symbol, date);
    if (quote) {
      result[symbol] = quote;
    }
  });

  await Promise.all(promises);
  return result;
};

module.exports = {
  getStockHistoricalQuotes,
  getStockHistoricalQuoteOnDate,
  getStockHistoricalQuotesMap,
  formatHistoryDate
};
