jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1 }))
}));

require('../src/index');
const scheduler = require('../src/services/profitCurveScheduler');
const User = require('../src/models/User');
const { Trade } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');
const Snapshot = require('../src/models/Snapshot');
const DailyProfit = require('../src/models/DailyProfit');

describe('monthly snapshot costs', () => {
  let userId;

  beforeAll(async () => {
    const user = await User.create({ username: 'monthlysnapshottest', password: 'password123', nickname: 'Monthly Snapshot Test' });
    userId = user._id;
  });

  beforeEach(async () => {
    await Promise.all([Trade.deleteMany({ userId }), Asset.deleteMany({ userId }), Snapshot.deleteMany({ userId }), DailyProfit.deleteMany({ userId })]);
  });

  afterAll(async () => { await User.deleteMany({ _id: userId }); });

  test('月度快照保存标准加权成本，不保存摊薄成本或零成本', async () => {
    await Asset.create({ userId, totalAssets: 1000, cash: 0, holdingsMarketValue: 1000, totalProfit: 0 });
    await Trade.create([
      { userId, symbol: '600519.SH', name: '贵州茅台', type: 'BUY', price: 100, quantity: 100, commission: 0, currency: 'CNY', fxRateToCNY: 1, grossAmount: 10000, netSettlementAmount: 10000, date: new Date('2026-08-01T01:30:00.000Z') },
      { userId, symbol: '600519.SH', name: '贵州茅台', type: 'SELL', price: 120, quantity: 50, commission: 0, currency: 'CNY', fxRateToCNY: 1, grossAmount: 6000, netSettlementAmount: 6000, date: new Date('2026-08-02T01:30:00.000Z') }
    ]);

    await scheduler.checkAndCreateMonthlySnapshot('2026-09-01');
    const snapshot = await Snapshot.findOne({ userId, type: 'monthly', period: '2026-08' }).lean();

    expect(snapshot.holdings).toHaveLength(1);
    expect(snapshot.holdings[0].avgCost).toBe(100);
  });
});
