const { Trade, Holding } = require('../models/Trade');
const { getRates } = require('./currency');
const { getQuotes } = require('./marketData');
const { getDateStringInOffset, getDayRangeInOffset, parseDateInOffset } = require('./datetime');
const { normalizeSymbol } = require('./symbol');
const { round2, calculateDailyProfitFromPosition } = require('./pnl');

const inferMarketFromSymbol = (symbol) => {
  const normalized = normalizeSymbol(symbol);
  if (normalized.endsWith('.HK')) return 'HK';
  if (normalized.endsWith('.US')) return 'US';
  return 'CN';
};

const getTimeZoneOffsetMs = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
};

const zonedLocalDateTimeToUtc = (dateTime, timeZone) => {
  const raw = String(dateTime || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcMs = utcGuessMs - getTimeZoneOffsetMs(new Date(utcGuessMs), timeZone);
  utcMs = utcGuessMs - getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  return new Date(utcMs);
};

const getQuoteDateKeyInOffset = (quote, symbol, offsetMinutes = 480) => {
  if (!quote) return null;
  const market = inferMarketFromSymbol(symbol);
  const quoteDateTime = quote.quoteDateTime || (
    quote.quoteDate
      ? `${quote.quoteDate}T${quote.quoteTime || '00:00:00'}`
      : null
  );
  if (!quoteDateTime) return null;

  if (market === 'US') {
    const utcDate = zonedLocalDateTimeToUtc(quoteDateTime, 'America/New_York');
    return utcDate ? getDateStringInOffset(offsetMinutes, utcDate) : null;
  }

  const localDate = parseDateInOffset(quoteDateTime.replace('T', ' '), offsetMinutes);
  return Number.isNaN(localDate.getTime()) ? null : getDateStringInOffset(offsetMinutes, localDate);
};

const calculateTotalDailyProfitCNY = async (userId, offsetMinutes = 480) => {
  const [holdings, rates] = await Promise.all([
    Holding.find({ userId }),
    getRates()
  ]);

  const { start, end } = getDayRangeInOffset(offsetMinutes);
  const todayTrades = await Trade.find({ userId, date: { $gte: start, $lt: end } });
  const todayDateKey = getDateStringInOffset(offsetMinutes);

  const holdingsBySymbol = new Map(holdings.map(h => [normalizeSymbol(h.symbol), h]));
  const tradesBySymbol = new Map();
  todayTrades.forEach(t => {
    const key = normalizeSymbol(t.symbol);
    if (!tradesBySymbol.has(key)) tradesBySymbol.set(key, []);
    tradesBySymbol.get(key).push(t);
  });

  const symbols = Array.from(new Set([
    ...holdings.map(h => normalizeSymbol(h.symbol)),
    ...todayTrades.map(t => normalizeSymbol(t.symbol))
  ])).filter(Boolean);

  if (symbols.length === 0) return 0;

  const quotes = await getQuotes(symbols);

  let total = 0;
  symbols.forEach(symbol => {
    const holding = holdingsBySymbol.get(symbol);
    const posToday = holding ? holding.quantity : 0;
    const tradesForSymbol = tradesBySymbol.get(symbol) || [];
    const quote = quotes[symbol] || Object.values(quotes).find(q => q.symbol === symbol);
    const quoteDateKey = getQuoteDateKeyInOffset(quote, symbol, offsetMinutes);

    // Only count quotes that belong to "today" in Beijing time unless the user really traded today.
    if (tradesForSymbol.length === 0 && quoteDateKey !== todayDateKey) {
      return;
    }

    const dailyProfit = calculateDailyProfitFromPosition({ posToday, quote, todayTrades: tradesForSymbol });
    const currency = holding?.currency || tradesForSymbol?.[0]?.currency || 'CNY';
    const rate = rates[currency] || 1;
    total += (Number(dailyProfit) || 0) * rate;
  });

  return round2(total);
};

module.exports = {
  calculateTotalDailyProfitCNY,
  getDateStringInOffset,
  getQuoteDateKeyInOffset,
  inferMarketFromSymbol
};
