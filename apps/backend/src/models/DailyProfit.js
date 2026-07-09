const mongoose = require('mongoose');

/**
 * 每日收益曲线数据
 * 存储用户每日的收益率和累计收益率
 */
const dailyProfitSchema = new mongoose.Schema({
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
  // 当日收益率（相对于前一日）
  dailyReturn: {
    type: Number,
    default: 0
  },
  // 累计收益率（相对于基准日期）
  cumulativeReturn: {
    type: Number,
    default: 0
  },
  // 当日盈亏金额
  dailyProfitAmount: {
    type: Number,
    default: 0
  },
  // 累计盈亏金额
  cumulativeProfitAmount: {
    type: Number,
    default: 0
  },
  // 当日总资产
  totalAssets: {
    type: Number,
    default: 0
  },
  // 是否脏数据（需要重新计算）
  isDirty: {
    type: Boolean,
    default: false
  },
  // 数据来源：cached（缓存）/ realtime（实时计算）/ partial（部分缺失）
  source: {
    type: String,
    enum: ['cached', 'realtime', 'partial'],
    default: 'cached'
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

// 复合索引：用户 + 日期，确保唯一
dailyProfitSchema.index({ userId: 1, date: 1 }, { unique: true });
// 索引：查询脏数据
dailyProfitSchema.index({ userId: 1, isDirty: 1 });
// 索引：按日期扫描脏数据
dailyProfitSchema.index({ userId: 1, isDirty: 1, date: 1 });

module.exports = mongoose.model('DailyProfit', dailyProfitSchema);
