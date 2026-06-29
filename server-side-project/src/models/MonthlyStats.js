const mongoose = require('mongoose');

/**
 * 月度统计数据
 * 存储每月的盈亏统计
 */
const monthlyStatsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // 年月：YYYY-MM
  yearMonth: {
    type: String,
    required: true,
    index: true
  },
  // 年份
  year: {
    type: Number,
    required: true
  },
  // 月份
  month: {
    type: Number,
    required: true
  },
  // 总交易天数
  totalTradingDays: {
    type: Number,
    default: 0
  },
  // 盈利天数
  profitDays: {
    type: Number,
    default: 0
  },
  // 亏损天数
  lossDays: {
    type: Number,
    default: 0
  },
  // 持平天数
  breakEvenDays: {
    type: Number,
    default: 0
  },
  // 胜率（盈利天数 / 总交易天数）
  winRate: {
    type: Number,
    default: 0
  },
  // 月度总盈亏金额
  totalProfitAmount: {
    type: Number,
    default: 0
  },
  // 月度总收益率
  totalReturnRate: {
    type: Number,
    default: 0
  },
  // 最大单日盈利
  maxDailyProfit: {
    type: Number,
    default: 0
  },
  // 最大单日亏损
  maxDailyLoss: {
    type: Number,
    default: 0
  },
  // 平均单日盈亏
  avgDailyProfit: {
    type: Number,
    default: 0
  },
  // 月初资产
  startAssets: {
    type: Number,
    default: 0
  },
  // 月末资产
  endAssets: {
    type: Number,
    default: 0
  },
  // 是否脏数据
  isDirty: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 复合索引：用户 + 年月
monthlyStatsSchema.index({ userId: 1, yearMonth: 1 }, { unique: true });
// 索引：查询脏数据
monthlyStatsSchema.index({ userId: 1, isDirty: 1 });

module.exports = mongoose.model('MonthlyStats', monthlyStatsSchema);
