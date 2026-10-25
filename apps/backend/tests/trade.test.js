const request = require('supertest');

jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1, USD: 7.2, HKD: 0.92 }))
}));

const app = require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');
const { getRates } = require('../src/utils/currency');

let token;
let userId;

beforeAll(async () => {
  const user = await User.create({ username: 'tradetest', password: 'password123', nickname: 'Trade Test' });
  userId = user._id;
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'tradetest', password: 'password123' });
  token = res.body.token;
});

beforeEach(async () => {
  getRates.mockResolvedValue({ CNY: 1, USD: 7.2, HKD: 0.92 });
  await Trade.deleteMany({ userId });
  await Holding.deleteMany({ userId });
  await Asset.deleteMany({ userId });
});

describe('Trade API', () => {
  test('should reject trade creation with invalid type', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'INVALID',
        price: 1800,
        quantity: 100,
        date: '2026-06-27T09:30:00+08:00',
        name: '贵州茅台'
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Type must be BUY or SELL');
  });

  test('should reject trade creation with negative price', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: -100,
        quantity: 100,
        date: '2026-06-27T09:30:00+08:00',
        name: '贵州茅台'
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Price must be a positive number');
  });

  test('should create a BUY trade and update holdings', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 1800,
        quantity: 100,
        commission: 10,
        date: '2026-06-27T09:30:00+08:00',
        name: '贵州茅台',
        isSystemCompliant: '符合系统',
        cognitiveBias: '过早确认',
        improvementMeasures: '等待放量突破'
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.isSystemCompliant).toBe('符合系统');
    expect(res.body.cognitiveBias).toBe('过早确认');
  });

  test('拒绝请求币种与标的市场币种冲突的交易', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '00700.HK',
        currency: 'USD',
        type: 'BUY',
        price: 100,
        quantity: 1,
        commission: 0,
        date: '2026-06-27T09:30:00+08:00',
        name: '腾讯控股'
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/currency/i);
  });

  test('外币交易按生产汇率计算人民币现金', async () => {
    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: 'AAPL.US',
        type: 'BUY',
        price: 10,
        quantity: 3,
        commission: 1,
        date: '2026-06-27T09:30:00+08:00',
        name: 'Apple'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({
      currency: 'USD',
      price: 10, quantity: 3, commission: 1
    });

    const [trade, asset] = await Promise.all([
      Trade.findById(res.body._id),
      Asset.findOne({ userId })
    ]);
    expect(trade.toObject()).toMatchObject({
      currency: 'USD',
      price: 10, quantity: 3, commission: 1
    });

    expect(asset.cash).toBe(-223.2);
  });

  test('复盘编辑保留交易金额，经济字段更正按当前汇率重算', async () => {
    const created = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: 'AAPL.US',
        type: 'BUY',
        price: 10,
        quantity: 2,
        commission: 1,
        date: '2026-06-27T09:30:00+08:00',
        name: 'Apple'
      });

    const reviewOnly = await request(app)
      .put(`/api/trades/${created.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ logic: '仅补充复盘结论' });

    expect(reviewOnly.statusCode).toBe(200);
    expect(reviewOnly.body).toMatchObject({
      price: 10, quantity: 2, commission: 1
    });

    getRates.mockResolvedValue({ CNY: 1, USD: 7.3, HKD: 0.92 });
    const corrected = await request(app)
      .put(`/api/trades/${created.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 12, commission: 2 });

    expect(corrected.statusCode).toBe(200);
    expect((await Asset.findOne({ userId })).cash).toBe(-189.8);
    expect(corrected.body).toMatchObject({
      price: 12, quantity: 2, commission: 2
    });
  });
  test('should update a trade without crashing (currency inference after fetch)', async () => {
    const created = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 1800,
        quantity: 100,
        date: '2026-06-27T09:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .put(`/api/trades/${created.body._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        price: 1850,
        isSystemCompliant: '不符合系统'
      });
    expect(res.statusCode).toBe(200);
    expect(res.body.price).toBe(1850);
    expect(res.body.isSystemCompliant).toBe('不符合系统');
  });

  test('should reject SELL when quantity exceeds holdings', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 1800,
        quantity: 100,
        date: '2026-06-27T09:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 1850,
        quantity: 200,
        date: '2026-06-27T14:30:00+08:00',
        name: '贵州茅台'
      });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Sell quantity exceeds holding quantity');
  });
  test('补录早于买入日的卖出会被拒绝且不写入非法账本', async () => {
    const buy = await request(app).post('/api/trades').set('Authorization', `Bearer ${token}`).send({
      symbol: '600519.SH', type: 'BUY', price: 10, quantity: 100, commission: 0,
      date: '2026-09-02T09:30:00+08:00', name: '贵州茅台'
    });
    expect(buy.statusCode).toBe(201);

    const sell = await request(app).post('/api/trades').set('Authorization', `Bearer ${token}`).send({
      symbol: '600519.SH', type: 'SELL', price: 10, quantity: 100, commission: 0,
      date: '2026-09-01T09:30:00+08:00', name: '贵州茅台'
    });

    expect(sell.statusCode).toBe(400);
    expect(await Trade.countDocuments({ userId })).toBe(1);
  });

  test('删除会导致后续卖出超卖的买入时应拒绝删除并保留交易', async () => {
    const buy = await request(app).post('/api/trades').set('Authorization', `Bearer ${token}`).send({
      symbol: '600519.SH', type: 'BUY', price: 10, quantity: 100, commission: 0,
      date: '2026-09-01T09:30:00+08:00', name: '贵州茅台'
    });
    const sell = await request(app).post('/api/trades').set('Authorization', `Bearer ${token}`).send({
      symbol: '600519.SH', type: 'SELL', price: 11, quantity: 100, commission: 0,
      date: '2026-09-02T09:30:00+08:00', name: '贵州茅台'
    });
    expect(buy.statusCode).toBe(201);
    expect(sell.statusCode).toBe(201);

    const deletion = await request(app).delete(`/api/trades/reviews/${buy.body._id}`).set('Authorization', `Bearer ${token}`);

    expect(deletion.statusCode).toBe(400);
    expect(await Trade.findById(buy.body._id)).not.toBeNull();
  });
});

