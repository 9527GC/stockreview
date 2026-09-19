const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const commissionPreferenceSchema = new mongoose.Schema({
  mode: { type: String, enum: ['rate', 'amount'], default: 'rate' },
  rate: { type: Number, default: 5 }, // 单位：‱（万分之一）
  amount: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
}, { _id: false });

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nickname: { type: String },
  avatar: { type: String },
  wechatOpenId: { type: String, unique: true, sparse: true },
  wechatUnionId: { type: String, unique: true, sparse: true },
  wechatNickname: { type: String, trim: true, maxlength: 50 },
  wechatAvatar: { type: String, trim: true, maxlength: 2048 },
  commissionPreference: {
    type: Map,
    of: commissionPreferenceSchema,
    default: {
      CN: { mode: 'rate', rate: 5, amount: 0 },
      HK: { mode: 'rate', rate: 5, amount: 0 },
      US: { mode: 'rate', rate: 5, amount: 0 }
    }
  }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
