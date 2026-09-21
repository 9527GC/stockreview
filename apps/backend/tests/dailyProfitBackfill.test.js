const request = require('supertest');

const app = require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');
const DailyRevenue = require('../src/models/DailyRevenue');
const DailyProfit = require('../src/models/DailyProfit');
const HistoricalQuote = require('../src/models/HistoricalQuote');
const { upsertTodayDailyProfit, getDateStringInOffset } = require('../src/utils/dailyProfitBackfill');

// 避免测试期间调用外部行情接口
jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1 }))
}));

jest.mock('../src/utils/historicalQuotes', () => ({
  getStockHistoricalQuotes: jest.fn(() => Promise.resolve([])),
  getStockHistoricalQuoteOnDate: jest.fn(() => Promise.resolve(null)),
  getStockHistoricalQuotesMap: jest.fn(() => Promise.resolve({}))
}));

jest.mock('../src/utils/historicalQuoteCache', () => ({
  getQuotesForRange: jest.fn(async (symbols, startDate, endDate) => {
    const quotes = new Map();
    for (const date of [startDate, endDate]) {
      quotes.set(date, Object.fromEntries(symbols.map(symbol => [symbol, { close: 1000 }])));
    }
    return quotes;
  })
}));
jest.mock('../src/utils/marketData', () => {
  const actual = jest.requireActual('../src/utils/marketData');
  return {
    ...actual,
    getQuotes: jest.fn(() => Promise.resolve({})),
    buildTradeMarketSnapshot: jest.fn(() =>
      Promise.resolve({
        marketOverview: {},
        marketOverviewSnapshot: {},
        snapshotStatus: 'missing',
        snapshotSource: null,
        snapshotTime: new Date()
      })
    )
  };
});

let token;
let userId;

const fmtDate = (d) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  const user = await User.create({
    username: 'backfilltest',
    password: 'password123',
    nickname: 'Backfill Test'
  });
  userId = user._id;
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'backfilltest', password: 'password123' });
  token = res.body.token;
});

beforeEach(async () => {
  await Trade.deleteMany({ userId });
  await Holding.deleteMany({ userId });
  await Asset.deleteMany({ userId });
  await DailyRevenue.deleteMany({ userId });
  await DailyProfit.deleteMany({ userId });
});

describe('DailyProfit 历史回填', () => {
  test('没有昨日资产快照时，不应把累计盈亏写成今日收益', async () => {
    const totalAssets = 371152.10;
    const principal = 291350.47;
    const today = getDateStringInOffset(480);

    await Asset.create({
      userId,
      totalAssets,
      currentPrincipal: principal,
      cash: totalAssets,
      holdingsMarketValue: 0
    });

    await upsertTodayDailyProfit(userId);

    const todayRevenue = await DailyRevenue.findOne({ userId, date: today }).lean();
    expect(todayRevenue).toBeTruthy();
    expect(todayRevenue.revenue).toBe(0);
    expect(todayRevenue.returnRate).toBe(0);
    expect(todayRevenue.cumulativeRevenue).toBeCloseTo(totalAssets - principal, 2);
  });

  test('补录前天买入再补录昨天卖出清仓后，今日收益应为 0，昨日收益为股票收益', async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const dayBeforeYesterday = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);

    const buyPrice = 1000;
    const sellPrice = 1100;
    const quantity = 100;
    const expectedProfit = (sellPrice - buyPrice) * quantity; // 10000

    // 1. 补录前天买入
    const buyRes = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        name: '贵州茅台',
        type: 'BUY',
        price: buyPrice,
        quantity,
        commission: 0,
        date: `${fmtDate(dayBeforeYesterday)}T10:00:00+08:00`,
        currency: 'CNY',
        market: 'SH'
      });
    expect(buyRes.statusCode).toBe(201);

    // 2. 补录昨天卖出清仓
    const sellRes = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        name: '贵州茅台',
        type: 'SELL',
        price: sellPrice,
        quantity,
        commission: 0,
        date: `${fmtDate(yesterday)}T10:00:00+08:00`,
        currency: 'CNY',
        market: 'SH'
      });
    expect(sellRes.statusCode).toBe(201);

    // 3. 验证收益日历数据：今日收益必须为 0，昨日收益为收益金额
    const todayRevenue = await DailyRevenue.findOne({ userId, date: fmtDate(today) }).lean();
    const yesterdayRevenue = await DailyRevenue.findOne({ userId, date: fmtDate(yesterday) }).lean();

    expect(todayRevenue).toBeTruthy();
    expect(yesterdayRevenue).toBeTruthy();

    expect(todayRevenue.revenue).toBe(0);
    expect(yesterdayRevenue.revenue).toBe(expectedProfit);
  });
});
