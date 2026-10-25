const mongoose = require('mongoose');

/**
 * 每日营收金额数据
 * 存储用户每日的营收明细
 */
const dailyRevenueSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  // 当日营收金额（正数盈利，负数亏损）
  revenue: {
    type: Number,
    default: 0
  },
  // 当日收益率
  returnRate: {
    type: Number,
    default: 0
  },
  // 累计营收金额
  cumulativeRevenue: {
    type: Number,
    default: 0
  },
  // 累计收益率
  cumulativeReturnRate: {
    type: Number,
    default: 0
  },
  valuationQuality: { type: String, enum: ['complete', 'partial', 'stale'], default: 'partial' },
  // 当日总资产
  totalAssets: {
    type: Number,
    default: 0
  },
  // 当日现金
  cash: {
    type: Number,
    default: 0
  },
  // 当日持仓市值
  holdingsMarketValue: {
    type: Number,
    default: 0
  },
  // 数据来源：cached（缓存）/ realtime（实时计算）/ partial（部分缺失）
  source: {
    type: String,
    enum: ['cached', 'realtime', 'partial'],
    default: 'cached'
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

// 复合索引：用户 + 日期
dailyRevenueSchema.index({ userId: 1, date: 1 }, { unique: true });
// 索引：查询脏数据
dailyRevenueSchema.index({ userId: 1, isDirty: 1 });
// 索引：按日期扫描脏数据
dailyRevenueSchema.index({ userId: 1, isDirty: 1, date: 1 });

module.exports = mongoose.model('DailyRevenue', dailyRevenueSchema);
