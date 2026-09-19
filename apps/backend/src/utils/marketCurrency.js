const { normalizeSymbol } = require('./symbol');

const CNY_MARKETS = new Set(['CN', 'SH', 'SZ', 'A', 'A股']);
const HKD_MARKETS = new Set(['HK', '港股']);
const USD_MARKETS = new Set(['US', '美股']);

const getCurrencyForMarket = ({ symbol, market } = {}) => {
  const normalizedMarket = String(market || '').trim().toUpperCase();
  const normalizedSymbol = normalizeSymbol(symbol);
  const symbolMarket = normalizedSymbol.split('.').pop();
  const resolvedMarket = normalizedMarket || symbolMarket;

  if (CNY_MARKETS.has(resolvedMarket)) return 'CNY';
  if (HKD_MARKETS.has(resolvedMarket)) return 'HKD';
  if (USD_MARKETS.has(resolvedMarket)) return 'USD';

  throw new RangeError(`Unsupported market for currency: ${market || symbol || ''}`);
};

module.exports = { getCurrencyForMarket };
