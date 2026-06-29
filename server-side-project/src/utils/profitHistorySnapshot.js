const { Asset } = require('../models/Asset');
const { Trade, Holding } = require('../models/Trade');
const { refreshAssetMarketValue } = require('./assetSnapshot');
const { upsertTodayDailyProfit, getDateStringInOffset } = require('./dailyProfitBackfill');
const { getDayRangeInOffset } = require('./datetime');
const { getQuotes } = require('./marketData');
const { getQuoteDateKeyInOffset } = require('./dailyProfit');

const inferMarket = ({ symbol, marketTag, market }) => {
  const exchange = String(marketTag || market || '').toUpperCase();
  const normalizedSymbol = String(symbol || '').toUpperCase();

  if (exchange === 'HK' || normalizedSymbol.endsWith('.HK')) return 'HK';
  if (exchange === 'US' || normalizedSymbol.endsWith('.US')) return 'US';
  return 'CN';
};

const normalizeMarkets = (markets) => {
  if (!Array.isArray(markets) || markets.length === 0) return [];
  return Array.from(new Set(markets.map((market) => String(market || '').toUpperCase()).filter(Boolean)));
};

const userMatchesMarkets = async (userId, markets, offsetMinutes = 480) => {
  const normalizedMarkets = normalizeMarkets(markets);
  if (normalizedMarkets.length === 0) return true;

  const { start, end } = getDayRangeInOffset(offsetMinutes);
  const [holdings, todayTrades] = await Promise.all([
    Holding.find({ userId }).select('symbol marketTag').lean(),
    Trade.find({ userId, date: { $gte: start, $lt: end } }).select('symbol market').lean()
  ]);

  const matchingHoldings = holdings.filter((entry) => normalizedMarkets.includes(inferMarket(entry)));
  const matchingTrades = todayTrades.filter((entry) => normalizedMarkets.includes(inferMarket(entry)));
  const relevantEntries = [...matchingHoldings, ...matchingTrades];
  if (relevantEntries.length === 0) return false;

  if (matchingTrades.length > 0) return true;

  const symbols = Array.from(new Set(relevantEntries.map((entry) => String(entry.symbol || '').trim()).filter(Boolean)));
  if (symbols.length === 0) return false;

  const quotes = await getQuotes(symbols);
  const todayDateKey = getDateStringInOffset(offsetMinutes);
  return symbols.some((symbol) => {
    const quote = quotes[symbol] || Object.values(quotes).find((item) => item.symbol === symbol);
    return getQuoteDateKeyInOffset(quote, symbol, offsetMinutes) === todayDateKey;
  });
};

const getSnapshotUserIds = async () => {
  const userIds = await Asset.distinct('userId');
  return userIds.filter(Boolean).map((id) => String(id));
};

const snapshotProfitHistoryForUser = async (userId, options = {}) => {
  const { refreshAssets = true, offsetMinutes = 480 } = options;

  if (refreshAssets) {
    await refreshAssetMarketValue(userId);
  }

  const date = await upsertTodayDailyProfit(userId, offsetMinutes);
  return date;
};

const runProfitHistorySnapshotBatch = async (options = {}) => {
  const {
    userIds,
    markets,
    refreshAssets = true,
    offsetMinutes = 480,
    logger = console
  } = options;

  const resolvedUserIds = Array.isArray(userIds) && userIds.length > 0
    ? userIds.map((id) => String(id))
    : await getSnapshotUserIds();

  const result = {
    date: getDateStringInOffset(offsetMinutes),
    markets: normalizeMarkets(markets),
    totalUsers: resolvedUserIds.length,
    successCount: 0,
    skippedCount: 0,
    failedCount: 0,
    failures: []
  };

  for (const userId of resolvedUserIds) {
    try {
      const shouldRun = await userMatchesMarkets(userId, markets, offsetMinutes);
      if (!shouldRun) {
        result.skippedCount += 1;
        logger.info?.(`[profit-history] skip user=${userId} markets=${normalizeMarkets(markets).join(',') || 'ALL'}`);
        continue;
      }

      const snapshotDate = await snapshotProfitHistoryForUser(userId, { refreshAssets, offsetMinutes });
      if (!snapshotDate) {
        result.skippedCount += 1;
        logger.info?.(`[profit-history] skip user=${userId}`);
        continue;
      }

      result.successCount += 1;
      logger.info?.(`[profit-history] snapshotted user=${userId} date=${snapshotDate}`);
    } catch (error) {
      result.failedCount += 1;
      result.failures.push({
        userId,
        message: error.message
      });
      logger.error?.(`[profit-history] failed user=${userId}: ${error.message}`);
    }
  }

  return result;
};

module.exports = {
  getSnapshotUserIds,
  snapshotProfitHistoryForUser,
  runProfitHistorySnapshotBatch
};
