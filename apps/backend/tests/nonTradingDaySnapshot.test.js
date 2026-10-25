jest.mock('../src/utils/currency', () => ({ getRates: jest.fn(async () => ({ CNY: 1, HKD: 0.92, USD: 7.2 })) }));
jest.mock('../src/utils/marketData', () => ({ getQuotes: jest.fn(async () => ({})) }));
jest.mock('../src/utils/datetime', () => {
  const actual = jest.requireActual('../src/utils/datetime');
  const now = new Date('2026-10-25T04:00:00Z');
  return { ...actual,
    getDateStringInOffset: (offset, date = now) => actual.getDateStringInOffset(offset, date),
    getPreviousDateStringInOffset: (offset, date = now) => actual.getPreviousDateStringInOffset(offset, date),
    getDayRangeInOffset: (offset, date = now) => actual.getDayRangeInOffset(offset, date)
  };
});
const mongoose = require('mongoose');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');
const { Asset } = require('../src/models/Asset');
const { Holding } = require('../src/models/Trade');
const { getQuotes } = require('../src/utils/marketData');
const { carryInactiveDaySnapshot } = require('../src/utils/nonTradingDaySnapshot');
const { upsertTodayDailyProfit } = require('../src/utils/dailyProfitBackfill');
let userId;
beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI); });
afterAll(async () => { await mongoose.disconnect(); });
beforeEach(async () => {
  userId = new mongoose.Types.ObjectId();
  getQuotes.mockResolvedValue({ X: { symbol: '600000.SH', quoteDate: '2026-10-23', quoteTime: '15:00:00' } });
  await DailyProfit.create({ userId, date: '2026-10-24', totalAssets: 225152.18,
    cumulativeReturn: -20, cumulativeProfitAmount: -6000, valuationQuality: 'partial' });
  await DailyRevenue.create({ userId, date: '2026-10-24', totalAssets: 225152.18,
    cash: 1000, holdingsMarketValue: 224152.18, cumulativeRevenue: -6000, cumulativeReturnRate: -20, valuationQuality: 'partial' });
  await mongoose.connection.db.collection('holdings').insertOne({ userId, symbol: '600000.SH' });
});

test('周日刷新覆盖错误收益，沿用昨日全部估值，重复刷新不会重现亏损', async () => {
  await Asset.create({ userId, totalAssets: 221320.46, currentPrincipal: 303970.76 });
  await DailyProfit.create({ userId, date: '2026-10-25', dailyProfitAmount: -3831.72 });
  await DailyRevenue.create({ userId, date: '2026-10-25', revenue: -3831.72 });
  for (let i = 0; i < 2; i++) {
    expect(await upsertTodayDailyProfit(userId)).toBe('2026-10-25');
    const profit = await DailyProfit.findOne({ userId, date: '2026-10-25' }).lean();
    const revenue = await DailyRevenue.findOne({ userId, date: '2026-10-25' }).lean();
    expect(profit.dailyProfitAmount).toBe(0);
    expect(profit.dailyReturn).toBe(0);
    expect(profit.totalAssets).toBe(225152.18);
    expect(profit.cumulativeReturn).toBe(-20);
    expect(profit.valuationQuality).toBe('partial');
    expect(revenue.revenue).toBe(0);
    expect(revenue.cash + revenue.holdingsMarketValue).toBe(profit.totalAssets);
  }
});

test.each(['trades', 'corporateactions', 'companyactions'])('当日存在 %s 时保留正常计算路径', async collection => {
  await mongoose.connection.db.collection(collection).insertOne({ userId, date: new Date('2026-10-25T02:00:00Z') });
  expect(await carryInactiveDaySnapshot(userId, '2026-10-25')).toBe(false);
});

test.each([
  ['600000.SH', '2026-10-25', '10:00:00'],
  ['TSLL.US', '2026-10-24', '16:00:00']
])('当日有效报价 %s 按北京时间识别，继续计算真实收益', async (symbol, quoteDate, quoteTime) => {
  await Holding.updateOne({ userId }, { $set: { symbol } });
  getQuotes.mockResolvedValue({ [symbol]: { symbol, quoteDate, quoteTime } });
  expect(await carryInactiveDaySnapshot(userId, '2026-10-25')).toBe(false);
});

test('昨日快照不完整时不伪造基线', async () => {
  await DailyRevenue.deleteMany({ userId });
  expect(await carryInactiveDaySnapshot(userId, '2026-10-25')).toBe(false);
});

test.each([
  ['IN', 'CNY', undefined, undefined, 5000],
  ['OUT', 'CNY', undefined, undefined, -5000],
  ['IN', 'HKD', 4500, 0.9, 4500]
])('休市日 %s %s 只改变资产和现金，反复刷新收益保持零', async (type, currency, amountCNY, fxRateToCNY, netFlow) => {
  await Asset.create({ userId, totalAssets: 221320.46 + netFlow, currentPrincipal: 303970.76 + netFlow });
  await mongoose.connection.db.collection('transfers').insertOne({ userId, type, currency, amount: 5000,
    ...(amountCNY === undefined ? {} : { amountCNY, fxRateToCNY }), date: new Date('2026-10-25T08:25:04Z') });
  for (let i = 0; i < 2; i++) {
    await upsertTodayDailyProfit(userId);
    const profit = await DailyProfit.findOne({ userId, date: '2026-10-25' }).lean();
    const revenue = await DailyRevenue.findOne({ userId, date: '2026-10-25' }).lean();
    expect(profit.dailyProfitAmount).toBe(0);
    expect(profit.dailyReturn).toBe(0);
    expect(profit.externalNetFlow).toBe(netFlow);
    expect(profit.totalAssets).toBe(225152.18 + netFlow);
    expect(profit.cumulativeProfitAmount).toBe(-6000);
    expect(profit.cumulativeReturn).toBe(-20);
    expect(revenue.cash).toBe(1000 + netFlow);
    expect(revenue.cash + revenue.holdingsMarketValue).toBeCloseTo(profit.totalAssets, 2);
  }
});