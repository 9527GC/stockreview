const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/stock_review_fix_verify');

  const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    nickname: { type: String }
  }));

  // 预保存钩子不会在这里触发，手动哈希
  const existing = await User.findOne({ username: 'smoke_user' });
  if (!existing) {
    const hash = await bcrypt.hash('smoke_pass', 10);
    await User.create({ username: 'smoke_user', password: hash, nickname: 'Smoke' });
    console.log('Created smoke_user');
  } else {
    console.log('smoke_user already exists');
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
