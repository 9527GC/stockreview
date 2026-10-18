const request = require('supertest');

jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(async () => ({ CNY: 1, USD: 7.2, HKD: 0.92 }))
}));

jest.mock('../src/utils/marketData', () => {
  const actual = jest.requireActual('../src/utils/marketData');
  return {
    ...actual,
    getQuotes: jest.fn(async () => ({
      '600519.SH': { symbol: '600519.SH', price: 100, quoteDate: CLOSE_DATE }
    })),
    buildBenchmarkCurvePoints: jest.fn(async () => ({
      benchmarkName: '上证指数',
      benchmarkSymbol: '000001.SH',
      pointsByDate: new Map()
    }))
  };
});

jest.mock('../src/utils/historicalQuoteCache', () => ({
  getQuotesForRange: jest.fn(async (symbols, startDate) => new Map([
    [startDate, Object.fromEntries(symbols.map((symbol) => [symbol, { close: 100 }]))]
  ]))
}));

const app = require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const Transfer = require('../src/models/Transfer');
const { Asset } = require('../src/models/Asset');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');

const USERNAME = 'metricse2etest';
const OPEN_DATE = '2026-09-19';
const CLOSE_DATE = '2026-09-20';
const CLOSE_YEAR = 2026;
const CLOSE_MONTH = 9;

let userId;
let token;

async function createTransfer(payload) {
  const response = await request(app)
    .post('/api/transfers')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(response.statusCode).toBe(201);
  return response.body;
}

async function createTrade(payload) {
  const response = await request(app)
    .post('/api/trades')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);
  expect(response.statusCode).toBe(201);
  return response.body;
}

beforeAll(async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  jest.setSystemTime(new Date('2026-09-20T12:00:00+08:00'));
  const user = await User.create({
    username: USERNAME,
    password: 'password123',
    nickname: 'Metrics E2E Test'
  });
  userId = user._id;
  const login = await request(app).post('/api/auth/login').send({
    username: USERNAME,
    password: 'password123'
  });
  token = login.body.token;
});

beforeEach(async () => {
  await Promise.all([
    Trade.deleteMany({ userId }),
    Holding.deleteMany({ userId }),
    Transfer.deleteMany({ userId }),
    Asset.deleteMany({ userId }),
    DailyProfit.deleteMany({ userId }),
    DailyRevenue.deleteMany({ userId })
  ]);
});

afterAll(async () => {
  await Promise.all([
    Trade.deleteMany({ userId }),
    Holding.deleteMany({ userId }),
    Transfer.deleteMany({ userId }),
    Asset.deleteMany({ userId }),
    DailyProfit.deleteMany({ userId }),
    DailyRevenue.deleteMany({ userId }),
    User.deleteMany({ _id: userId })
  ]);
  jest.useRealTimers();
});

describe('unified metrics end-to-end regression', () => {
  test('空账户从入金到清仓的全部指标同口径', async () => {
    const emptySummary = await request(app)
      .get('/api/assets/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(emptySummary.statusCode).toBe(200);
    expect(emptySummary.body).toMatchObject({
      totalAssets: 0,
      totalDailyProfit: 0,
      cashByCurrency: { CNY: 0, HKD: 0, USD: 0 }
    });

    const transfer = await createTransfer({
      type: 'IN',
      amount: 10000,
      currency: 'CNY',
      date: `${OPEN_DATE}T09:00:00+08:00`,
      remark: 'initial funding'
    });
    expect(transfer).toMatchObject({ fxRateToCNY: 1, amountCNY: 10000 });

    const buy = await createTrade({
      symbol: '600519.SH',
      type: 'BUY',
      price: 100,
      quantity: 100,
      commission: 0,
      date: `${OPEN_DATE}T10:00:00+08:00`,
      name: '贵州茅台'
    });
    const sell = await createTrade({
      symbol: '600519.SH',
      type: 'SELL',
      price: 110,
      quantity: 100,
      commission: 0,
      date: `${CLOSE_DATE}T10:00:00+08:00`,
      name: '贵州茅台'
    });
    expect(buy.fxRateToCNY).toBe(1);
    expect(sell.fxRateToCNY).toBe(1);

    const [profitSnapshot, revenueSnapshot] = await Promise.all([
      DailyProfit.findOne({ userId, date: CLOSE_DATE }).lean(),
      DailyRevenue.findOne({ userId, date: CLOSE_DATE }).lean()
    ]);
    expect(profitSnapshot).toMatchObject({
      totalAssets: 11000,
      dailyProfitAmount: 1000,
      dailyReturn: 10,
      valuationQuality: 'complete'
    });
    expect(revenueSnapshot).toMatchObject({
      totalAssets: 11000,
      revenue: 1000,
      returnRate: 10,
      valuationQuality: 'complete'
    });

    const [summary, calendar, curve, history] = await Promise.all([
      request(app).get('/api/assets/summary').set('Authorization', `Bearer ${token}`),
      request(app)
        .get(`/api/assets/profit-calendar?year=${CLOSE_YEAR}&month=${CLOSE_MONTH}`)
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .get(`/api/assets/profit-curve?startDate=${OPEN_DATE}&endDate=${CLOSE_DATE}`)
        .set('Authorization', `Bearer ${token}`),
      request(app)
        .get('/api/trades/history-holdings?sort=lastTradeDate')
        .set('Authorization', `Bearer ${token}`)
    ]);

    expect(summary.statusCode).toBe(200);
    expect(calendar.statusCode).toBe(200);
    expect(curve.statusCode).toBe(200);
    expect(history.statusCode).toBe(200);

    expect(summary.body).toMatchObject({
      totalAssets: 11000,
      totalDailyProfit: 1000,
      holdingsMarketValue: 0,
      cashByCurrency: { CNY: 11000, HKD: 0, USD: 0 },
      valuationQuality: 'complete'
    });
    expect(summary.body.totalDailyProfit).toBe(revenueSnapshot.revenue);
    expect(calendar.body.dailyProfits[CLOSE_DATE]).toBe(revenueSnapshot.revenue);
    expect(calendar.body.dailyReturns[CLOSE_DATE]).toBe(profitSnapshot.dailyReturn);
    expect(curve.body.data.at(-1)).toMatchObject({ date: CLOSE_DATE, value: 10 });

    expect(history.body).toMatchObject({ total: 1 });
    expect(history.body.list).toHaveLength(1);
    expect(history.body.list[0]).toMatchObject({
      symbol: '600519.SH',
      cycleId: '600519.SH:1',
      cumulativeProfit: 1000,
      tradesCount: 2
    });
    expect(history.body.list[0].profitRate).toBeCloseTo(0.1, 8);
  });
});
