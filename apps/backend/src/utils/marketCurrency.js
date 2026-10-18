const { normalizeSymbol } = require('./symbol');

const CNY_MARKETS = new Set(['CN', 'SH', 'SZ', 'BJ', '北交所', 'A', 'A股']);
const HKD_MARKETS = new Set(['HK', '港股']);
const USD_MARKETS = new Set(['US', '美股']);

const getCurrencyByMarket = (market) => {
  const normalizedMarket = String(market || '').trim().toUpperCase();
  if (CNY_MARKETS.has(normalizedMarket)) return 'CNY';
  if (HKD_MARKETS.has(normalizedMarket)) return 'HKD';
  if (USD_MARKETS.has(normalizedMarket)) return 'USD';
  return null;
};

const getCurrencyForMarket = ({ symbol, market } = {}) => {
  const normalizedSymbol = normalizeSymbol(symbol);
  const symbolMarket = normalizedSymbol.split('.').pop();
  const symbolCurrency = getCurrencyByMarket(symbolMarket);
  const marketCurrency = getCurrencyByMarket(market);

  if (symbolCurrency && marketCurrency && symbolCurrency !== marketCurrency) {
    throw new RangeError(`Symbol currency ${symbolCurrency} conflicts with market currency ${marketCurrency}`);
  }

  if (symbolCurrency || marketCurrency) return symbolCurrency || marketCurrency;

  throw new RangeError(`Unsupported market for currency: ${market || symbol || ''}`);
};

module.exports = { getCurrencyForMarket };
