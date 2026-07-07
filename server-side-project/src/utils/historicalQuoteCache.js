const HistoricalQuote = require('../models/HistoricalQuote');
const { getStockHistoricalQuotes } = require('./historicalQuotes');

const getDatesBetween = (startDateStr, endDateStr) => {
  const dates = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
};

const groupBy = (arr, key) => {
  return arr.reduce((acc, item) => {
    const k = item[key];
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
};

/**
 * 批量获取某窗口内多只股票的历史行情
 * 优先读取 HistoricalQuote 缓存，缺失的批量请求外部接口并写入缓存
 *
 * @param {string[]} symbols - 标准化后的股票代码列表
 * @param {string} startDate - 开始日期 YYYY-MM-DD
 * @param {string} endDate - 结束日期 YYYY-MM-DD
 * @returns {Map<string, Object>} date -> { symbol -> quote }
 */
const getQuotesForRange = async (symbols, startDate, endDate) => {
  if (!symbols || symbols.length === 0 || !startDate || !endDate || startDate > endDate) {
    return new Map();
  }

  const quoteMap = new Map(); // date -> { symbol -> quote }
  const dateRange = getDatesBetween(startDate, endDate);

  // 读取缓存
  const cached = await HistoricalQuote.find({
    symbol: { $in: symbols },
    date: { $gte: startDate, $lte: endDate }
  }).lean();

  for (const q of cached) {
    if (!quoteMap.has(q.date)) quoteMap.set(q.date, {});
    quoteMap.get(q.date)[q.symbol] = q;
  }

  const cachedBySymbol = groupBy(cached, 'symbol');

  // 对每只股票补抓缺失区间
  for (const symbol of symbols) {
    const cachedDates = new Set((cachedBySymbol[symbol] || []).map(q => q.date));
    const missingDates = dateRange.filter(d => !cachedDates.has(d));
    if (missingDates.length === 0) continue;

    try {
      const quotes = await getStockHistoricalQuotes(symbol, startDate, endDate);
      const quotesByDate = new Map(quotes.map(q => [q.date, q]));

      const bulkOps = [];
      for (const date of dateRange) {
        const q = quotesByDate.get(date);
        if (!q || !q.close) continue;

        bulkOps.push({
          updateOne: {
            filter: { symbol, date },
            update: {
              $set: {
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
                volume: q.volume,
                amount: q.amount,
                change: q.change,
                changePercent: q.changePercent,
                source: 'tencent',
                fetchedAt: new Date()
              }
            },
            upsert: true
          }
        });

        if (!quoteMap.has(date)) quoteMap.set(date, {});
        quoteMap.get(date)[symbol] = q;
      }

      if (bulkOps.length > 0) {
        await HistoricalQuote.bulkWrite(bulkOps, { ordered: false });
      }
    } catch (error) {
      console.error(`[HistoricalQuoteCache] failed to fetch ${symbol} ${startDate}~${endDate}:`, error.message);
    }
  }

  return quoteMap;
};

module.exports = {
  getQuotesForRange
};
