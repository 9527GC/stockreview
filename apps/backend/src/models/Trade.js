const mongoose = require('mongoose');

const TRADE_MOODS = String(process.env.TRADE_MOODS || 'NEUTRAL,CALM,CONFIDENT,ANXIOUS,IMPULSIVE,EXCITED,FEAR')
  .split(',')
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);

if (!TRADE_MOODS.includes('NEUTRAL')) TRADE_MOODS.unshift('NEUTRAL');
if (!TRADE_MOODS.includes('EXCITED')) TRADE_MOODS.push('EXCITED');
if (!TRADE_MOODS.includes('FEAR')) TRADE_MOODS.push('FEAR');

const tradeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  date: { type: Date, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  commission: { type: Number, default: 0 }, // 手续费（最终金额）
  feeMode: { type: String, enum: ['rate', 'amount'], default: null }, // rate=按手续费率, amount=按费用
  feeRate: { type: Number, default: null }, // 仅 mode=rate 时使用，单位：‱（万分之一）
  feeAmount: { type: Number, default: null }, // 仅 mode=amount 时使用，原始币种固定费用金额
  currency: { type: String, default: 'CNY' }, // CNY, USD, HKD
  fxRateToCNY: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value > 0,
      message: 'fxRateToCNY must be a positive number'
    }
  },
  grossAmount: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value > 0,
      message: 'grossAmount must be a positive number'
    }
  },
  netSettlementAmount: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value >= 0,
      message: 'netSettlementAmount must be a non-negative number'
    }
  },
  market: { type: String }, // SH, SZ, HK, US
  mood: { type: String, enum: TRADE_MOODS, default: 'NEUTRAL' },
  marketOverview: { type: Object, default: null },
  marketOverviewSnapshot: { type: Object, default: null },
  snapshotStatus: { type: String, enum: ['missing', 'partial', 'complete'], default: 'missing' },
  snapshotSource: { type: String, default: null },
  snapshotTime: { type: Date, default: null },
  news: { type: String, default: null },
  logic: { type: String },
  isSystemCompliant: { type: String, default: null },
  cognitiveBias: { type: String, default: null },
  improvementMeasures: { type: String, default: null }
});

const holdingSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true },
  name: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  avgCost: { type: Number, default: 0 },
  lastPrice: { type: Number, default: null },
  lastPriceAt: { type: Date, default: null },
  currency: { type: String, default: 'CNY' },
  marketTag: { type: String }
});

tradeSchema.index({ userId: 1, date: -1 });
tradeSchema.index({ userId: 1, symbol: 1 });
tradeSchema.index({ userId: 1, type: 1, date: -1 });
holdingSchema.index({ userId: 1, symbol: 1 }, { unique: true });

const Trade = mongoose.model('Trade', tradeSchema);
const Holding = mongoose.model('Holding', holdingSchema);

module.exports = { Trade, Holding };