describe('GET /api/trades/history-holdings', () => {
  test('同一标的两轮完整清仓按独立周期返回历史持仓', async () => {
    const trades = [
      { symbol: '600519.SH', type: 'BUY', price: 10, quantity: 100, date: '2026-06-01T09:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'SELL', price: 11, quantity: 100, date: '2026-06-02T14:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'BUY', price: 20, quantity: 100, date: '2026-06-03T09:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'SELL', price: 22, quantity: 100, date: '2026-06-04T14:30:00+08:00', name: '贵州茅台' }
    ];

    for (const trade of trades) {
      const created = await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...trade, commission: 0 });
      expect(created.statusCode).toBe(201);
    }

    const res = await request(app)
      .get('/api/trades/history-holdings?sort=lastTradeDate')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.list).toHaveLength(2);
    expect(res.body.list.map(item => item.cycleId)).toEqual(['600519.SH:1', '600519.SH:2']);
    expect(res.body.list.map(item => item.cumulativeProfit)).toEqual([100, 200]);
    expect(res.body.list.map(item => item.profitRate)).toEqual([0.1, 0.1]);
    expect(res.body.list.map(item => item.tradesCount)).toEqual([2, 2]);
  });
});
describe('GET /api/trades/history-holdings/:symbol/groups', () => {
  test('单次买入清仓应返回一个分仓，实现盈亏正确', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 100,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/history-holdings/600519.SH/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].realizedProfit).toBe(200);
    expect(res.body.list[0].tradesCount).toBe(2);
    expect(res.body.list[0].profitRate).toBeCloseTo(0.2, 4);
  });

  test('同一股票多次清仓应产生多个分仓', async () => {
    const trades = [
      { symbol: '600519.SH', type: 'BUY', price: 10, quantity: 100, date: '2026-06-01T09:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'SELL', price: 12, quantity: 100, date: '2026-06-02T14:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'BUY', price: 15, quantity: 200, date: '2026-06-03T09:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'SELL', price: 18, quantity: 200, date: '2026-06-04T14:30:00+08:00', name: '贵州茅台' }
    ];

    for (const t of trades) {
      await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${token}`)
        .send(t);
    }

    const res = await request(app)
      .get('/api/trades/history-holdings/600519.SH/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(2);
    // History groups are returned newest-first.
    expect(res.body.list[0].realizedProfit).toBe(600);
    expect(res.body.list[1].realizedProfit).toBe(200);
  });

  test('部分卖出后未归零不应产生新分仓', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 30,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 13,
        quantity: 70,
        date: '2026-06-03T14:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/history-holdings/600519.SH/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].tradesCount).toBe(3);
  });

  test('手续费应影响实现盈亏', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 10,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 100,
        commission: 10,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/history-holdings/600519.SH/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].realizedProfit).toBe(180);
  });

  test('港股交易应按汇率换算为 CNY', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '00700.HK',
        type: 'BUY',
        price: 100,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '腾讯控股'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '00700.HK',
        type: 'SELL',
        price: 110,
        quantity: 100,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '腾讯控股'
      });

    const res = await request(app)
      .get('/api/trades/history-holdings/00700.HK/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    // (11000 - 10000) * 0.92 = 920
    expect(res.body.list[0].realizedProfit).toBe(920);
    expect(res.body.list[0].currency).toBe('HKD');
  });

  test('无交易的股票应返回空列表', async () => {
    const res = await request(app)
      .get('/api/trades/history-holdings/000001.SZ/groups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toEqual([]);
  });
});

describe('GET /api/trades/holdings/:symbol/trades', () => {
  test('已清仓股票应返回空列表', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 100,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/holdings/600519.SH/trades')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  test('当前持仓应返回当前批次交易', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/holdings/600519.SH/trades')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].type).toBe('BUY');
    expect(res.body.list[0].quantity).toBe(100);
  });

  test('历史清仓后重新买入，只返回新批次交易', async () => {
    const trades = [
      { symbol: '600519.SH', type: 'BUY', price: 10, quantity: 100, date: '2026-06-01T09:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'SELL', price: 12, quantity: 100, date: '2026-06-02T14:30:00+08:00', name: '贵州茅台' },
      { symbol: '600519.SH', type: 'BUY', price: 15, quantity: 200, date: '2026-06-03T09:30:00+08:00', name: '贵州茅台' }
    ];

    for (const t of trades) {
      await request(app)
        .post('/api/trades')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...t, commission: 0 });
    }

    const res = await request(app)
      .get('/api/trades/holdings/600519.SH/trades')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].type).toBe('BUY');
    expect(res.body.list[0].price).toBe(15);
    expect(res.body.list[0].quantity).toBe(200);
  });

  test('部分卖出未清仓，应返回买入和部分卖出记录', async () => {
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });

    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 30,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    const res = await request(app)
      .get('/api/trades/holdings/600519.SH/trades')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.list).toHaveLength(2);
    // Holding operations are returned newest-first, like history details.
    expect(res.body.list[0].type).toBe('SELL');
    expect(res.body.list[1].type).toBe('BUY');
  });
});

describe('POST /api/trades/history-holdings/groups/batch', () => {
  test('应一次性返回多只股票的历史清仓分组', async () => {
    // 600519.SH 一次完整清仓
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'BUY',
        price: 10,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '贵州茅台'
      });
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '600519.SH',
        type: 'SELL',
        price: 12,
        quantity: 100,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '贵州茅台'
      });

    // 00700.HK 一次完整清仓
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '00700.HK',
        type: 'BUY',
        price: 100,
        quantity: 100,
        commission: 0,
        date: '2026-06-01T09:30:00+08:00',
        name: '腾讯控股'
      });
    await request(app)
      .post('/api/trades')
      .set('Authorization', `Bearer ${token}`)
      .send({
        symbol: '00700.HK',
        type: 'SELL',
        price: 110,
        quantity: 100,
        commission: 0,
        date: '2026-06-02T14:30:00+08:00',
        name: '腾讯控股'
      });

    const res = await request(app)
      .post('/api/trades/history-holdings/groups/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbols: ['600519.SH', '00700.HK', '000001.SZ'] });

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.list)).toBe(true);
    expect(res.body.list).toHaveLength(3);

    const bySymbol = Object.fromEntries(res.body.list.map(item => [item.symbol, item.groups]));
    expect(bySymbol['600519.SH']).toHaveLength(1);
    expect(bySymbol['600519.SH'][0].realizedProfit).toBe(200);
    expect(bySymbol['00700.HK']).toHaveLength(1);
    expect(bySymbol['00700.HK'][0].realizedProfit).toBe(920);
    expect(bySymbol['000001.SZ']).toEqual([]);
  });

  test('symbols 为空或不合法时应返回 400', async () => {
    const res1 = await request(app)
      .post('/api/trades/history-holdings/groups/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbols: [] });
    expect(res1.statusCode).toBe(400);

    const res2 = await request(app)
      .post('/api/trades/history-holdings/groups/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ symbols: ['', '   '] });
    expect(res2.statusCode).toBe(400);
  });
});

describe('统一股票搜索入口', () => {
  test.each(['海南', '002163', 'hnfz', 'hainanfazhan', 'HNFZ'])('复盘及历史持仓按 %s 搜索且在分页前筛选', async keyword => {
    await Trade.insertMany([
      { userId, symbol: '002163.SZ', name: '海南发展', type: 'BUY', price: 10, quantity: 100, date: new Date('2026-06-01T01:00:00Z'), currency: 'CNY', fxRateToCNY: 1, grossAmount: 1000, netSettlementAmount: 1000 },
      { userId, symbol: '002163.SZ', name: '海南发展', type: 'SELL', price: 11, quantity: 100, date: new Date('2026-06-02T01:00:00Z'), currency: 'CNY', fxRateToCNY: 1, grossAmount: 1000, netSettlementAmount: 1000 },
      { userId, symbol: '600519.SH', name: '贵州茅台', type: 'BUY', price: 10, quantity: 100, date: new Date('2026-06-03T01:00:00Z'), currency: 'CNY', fxRateToCNY: 1, grossAmount: 1000, netSettlementAmount: 1000 }
    ]);
    const trades = await request(app).get('/api/trades/reviews').query({ symbol: keyword, pageSize: 1 }).set('Authorization', `Bearer ${token}`);
    expect(trades.statusCode).toBe(200);
    expect(trades.body.total).toBe(2);
    expect(trades.body.list).toHaveLength(1);
    expect(trades.body.list[0].symbol).toBe('002163.SZ');
    const history = await request(app).get('/api/trades/history-holdings').query({ keyword, pageSize: 1 }).set('Authorization', `Bearer ${token}`);
    expect(history.statusCode).toBe(200);
    expect(history.body.total).toBe(1);
    expect(history.body.list[0].symbol).toBe('002163.SZ');
  });
});
