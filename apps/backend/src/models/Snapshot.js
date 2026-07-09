const mongoose = require('mongoose');

/**
 * 月度/年度快照
 * 存储每月初或每年初的资产快照，用于增量计算
 */
const snapshotSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  // 快照类型：monthly（月度）/ yearly（年度）
  type: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: true
  },
  // 快照日期：YYYY-MM-DD
  date: {
    type: String,
    required: true,
    index: true
  },
  // 年月：YYYY-MM（月度快照）或 YYYY（年度快照）
  period: {
    type: String,
    required: true
  },
  // 快照时总资产
  totalAssets: {
    type: Number,
    default: 0
  },
  // 快照时现金
  cash: {
    type: Number,
    default: 0
  },
  // 快照时持仓市值
  holdingsMarketValue: {
    type: Number,
    default: 0
  },
  // 快照时累计收益
  cumulativeProfit: {
    type: Number,
    default: 0
  },
  // 快照时累计收益率
  cumulativeReturnRate: {
    type: Number,
    default: 0
  },
  // 快照时持仓列表
  holdings: [{
    symbol: String,
    name: String,
    quantity: Number,
    avgCost: Number,
    marketValue: Number,
    currency: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 复合索引：用户 + 类型 + 日期
snapshotSchema.index({ userId: 1, type: 1, date: 1 }, { unique: true });
// 索引：按 period 查询
snapshotSchema.index({ userId: 1, type: 1, period: 1 });

module.exports = mongoose.model('Snapshot', snapshotSchema);
