const { backfillDailyProfit, getDateStringInOffset } = require('./dailyProfitBackfill');

/**
 * @deprecated 请使用 backfillDailyProfit（src/utils/dailyProfitBackfill.js）
 * 收益历史已统一迁移到 DailyProfit / DailyRevenue。
 */
const backfillProfitHistory = async (userId, startDateStr, offsetMinutes = 480) => {
  return backfillDailyProfit(userId, startDateStr, offsetMinutes);
};

module.exports = { backfillProfitHistory, getDateStringInOffset };
