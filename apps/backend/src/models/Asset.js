const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  totalAssets: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },
  totalDailyProfit: { type: Number, default: 0 },
  cash: { type: Number, default: 0 }, // 当前全部现金的 CNY 估值
  cashBalances: {
    type: Map,
    of: Number,
    default: () => ({ CNY: 0, HKD: 0, USD: 0 })
  },
  holdingsMarketValue: { type: Number, default: 0 },
  currentPrincipal: { type: Number, default: 0 },
  totalHoldingsCount: { type: Number, default: 0 }
}, { timestamps: true });

assetSchema.index({ userId: 1 }, { unique: true });

const Asset = mongoose.model('Asset', assetSchema);

module.exports = { Asset };