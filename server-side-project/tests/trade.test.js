const request = require('supertest');

const app = require('../src/index');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');

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
});
