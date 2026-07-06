const mongoose = require('mongoose');

/**
 * A 股每日市场广度快照
 * 存储每个交易日沪深京 A 股的全市场汇总数据，用于较昨日成交额变化量等需要前一日数据的计算。
 * 数据为公共数据，所有用户共享。
 */
const marketDailySnapshotSchema = new mongoose.Schema({
  date: {
    type: String, // YYYY-MM-DD，按北京时间口径
    required: true,
    unique: true,
    index: true
  },
  // 全市成交量（股），包含沪深京所有 A 股
  totalVolume: {
    type: Number,
    default: null
  },
  // 全市成交金额（元），包含沪深京所有 A 股
  totalAmount: {
    type: Number,
    default: null
  },
  // 上涨家数
  upCount: {
    type: Number,
    default: null
  },
  // 下跌家数
  downCount: {
    type: Number,
    default: null
  },
  // 平盘家数
  flatCount: {
    type: Number,
    default: null
  },
  // 涨停家数（按各板块涨跌停规则估算）
  limitUpCount: {
    type: Number,
    default: null
  },
  // 跌停家数（按各板块涨跌停规则估算）
  limitDownCount: {
    type: Number,
    default: null
  },
  // 数据来源标识
  source: {
    type: String,
    default: 'eastmoney-clist'
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
marketDailySnapshotSchema.index({ date: -1 });

module.exports = mongoose.model('MarketDailySnapshot', marketDailySnapshotSchema);
