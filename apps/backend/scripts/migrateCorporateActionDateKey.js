const path = require('path');
const fs = require('fs');

const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = `.env.${nodeEnv}`;
const envPath = path.resolve(__dirname, '..', envFile);
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)\r?$/);
    if (match && process.env[match[1].trim()] === undefined) process.env[match[1].trim()] = match[2].trim();
  });
}

const mongoose = require('mongoose');
const { CorporateAction } = require('../src/models/CorporateAction');
const { getDateStringInOffset } = require('../src/utils/datetime');

const run = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI 未配置');
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = CorporateAction.collection;
  const records = await collection.find({}).toArray();
  const missing = records.filter((record) => !record.dateKey);
  if (missing.length > 0) {
    for (const record of missing) {
      await collection.updateOne({ _id: record._id }, { $set: { dateKey: getDateStringInOffset(480, record.date) } });
    }
    console.log(`[迁移] 已为 ${missing.length} 条公司行动补齐 dateKey`);
  }

  const duplicates = await collection.aggregate([
    { $match: { dateKey: { $type: 'string' } } },
    { $group: { _id: { userId: '$userId', symbol: '$symbol', dateKey: '$dateKey' }, ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
  if (duplicates.length > 0) {
    console.error('[迁移] 发现同一用户、证券、日期存在重复公司行动，已停止，不会自动删除：');
    duplicates.forEach((group) => console.error(JSON.stringify(group)));
    process.exitCode = 1;
    return;
  }

  const indexes = await collection.indexes();
  const oldIndex = indexes.find((index) => index.name === 'userId_1_symbol_1_date_1_type_1_sourceId_1');
  if (oldIndex) {
    await collection.dropIndex(oldIndex.name);
    console.log('[迁移] 已删除旧公司行动去重索引');
  }
  const newIndex = indexes.find((index) => index.name === 'userId_1_symbol_1_dateKey_1');
  if (!newIndex) {
    await collection.createIndex({ userId: 1, symbol: 1, dateKey: 1 }, { unique: true });
    console.log('[迁移] 已创建新的证券+日期唯一索引');
  }
};

run().catch((error) => { console.error('[迁移] 失败：', error); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
