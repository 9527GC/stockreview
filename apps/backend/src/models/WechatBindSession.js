const mongoose = require('mongoose');

const wechatBindSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  status: { type: String, enum: ['pending', 'processing', 'bound', 'failed'], default: 'pending', index: true },
  failureMessage: { type: String },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date },
  processingStartedAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('WechatBindSession', wechatBindSessionSchema);
