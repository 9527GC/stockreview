const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function createUser() {
  await mongoose.connect('mongodb://localhost:27017/stock_review_dev');
  
  const password = await bcrypt.hash('9527', 10);
  
  await mongoose.connection.collection('users').insertOne({
    username: '9527',
    password: password,
    nickname: 'Admin',
    avatar: ''
  });
  
  console.log('User created: username=9527, password=9527');
  await mongoose.disconnect();
}

createUser().catch(err => {
  console.error(err);
  process.exit(1);
});
