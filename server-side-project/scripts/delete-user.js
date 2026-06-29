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

async function deleteUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.collection('users').deleteOne({ username: '9527' });
  console.log('User deleted successfully');
  mongoose.disconnect();
}

deleteUser().catch(err => {
  console.error(err);
  process.exit(1);
});
