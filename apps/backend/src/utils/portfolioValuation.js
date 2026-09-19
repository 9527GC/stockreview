const { normalizeCashBalances, toMoney } = require('./money');

const isPositiveNumber = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

const normalizeDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
};

const findQuote = (quotes, symbol) => {
  if (!quotes || typeof quotes !== 'object') return null;
  return quotes[symbol] || Object.values(quotes).find((quote) => quote?.symbol === symbol) || null;
};

const getQuotePrice = (quote) => {
  if (!quote) return null;

  if (isPositiveNumber(quote.close)) {
    return {
      price: Number(quote.close),
      priceDate: normalizeDate(quote.closeDate || quote.quoteDate || quote.date),
      source: 'close',
      isStale: false
    };
  }

  if (isPositiveNumber(quote.price)) {
    return {
      price: Number(quote.price),
      priceDate: normalizeDate(quote.quoteDate || quote.date),
      source: quote.source === 'close' || quote.isClose === true ? 'close' : 'realtime',
      isStale: false
    };
  }

  return null;
};

const getFallbackPrice = (holding, fallbackPrices) => {
  const fallback = fallbackPrices?.[holding.symbol];
  const candidates = [
    {
      price: holding.lastPrice,
      priceDate: holding.lastPriceDate || holding.lastPriceAt
    },
    typeof fallback === 'number'
      ? { price: fallback, priceDate: null }
      : { price: fallback?.price, priceDate: fallback?.date || fallback?.priceDate }
  ]
    .filter((candidate) => isPositiveNumber(candidate.price))
    .map((candidate) => ({
      price: Number(candidate.price),
      priceDate: normalizeDate(candidate.priceDate),
      source: 'last-close',
      isStale: true
    }));

  if (candidates.length === 0) return null;

  return candidates.reduce((latest, candidate) => {
    if (!latest.priceDate || (candidate.priceDate && candidate.priceDate > latest.priceDate)) {
      return candidate;
    }
    return latest;
  });
};

const getRate = (rates, currency) => {
  const rate = Number(rates?.[currency]);
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (currency === 'CNY' && rate !== 1) return null;
  return rate;
};

const valuatePortfolio = ({ cashBalances = {}, holdings = [], quotes = {}, rates = {}, fallbackPrices = {} } = {}) => {
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
    const quotePrice = getQuotePrice(findQuote(quotes, holding.symbol));
    const valuation = quotePrice || getFallbackPrice(holding, fallbackPrices);

    if (!valuation) {
      hasMissingData = true;
      return {
        symbol: holding.symbol,
        price: null,
        priceDate: null,
        source: 'missing',
        isStale: false
      };
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