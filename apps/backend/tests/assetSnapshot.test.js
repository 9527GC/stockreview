jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1 }))
}));

jest.mock('../src/utils/marketData', () => ({
  getQuotes: jest.fn(),
  getQuoteLastClose: jest.fn((quote) => {
    const price = Number(quote?.close);
    const date = String(quote?.closeDate || '');
    return Number.isFinite(price) && price > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { price, date } : null;
  })
}));

const app = require('../src/index');
const User = require('../src/models/User');
const Transfer = require('../src/models/Transfer');
const { Trade, Holding } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');
const { getQuotes } = require('../src/utils/marketData');
const { refreshAssetMarketValue } = require('../src/utils/assetSnapshot');
const { BEIJING_OFFSET_MINUTES, getDateStringInOffset } = require('../src/utils/datetime');

const TODAY = getDateStringInOffset(BEIJING_OFFSET_MINUTES);

let userId;

beforeAll(async () => {
  const user = await User.create({
    username: 'valuationsnapshottest',
    password: 'password123',
    nickname: 'Valuation Snapshot Test'
  });
  userId = user._id;
});

beforeEach(async () => {
  getQuotes.mockReset();
  await Promise.all([
    Transfer.deleteMany({ userId }),
    Trade.deleteMany({ userId }),
    Holding.deleteMany({ userId }),
    Asset.deleteMany({ userId })
  ]);
});

afterAll(async () => {
  await User.deleteMany({ username: 'valuationsnapshottest' });
});

describe('refreshAssetMarketValue', () => {
  test('保留现有现金并按实时行情更新资产，缓存前收盘价', async () => {
    await Transfer.create({
      userId,
      type: 'IN',
      amount: 1000,
      currency: 'CNY',
      fxRateToCNY: 1,
      amountCNY: 1000,
      date: new Date('2026-09-19T01:00:00.000Z')
    });
    await Trade.create({
      userId,
      symbol: '600519.SH',
      name: '贵州茅台',
      type: 'BUY',
      price: 50,
      quantity: 2,
      commission: 0,
      currency: 'CNY',
      fxRateToCNY: 1,
      grossAmount: 100,
      netSettlementAmount: 100,
      date: new Date('2026-09-19T02:00:00.000Z')
    });
    await Holding.create({
      userId,
      symbol: '600519.SH',
      name: '贵州茅台',
      quantity: 2,
      avgCost: 50,
      currency: 'CNY'
    });
    await Asset.create({ userId, cash: 900, currentPrincipal: 1000 });
    getQuotes.mockResolvedValue({
      '600519.SH': {
        symbol: '600519.SH',
        price: 50,
        preClose: 46,
        quoteDate: TODAY,
        close: 45,
        closeDate: '2026-09-18'
      }
    });

    const asset = await refreshAssetMarketValue(userId);
    const holding = await Holding.findOne({ userId }).lean();

    expect(asset.toObject()).toMatchObject({
      cash: 900,
      holdingsMarketValue: 100,
      totalAssets: 1000
    });
    expect(holding).toMatchObject({
      lastPrice: 46
    });
  });
});
