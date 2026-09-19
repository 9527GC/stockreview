const mongoose = require('mongoose');

const wechatLoginSessionSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['pending', 'confirmed', 'failed', 'expired'], default: 'pending', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  usedAt: { type: Date },
  loginToken: { type: String },
  jti: { type: String },
  userInfo: { type: mongoose.Schema.Types.Mixed },
  failureMessage: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('WechatLoginSession', wechatLoginSessionSchema);

