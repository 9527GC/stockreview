const mongoose = require('mongoose');
require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const Transfer = require('../src/models/Transfer');
const { Asset } = require('../src/models/Asset');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');
const { resetUserBusinessData, runCli } = require('../scripts/reset-user-business-data');

jest.setTimeout(15000);

let user;

beforeAll(async () => {
  await mongoose.connection.asPromise();
});

const createBusinessData = async (userId) => {
  await Promise.all([
    Trade.create({
      userId,
      symbol: '600519.SH',
      name: '贵州茅台',
      type: 'BUY',
      price: 100,
      quantity: 1,
      commission: 0,
      currency: 'CNY',
      fxRateToCNY: 1,
      grossAmount: 100,
      netSettlementAmount: 100,
      date: new Date('2026-09-19T09:00:00+08:00')
    }),
    Holding.create({ userId, symbol: '600519.SH', name: '贵州茅台', quantity: 1, avgCost: 100, currency: 'CNY' }),
    Transfer.create({ userId, type: 'IN', amount: 100, currency: 'CNY', fxRateToCNY: 1, amountCNY: 100 }),
    Asset.create({ userId, totalAssets: 100, cash: 100 }),
    DailyProfit.create({ userId, date: '2026-09-19', dailyProfitAmount: 0 }),
    DailyRevenue.create({ userId, date: '2026-09-19', revenue: 0 })
  ]);
};

beforeEach(async () => {
  user = await User.create({
    username: `reset-user-${Date.now()}-${Math.random()}`,
    password: 'password123',
    wechatOpenId: `openid-${Date.now()}-${Math.random()}`
  });
  await createBusinessData(user._id);
});

afterEach(async () => {
  if (!user) return;
  await Promise.all([
    Trade.deleteMany({ userId: user._id }),
    Holding.deleteMany({ userId: user._id }),
    Transfer.deleteMany({ userId: user._id }),
    Asset.deleteMany({ userId: user._id }),
    DailyProfit.deleteMany({ userId: user._id }),
    DailyRevenue.deleteMany({ userId: user._id }),
    User.deleteOne({ _id: user._id })
  ]);

});

describe('resetUserBusinessData', () => {
  test('缺少确认参数时不删除任何业务数据', async () => {
    await expect(resetUserBusinessData({ userId: user._id })).rejects.toThrow('--confirm');

    await expect(Trade.countDocuments({ userId: user._id })).resolves.toBe(1);
    await expect(Asset.countDocuments({ userId: user._id })).resolves.toBe(1);
  });

  test('重置删除业务集合但保留用户身份与微信绑定', async () => {
    user.commissionPreference.set('CN', { mode: 'amount', rate: 0, amount: 42 });
    await user.save();

    const result = await resetUserBusinessData({ userId: user._id, confirm: true });

    expect(result.deleted).toMatchObject({ Trade: 1, Holding: 1, Transfer: 1, Asset: 1, DailyProfit: 1, DailyRevenue: 1 });
    await expect(Trade.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(Holding.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(Transfer.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(Asset.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(DailyProfit.countDocuments({ userId: user._id })).resolves.toBe(0);
    await expect(DailyRevenue.countDocuments({ userId: user._id })).resolves.toBe(0);
    const resetUser = await User.findById(user._id);
    expect(resetUser).toMatchObject({ wechatOpenId: user.wechatOpenId });
    expect(resetUser.commissionPreference.get('CN').toObject()).toMatchObject({ mode: 'rate', rate: 5, amount: 0 });
  });
  test('CLI 在连接数据库前拒绝缺少单用户确认参数的命令', async () => {
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    await expect(runCli(['--userId', String(user._id)])).rejects.toThrow('--confirm');
    process.env.MONGODB_URI = originalUri;
  });

  test('CLI 在连接数据库前拒绝缺少全用户确认参数的命令', async () => {
    const originalUri = process.env.MONGODB_URI;
    delete process.env.MONGODB_URI;
    await expect(runCli([])).rejects.toThrow('--confirm-all-users');
    process.env.MONGODB_URI = originalUri;
  });});

