const { backfillDailyProfit, upsertTodayDailyProfit, getDateStringInOffset } = require('./dailyProfitBackfill');

/**
 * @deprecated 收益历史已统一迁移到 DailyProfit / DailyRevenue，
 * 本文件仅保留兼容导出，后续请直接使用 src/utils/dailyProfitBackfill.js
 */
module.exports = {
  upsertTodayProfitHistory: upsertTodayDailyProfit,
  backfillProfitHistory: backfillDailyProfit,
  getDateStringInOffset
};
