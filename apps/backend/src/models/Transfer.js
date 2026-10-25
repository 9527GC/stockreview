const mongoose = require('mongoose');

const transferSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['IN', 'OUT'], required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'CNY' },
  date: { type: Date, default: Date.now },
  remark: { type: String }
});

transferSchema.index({ userId: 1, date: -1 });

module.exports = mongoose.model('Transfer', transferSchema);
