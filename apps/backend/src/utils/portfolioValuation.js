const { normalizeCashBalances, toMoney } = require('./money');
const { BEIJING_OFFSET_MINUTES, getDateStringInOffset } = require('./datetime');

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
const normalizeDate = (value) => isDateString(value) ? String(value).trim() : null;

const findQuote = (quotes, symbol) => {
  if (!quotes || typeof quotes !== 'object') return null;
  return quotes[symbol] || Object.values(quotes).find((quote) => quote?.symbol === symbol) || null;
};

// A price is fresh only when the upstream quote explicitly identifies it with this business day.
// Older dated quotes can still be shown as a stale last-close; undated data is not trustworthy enough to value.
const getQuotePrice = (quote, asOfDate) => {
  if (!quote) return null;

  const hasRealtimePrice = isPositiveNumber(quote.price);
  const price = hasRealtimePrice ? Number(quote.price)
    : isPositiveNumber(quote.close) ? Number(quote.close)
      : null;
  const priceDate = normalizeDate(hasRealtimePrice
    ? (quote.quoteDate || quote.date)
    : (quote.closeDate || quote.quoteDate || quote.date));
  if (price === null || !priceDate || priceDate > asOfDate) return null;

  if (priceDate < asOfDate) {
    return { price, priceDate, source: 'last-close', isStale: true };
  }

  return {
    price,
    priceDate,
    source: !hasRealtimePrice || quote.source === 'close' || quote.isClose === true ? 'close' : 'realtime',
    isStale: false
  };
};

const getFallbackPrice = (holding, fallbackPrices) => {
  const fallback = fallbackPrices?.[holding.symbol];
  const candidates = [
    // lastPriceAt is a cache write timestamp, not a market close date. Never derive a business date from it.
    { price: holding.lastPrice, priceDate: holding.lastPriceDate },
    typeof fallback === 'number'
      ? { price: fallback, priceDate: null }
      : { price: fallback?.price, priceDate: fallback?.date || fallback?.priceDate }
  ]
    .filter((candidate) => isPositiveNumber(candidate.price) && normalizeDate(candidate.priceDate))
    .map((candidate) => ({
      price: Number(candidate.price),
      priceDate: normalizeDate(candidate.priceDate),
      source: 'last-close',
      isStale: true
    }));

  if (candidates.length === 0) return null;

  return candidates.reduce((latest, candidate) => (
    candidate.priceDate > latest.priceDate ? candidate : latest
  ));
};

const getRate = (rates, currency) => {
  const rate = Number(rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (currency === 'CNY' && rate !== 1) return null;
  return rate;
};

const valuatePortfolio = ({
  cashBalances = {},
  holdings = [],
  quotes = {},
  rates = {},
  fallbackPrices = {},
  asOfDate = getDateStringInOffset(BEIJING_OFFSET_MINUTES)
} = {}) => {
  const valuationDate = normalizeDate(asOfDate) || getDateStringInOffset(BEIJING_OFFSET_MINUTES);
  const cashByCurrency = normalizeCashBalances(cashBalances instanceof Map
    ? Object.fromEntries(cashBalances)
    : cashBalances);
  let cashCNY = 0;
  let holdingsMarketValueCNY = 0;
  let hasMissingData = false;
  let hasStalePrice = false;

  Object.entries(cashByCurrency).forEach(([currency, balance]) => {
    if (balance === 0) return;
    const rate = getRate(rates, currency);
    if (rate === null) {
      hasMissingData = true;
      return;
    }
    cashCNY += balance * rate;
  });

  const valuations = holdings.map((holding) => {
    const quotePrice = getQuotePrice(findQuote(quotes, holding.symbol), valuationDate);
    const valuation = quotePrice || getFallbackPrice(holding, fallbackPrices);

    if (!valuation) {
      hasMissingData = true;
      return { symbol: holding.symbol, price: null, priceDate: null, source: 'missing', isStale: false };
    }

    if (valuation.isStale) hasStalePrice = true;

    const quantity = Number(holding.quantity);
    const rate = getRate(rates, String(holding.currency || 'CNY').toUpperCase());
    if (Number.isFinite(quantity) && quantity !== 0) {
      if (rate === null) {
        hasMissingData = true;
      } else {
        holdingsMarketValueCNY += quantity * valuation.price * rate;
      }
    }

    return {
      symbol: holding.symbol,
      price: valuation.price,
      priceDate: valuation.priceDate,
      source: valuation.source,
      isStale: valuation.isStale
    };
  });

  cashCNY = toMoney(cashCNY);
  holdingsMarketValueCNY = toMoney(holdingsMarketValueCNY);
  const totalAssetsCNY = toMoney(cashCNY + holdingsMarketValueCNY);

  return {
    cashByCurrency,
    cashCNY,
    holdingsMarketValueCNY,
    totalAssetsCNY,
    valuations,
    quality: hasMissingData ? 'partial' : hasStalePrice ? 'stale' : 'complete'
  };
};

module.exports = { valuatePortfolio };