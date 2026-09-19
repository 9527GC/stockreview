const request = require('supertest');

jest.mock('../src/utils/marketData', () => {
  const actual = jest.requireActual('../src/utils/marketData');
  return {
    ...actual,
    buildBenchmarkCurvePoints: jest.fn(async () => ({
      benchmarkName: '上证指数',
      benchmarkSymbol: '000001.SH',
      pointsByDate: new Map()
    }))
  };
});

jest.mock('../src/utils/assetSnapshot', () => ({
  refreshAssetMarketValue: jest.fn(async () => null)
}));

jest.mock('../src/utils/dailyProfitBackfill', () => {
  const actual = jest.requireActual('../src/utils/dailyProfitBackfill');
  return {
    ...actual,
    upsertTodayDailyProfit: jest.fn(async () => actual.getDateStringInOffset(480))
  };
});

const app = require('../src/index');
const User = require('../src/models/User');
const { Asset } = require('../src/models/Asset');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');
const { BEIJING_OFFSET_MINUTES, getDateStringInOffset } = require('../src/utils/datetime');

let userId;
let token;

beforeAll(async () => {
  const user = await User.create({ username: 'assetmetricstest', password: 'password123', nickname: 'Asset Metrics Test' });
  userId = user._id;
  const login = await request(app).post('/api/auth/login').send({ username: 'assetmetricstest', password: 'password123' });
  token = login.body.token;
});

afterAll(async () => {
  await Promise.all([
    Asset.deleteMany({ userId }),
    DailyProfit.deleteMany({ userId }),
    DailyRevenue.deleteMany({ userId }),
    User.deleteMany({ _id: userId })
  ]);
});

beforeEach(async () => {
  await Promise.all([Asset.deleteMany({ userId }), DailyProfit.deleteMany({ userId }), DailyRevenue.deleteMany({ userId })]);
});

describe('asset metric endpoints', () => {
  test('空账户汇总也返回统一估值质量和分币种现金', async () => {
    const res = await request(app).get('/api/assets/summary').set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ valuationQuality: 'complete', cashByCurrency: { CNY: 0, HKD: 0, USD: 0 }, totalDailyProfit: 0 });
  });

  test('汇总今日盈亏读取刚生成的 DailyProfit 快照，而非旧的持仓日盈亏计算', async () => {
    const today = getDateStringInOffset(BEIJING_OFFSET_MINUTES);
    await Asset.create({
      userId,
      totalAssets: 10200,
      currentPrincipal: 10000,
      cash: 200,
      cashBalances: { CNY: 200, HKD: 0, USD: 0 },
      holdingsMarketValue: 10000,
      totalHoldingsCount: 1,
      valuationQuality: 'complete'
    });
    await DailyProfit.create({
      userId,
      date: today,
      dailyProfitAmount: 321.09,
      dailyReturn: 3.21,
      totalAssets: 10200,
      valuationQuality: 'complete'
    });

    const res = await request(app).get('/api/assets/summary').set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.totalDailyProfit).toBe(321.09);
  });

  test('区间中入金不产生收益曲线跳涨', async () => {
    await DailyProfit.insertMany([
      { userId, date: '2026-09-18', dailyReturn: 0, totalAssets: 10000 },
      { userId, date: '2026-09-19', dailyReturn: 0, totalAssets: 20000 }
    ]);

    const res = await request(app)
      .get('/api/assets/profit-curve?startDate=2026-09-18&endDate=2026-09-19')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((point) => point.value)).toEqual([0, 0]);
  });

  test('区间前有快照时，曲线从首日收益率开始复利', async () => {
    await DailyProfit.insertMany([
      { userId, date: '2026-09-17', dailyReturn: 0, totalAssets: 10000 },
      { userId, date: '2026-09-18', dailyReturn: 1, totalAssets: 10100 },
      { userId, date: '2026-09-19', dailyReturn: 2, totalAssets: 10302 }
    ]);

    const res = await request(app)
      .get('/api/assets/profit-curve?startDate=2026-09-18&endDate=2026-09-19')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.map((point) => point.value)).toEqual([1, 3.02]);
  });

  test('日历返回的金额、收益率和质量均来自 DailyRevenue 快照', async () => {
    const today = getDateStringInOffset(BEIJING_OFFSET_MINUTES);
    const [year, month] = today.split('-');
    await DailyRevenue.create({
      userId,
      date: today,
      revenue: 123.45,
      returnRate: 1.23,
      valuationQuality: 'partial',
      source: 'partial'
    });

    const res = await request(app)
      .get(`/api/assets/profit-calendar?year=${year}&month=${Number(month)}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.dailyProfits[today]).toBe(123.45);
    expect(res.body.dailyReturns[today]).toBe(1.23);
    expect(res.body.valuationQualityByDate[today]).toBe('partial');
  });
});
