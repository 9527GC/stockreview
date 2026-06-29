const mongoose = require('mongoose');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/stock_review_test';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.CORS_ORIGINS = '*';
  process.env.ENABLE_PROFIT_HISTORY_SCHEDULER = 'false';
  process.env.RATE_LIMIT_MAX = '10000';

  // Clean up test database before running tests
  await mongoose.connect(process.env.MONGODB_URI);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
};
