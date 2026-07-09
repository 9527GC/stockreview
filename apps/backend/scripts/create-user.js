const path = require('path');
const fs = require('fs');

// Load .env file manually
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) {
        process.env[key] = value;
      }
    }
  });
  console.log('[env] Loaded .env');
} else {
  console.log('[env] Warning: .env not found');
}

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

async function createUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  const user = new User({ username: '9527', password: '9527', role: 'user' });
  await user.save();
  console.log('User created successfully');
  mongoose.disconnect();
}

createUser().catch(err => {
  console.error(err);
  process.exit(1);
});
