const { requestText, fetchJson } = require('../utils/marketData');

const MOCK_SUGGESTIONS = [
  { symbol: 'SH600519', name: '贵州茅台', market: 'SH' },
  { symbol: 'SZ000001', name: '平安银行', market: 'SZ' },
  { symbol: 'HK00700', name: '腾讯控股', market: 'HK' },
  { symbol: 'AAPL', name: 'Apple Inc.', market: 'US' },
  { symbol: 'BABA', name: 'Alibaba', market: 'US' },
  { symbol: 'HK09988', name: '阿里巴巴', market: 'HK' }
];

const KNOWN_MARKETS = new Set(['SH', 'SZ', 'BJ', 'HK', 'US']);

const normalizeSearchSymbol = (code, market) => {
  if (!code || !market) return null;
  const upperMarket = String(market).toUpperCase();
  const upperCode = String(code).toUpperCase().trim();

  if (!KNOWN_MARKETS.has(upperMarket)) return null;

  if (upperMarket === 'SH' || upperMarket === 'SZ' || upperMarket === 'BJ') {
    return `${upperCode}.${upperMarket}`;
  }
  if (upperMarket === 'HK') {
    return `${upperCode.padStart(5, '0')}.HK`;
  }
  if (upperMarket === 'US') {
    return `${upperCode}.US`;
  }
  return null;
};

const deduplicateSuggestions = (suggestions) => {
  const seen = new Set();
  return suggestions.filter((item) => {
    if (!item || !item.symbol) return false;
    const key = `${item.symbol}|${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'OTCBB', 'OTC', 'PNK', 'US', 'USEX']);
const US_CLASSIFY = new Set(['USSTOCK', 'OTCBB', 'USEX', 'US', 'US ETF']);

const inferMarketFromEastmoney = (item) => {
  const jys = String(item.JYS || '').toUpperCase();
  const classify = String(item.Classify || '').toUpperCase();
  const typeName = String(item.SecurityTypeName || '');
  const quoteId = String(item.QuoteID || '');
  const marketType = String(item.MarketType || '');

  if (jys === 'HK' || classify === 'HK') return 'HK';

  if (US_EXCHANGES.has(jys) || US_EXCHANGES.has(classify)) return 'US';
  if (US_CLASSIFY.has(classify)) return 'US';
  if (typeName.includes('美') || typeName.includes('粉单')) return 'US';

  // 东方财富 QuoteID 规则：1.xxx 为沪市，0.xxx 为深市；基金/ETF 也能据此区分
  if (quoteId.startsWith('1.')) return 'SH';
  if (quoteId.startsWith('0.')) return 'SZ';

  if (typeName.includes('沪')) return 'SH';
  if (typeName.includes('深')) return 'SZ';
  if (typeName.includes('北')) return 'BJ';

  // A 股兜底：未识别到沪/深/北时归为 SH
  if (classify === 'ASTOCK') return 'SH';
  // 基金（含场内 ETF）兜底归为 A 股，因 A 股基金/ETF 使用沪深代码
  if (classify === 'FUND' || typeName.includes('基金')) return 'SH';

  return null;
};

// 腾讯 Smartbox：支持 A 股、港股、美股
const searchTencent = async (keyword) => {
  const encoded = encodeURIComponent(keyword);
  const url = `https://smartbox.gtimg.cn/s3/?t=all&q=${encoded}&v=2`;
  const body = await requestText(url, {
    headers: { Referer: 'https://finance.qq.com/' }
  });

  // 响应格式：v_hint="N;data"，N 为数量，data 为 code~name~pinyin~market~type;...
  const match = body.match(/v_hint="(\d+);([^"]*)"/);
  if (!match) return [];

  const count = parseInt(match[1], 10);
  const dataStr = match[2];
  if (!count || !dataStr) return [];

  const items = dataStr.split(';').filter(Boolean);
  const marketMap = {
    sh: 'SH',
    sz: 'SZ',
    hk: 'HK',
    us: 'US'
  };

  return items.map((item) => {
    const parts = item.split('~');
    if (parts.length < 4) return null;
    // 腾讯返回两种格式：
    // 1. 股票：code~name~pinyin~market~type
    // 2. 基金/ETF：market~code~name~pinyin~type（market 字段前置，且 name 在第三位）
    const firstPart = String(parts[0]).toLowerCase();
    let code, name, rawMarket;
    if (['sh', 'sz', 'hk', 'us'].includes(firstPart)) {
      // ETF/基金格式：market~code~name~pinyin~type
      if (parts.length < 5) return null;
      code = parts[1];
      name = parts[2];
      rawMarket = parts[0];
    } else {
      // 股票格式：code~name~pinyin~market~type
      code = parts[0];
      name = parts[1];
      rawMarket = parts[3];
    }
    const mappedMarket = marketMap[String(rawMarket).toLowerCase()] || rawMarket.toUpperCase();
    const symbol = normalizeSearchSymbol(code, mappedMarket);
    if (!symbol) return null;
    return { symbol, name: name.trim(), market: mappedMarket };
  }).filter(Boolean);
};

// 东方财富 Suggest：支持 A 股、港股、美股
const searchEastmoney = async (keyword) => {
  const encoded = encodeURIComponent(keyword);
  const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encoded}&type=14&count=10`;
  const payload = await fetchJson(url, {
    headers: { Referer: 'https://quote.eastmoney.com/' }
  });

  const data = payload?.QuotationCodeTable?.Data;
  if (!Array.isArray(data)) return [];

  return data.map((item) => {
    const code = item.Code;
    const market = inferMarketFromEastmoney(item);
    if (!market) return null;

    const symbol = normalizeSearchSymbol(code, market);
    if (!symbol) return null;
    return { symbol, name: String(item.Name || '').trim(), market };
  }).filter(Boolean);
};

const searchMock = (keyword) => {
  const lowerKeyword = String(keyword || '').toLowerCase();
  return MOCK_SUGGESTIONS.filter((s) =>
    s.symbol.toLowerCase().includes(lowerKeyword) ||
    s.name.includes(keyword)
  );
};

const searchStock = async (keyword) => {
  if (!keyword || !String(keyword).trim()) {
    return { suggestions: [], source: 'none' };
  }

  const trimmed = String(keyword).trim();

  // 1. 优先腾讯
  try {
    const results = await searchTencent(trimmed);
    if (results.length > 0) {
      return { suggestions: deduplicateSuggestions(results), source: 'tencent' };
    }
  } catch (error) {
    console.error('[StockSearch] Tencent failed:', error.message);
  }

  // 2. 次选东方财富
  try {
    const results = await searchEastmoney(trimmed);
    if (results.length > 0) {
      return { suggestions: deduplicateSuggestions(results), source: 'eastmoney' };
    }
  } catch (error) {
    console.error('[StockSearch] Eastmoney failed:', error.message);
  }

  // 3. Mock 兜底
  return { suggestions: searchMock(trimmed), source: 'mock' };
};

module.exports = {
  searchStock,
  normalizeSearchSymbol
};
