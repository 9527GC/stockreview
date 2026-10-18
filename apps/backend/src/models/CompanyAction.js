const mongoose = require('mongoose');
const companyActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  symbol: { type: String, required: true }, name: { type: String, required: true },
  date: { type: Date, required: true },
  type: { type: String, enum: ['DIVIDEND','SPLIT','MERGER','BONUS','RIGHTS','OTHER'], default: 'OTHER' },
  description: { type: String, required: true },
  quantityChange: { type: Number, default: 0 },
  cashAmount: { type: Number, default: 0 },
  beforeQuantity: { type: Number, default: null },
  afterQuantity: { type: Number, default: null },
  bonusQuantity: { type: Number, default: null },
  rightsQuantity: { type: Number, default: null },
  subscribedQuantity: { type: Number, default: null },
  cashPerShare: { type: Number, default: null },
  subscriptionPrice: { type: Number, default: null },
  ratioNumerator: { type: Number, default: null },
  ratioDenominator: { type: Number, default: null },
  currency: { type: String, default: 'CNY' }, market: { type: String, default: null }
}, { timestamps: true });
companyActionSchema.index({ userId: 1, symbol: 1, date: 1 });
module.exports = mongoose.model('CompanyAction', companyActionSchema);
