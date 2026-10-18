const request = require('supertest');

jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1, USD: 7.2, HKD: 0.92 }))
}));

const app = require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');
const { CorporateAction } = require('../src/models/CorporateAction');

let token;
let userId;
const auth = () => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const user = await User.create({ username: 'corporate-action-test', password: 'password123', nickname: '公司行动测试' });
  userId = user._id;
  const res = await request(app).post('/api/auth/login').send({ username: 'corporate-action-test', password: 'password123' });
  token = res.body.token;
});

beforeEach(async () => {
  await Promise.all([Trade.deleteMany({ userId }), Holding.deleteMany({ userId }), Asset.deleteMany({ userId }), CorporateAction.deleteMany({ userId })]);
});

afterAll(async () => { await User.deleteMany({ username: 'corporate-action-test' }); });

describe('公司行动 API', () => {
  test('未登录不能读取公司行动', async () => {
    const res = await request(app).get('/api/corporate-actions');
    expect(res.statusCode).toBe(401);
  });

  test('一拆二会自动重算持仓，且不创建伪交易', async () => {
    const trade = await request(app).post('/api/trades').set(auth()).send({
      symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'BUY', price: 1, quantity: 4000,
      commission: 0, currency: 'CNY', date: '2026-04-09T09:30:00+08:00'
    });
    expect(trade.statusCode).toBe(201);

    const res = await request(app).post('/api/corporate-actions').set(auth()).send({
      symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'SPLIT', currency: 'CNY', date: '2026-04-10',
      ratioNumerator: 2, ratioDenominator: 1
    });

    expect(res.statusCode).toBe(201);
    const holding = await Holding.findOne({ userId, symbol: '159516.SZ' }).lean();
    expect(holding.quantity).toBe(8000);
    expect(holding.avgCost).toBe(0.5);
    expect(await Trade.countDocuments({ userId, symbol: '159516.SZ' })).toBe(1);
    // The merged ledger must allow selling shares created by the split.
    const sell = await request(app).post('/api/trades').set(auth()).send({
      symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'SELL', price: 0.6, quantity: 8000,
      commission: 0, currency: 'CNY', date: '2026-04-11T09:30:00+08:00'
    });
    expect(sell.statusCode).toBe(201);
    expect(await Holding.countDocuments({ userId, symbol: '159516.SZ' })).toBe(0);
  });

  test('同一证券同一日期的公司行动拒绝重复新增', async () => {
    const payload = {
      symbol: '00700.HK', name: '腾讯控股', type: 'CASH_DIVIDEND', currency: 'HKD', date: '2026-05-20',
      cashAmount: 120
    };
    const first = await request(app).post('/api/corporate-actions').set(auth()).send(payload);
    const duplicate = await request(app).post('/api/corporate-actions').set(auth()).send({ ...payload, type: 'STOCK_DIVIDEND', quantityChange: 10 });
    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(409);
  });

  test('更新与删除会重新计算', async () => {
    const created = await request(app).post('/api/corporate-actions').set(auth()).send({
      symbol: '600000.SH', name: '浦发银行', type: 'CASH_DIVIDEND', currency: 'CNY', date: '2026-06-01',
      cashAmount: 10
    });
    expect(created.statusCode).toBe(201);

    const updated = await request(app).put(`/api/corporate-actions/${created.body._id}`).set(auth()).send({
      ...created.body, cashAmount: 12, date: '2026-05-31'
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.body.cashAmount).toBe(12);

    const list = await request(app).get('/api/corporate-actions').set(auth());
    expect(list.statusCode).toBe(200);
    expect(list.body.list).toHaveLength(1);

    const deleted = await request(app).delete(`/api/corporate-actions/${created.body._id}`).set(auth());
    expect(deleted.statusCode).toBe(200);
    expect(await CorporateAction.countDocuments({ userId })).toBe(0);
  });
});

