const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

module.exports = async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.CORS_ORIGINS = '*';
  process.env.ENABLE_PROFIT_HISTORY_SCHEDULER = 'false';
  process.env.RATE_LIMIT_MAX = '10000';

  // 启动内存 MongoDB 实例，供所有测试共享
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;

  // 清理测试数据库，保证每个测试进程都是干净状态
  await mongoose.connect(uri);
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();

  // 保存实例，供 globalTeardown 关闭
  global.__MONGOD__ = mongod;
};
