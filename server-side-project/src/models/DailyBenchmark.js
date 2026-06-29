const mongoose = require('mongoose');

/**
 * 每日上证指数数据
 * 公共数据，所有用户共享
 */
const dailyBenchmarkSchema = new mongoose.Schema({
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    unique: true,
    index: true
  },
  // 指数代码
  symbol: {
    type: String,
    default: '000001.SH'
  },
  // 指数名称
  name: {
    type: String,
    default: '上证指数'
  },
  // 当日开盘价
  open: {
    type: Number,
    default: 0
  },
  // 当日收盘价
  close: {
    type: Number,
    default: 0
  },
  // 当日最高价
  high: {
    type: Number,
    default: 0
  },
  // 当日最低价
  low: {
    type: Number,
    default: 0
  },
  // 当日涨跌幅（百分比）
  changePercent: {
    type: Number,
    default: 0
  },
  // 累计涨跌幅（相对于基准日期）
  cumulativeChangePercent: {
    type: Number,
    default: 0
  },
  // 成交量
  volume: {
    type: Number,
    default: 0
  },
  // 数据来源：tencent（腾讯）/ sina（新浪）/ manual（手动）
  source: {
    type: String,
    enum: ['tencent', 'sina', 'manual', 'missing'],
    default: 'tencent'
  },
  // 是否交易日
  isTradingDay: {
    type: Boolean,
    default: true
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

// 索引：日期查询
dailyBenchmarkSchema.index({ date: -1 });
// 索引：查询缺失数据
dailyBenchmarkSchema.index({ source: 1, date: -1 });

module.exports = mongoose.model('DailyBenchmark', dailyBenchmarkSchema);
