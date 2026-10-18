const mongoose = require('mongoose');

const ACTION_TYPES = ['CASH_DIVIDEND', 'SPLIT', 'REVERSE_SPLIT', 'STOCK_DIVIDEND', 'BONUS_ISSUE', 'RIGHTS_ISSUE'];

const corporateActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  symbol: { type: String, required: true, trim: true },
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  dateKey: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  type: { type: String, enum: ACTION_TYPES, required: true },
  currency: { type: String, enum: ['CNY', 'HKD', 'USD'], default: 'CNY' },
  cashAmount: { type: Number, default: 0, min: 0 },
  quantityChange: { type: Number, default: 0 },
  ratioNumerator: { type: Number, default: null, min: 0 },
  ratioDenominator: { type: Number, default: null, min: 0 },
  sourceFile: { type: String, default: null },
  remark: { type: String, default: null }
}, { timestamps: true });

corporateActionSchema.index({ userId: 1, symbol: 1, dateKey: 1 }, { unique: true });

module.exports = { CorporateAction: mongoose.model('CorporateAction', corporateActionSchema), ACTION_TYPES };

