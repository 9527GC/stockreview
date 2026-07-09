const mongoose = require('mongoose');

/**
 * 历史行情缓存
 * 用于缓存股票在某日期的行情数据，避免回填收益曲线时重复请求外部接口
 */
const historicalQuoteSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  open: Number,
  high: Number,
  low: Number,
  close: Number,
  volume: Number,
  amount: Number,
  change: Number,
  changePercent: Number,
  source: {
    type: String,
    default: 'tencent'
  },
  fetchedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// 复合索引：symbol + date 唯一
historicalQuoteSchema.index({ symbol: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('HistoricalQuote', historicalQuoteSchema);
