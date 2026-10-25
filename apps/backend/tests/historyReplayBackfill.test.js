jest.mock('../src/utils/currency', () => ({ getRates: jest.fn(async () => ({ CNY: 1 })) }));
jest.mock('../src/utils/historicalQuoteCache', () => ({ getQuotesForRange: jest.fn() }));
jest.mock('../src/utils/dailyProfit', () => ({ getDateStringInOffset: () => '2026-10-25' }));

const mongoose = require('mongoose');
const { getQuotesForRange } = require('../src/utils/historicalQuoteCache');
const { backfill } = require('../src/utils/historyReplayBackfill');

let userId;
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI); });
afterAll(async () => { await mongoose.disconnect(); });
beforeEach(async () => {
  userId = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  await db.collection('transfers').insertOne({ userId, date: new Date('2026-10-16'), type: 'IN', amountCNY: 1000 });
  await db.collection('trades').insertOne({ userId, symbol: '600000.SH', date: new Date('2026-10-16'), type: 'BUY', quantity: 10, price: 10 });
  await db.collection('historicalquotes').deleteMany({ symbol: '600000.SH' });
  await db.collection('historicalquotes').insertOne({ symbol: '600000.SH', date: '2026-10-16', close: 10 });
  getQuotesForRange.mockReset();
});

test('自动抓取新行情后重算收益，并保留休市日旧价标记', async () => {
  getQuotesForRange.mockImplementation(async () => {
    await mongoose.connection.db.collection('historicalquotes').insertOne({ symbol: '600000.SH', date: '2026-10-20', close: 12 });
  });
  await backfill(userId, '2026-10-20');
  expect(getQuotesForRange).toHaveBeenCalledWith(['600000.SH'], '2026-10-19', '2026-10-24');
  const db = mongoose.connection.db;
  const profit = await db.collection('dailyprofits').findOne({ userId, date: '2026-10-20' });
  const revenue = await db.collection('dailyrevenues').findOne({ userId, date: '2026-10-20' });
  expect(profit.dailyProfitAmount).toBe(20);
  expect(revenue.revenue).toBe(20);
  expect(profit.valuationQuality).toBe('complete');
  const weekend = await db.collection('dailyprofits').findOne({ userId, date: '2026-10-24' });
  expect(weekend.dailyProfitAmount).toBe(0);
  expect(weekend.valuationQuality).toBe('stale');
  expect(await db.collection('historicalquotes').countDocuments({ symbol: '600000.SH', date: '2026-10-24' })).toBe(0);
});

test('没有新行情时保留估值诊断，之后重试可修正已写入的零收益', async () => {
  getQuotesForRange.mockResolvedValue(new Map());
  await backfill(userId, '2026-10-20');
  const db = mongoose.connection.db;
  let row = await db.collection('dailyprofits').findOne({ userId, date: '2026-10-20' });
  expect(row.valuationDiagnostics[0].priceDate).toBe('2026-10-16');
  getQuotesForRange.mockImplementation(async () => {
    await db.collection('historicalquotes').insertOne({ symbol: '600000.SH', date: '2026-10-20', close: 11 });
  });
  await backfill(userId, '2026-10-20');
  row = await db.collection('dailyprofits').findOne({ userId, date: '2026-10-20' });
  expect(row.dailyProfitAmount).toBe(10);
  expect(await db.collection('dailyprofits').countDocuments({ userId, date: '2026-10-20' })).toBe(1);
});

test('未来日期不抓取行情也不写入收益', async () => {
  expect((await backfill(userId, '2026-10-25')).updatedCount).toBe(0);
  expect(getQuotesForRange).not.toHaveBeenCalled();
});
