const request = require('supertest');

jest.mock('../src/utils/currency', () => ({
  getRates: jest.fn(() => Promise.resolve({ CNY: 1, USD: 7.2, HKD: 0.92 }))
}));

const app = require('../src/index');
const User = require('../src/models/User');
const { Asset } = require('../src/models/Asset');
const Transfer = require('../src/models/Transfer');
const dirtyDataManager = require('../src/services/dirtyDataManager');

let token;
let userId;

beforeAll(async () => {
  const user = await User.create({ username: 'transfertest', password: 'password123', nickname: 'Transfer Test' });
  userId = user._id;
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'transfertest', password: 'password123' });
  token = res.body.token;
});

beforeEach(async () => {
  await Transfer.deleteMany({ userId });
  await Asset.deleteMany({ userId });
});

describe('Transfer API', () => {
  test('should reject invalid transfer type', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'INVALID', amount: 10000 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Type must be IN or OUT');
  });

  test('should reject negative amount', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amount: -100 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Amount must be a positive number');
  });

  test('should reject OUT when cash is insufficient', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'OUT', amount: 10000 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Insufficient cash');
  });

  test('外币入金锁定实际人民币金额，并由账本持久化原始币种现金', async () => {
    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amount: 100, currency: 'USD', date: '2026-09-19 09:00:00' });

    expect(res.statusCode).toBe(201);
    expect(res.body.fxRateToCNY).toBe(7.2);
    expect(res.body.amountCNY).toBe(720);

    const [transfer, asset] = await Promise.all([
      Transfer.findOne({ userId }),
      Asset.findOne({ userId })
    ]);
    expect(transfer.toObject()).toMatchObject({
      currency: 'USD',
      fxRateToCNY: 7.2,
      amountCNY: 720
    });
    expect(asset.cashBalances.get('USD')).toBe(100);
    expect(asset.cash).toBe(720);
    expect(asset.currentPrincipal).toBe(720);
  });

  test('OUT 必须检查原始币种现金余额，而不是人民币估值余额', async () => {
    await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amount: 1000, currency: 'CNY' });

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'OUT', amount: 100, currency: 'USD' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain('Insufficient cash');
  });

  test('跨北京时间日期的入金从其北京时间归属日触发脏数据重算', async () => {
    const markDirtyFromDate = jest.spyOn(dirtyDataManager, 'markDirtyFromDate').mockResolvedValue({});
    const asyncRecalculate = jest.spyOn(dirtyDataManager, 'asyncRecalculate').mockResolvedValue();

    const res = await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amount: 100, date: '2026-09-19T16:30:00.000Z' });

    expect(res.statusCode).toBe(201);
    expect(markDirtyFromDate).toHaveBeenCalledWith(expect.anything(), '2026-09-20');
    expect(asyncRecalculate).toHaveBeenCalledWith(expect.anything());

    markDirtyFromDate.mockRestore();
    asyncRecalculate.mockRestore();
  });
  test('should create IN transfer and return total', async () => {
    await request(app)
      .post('/api/transfers')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amount: 10000, remark: '初始入金' });

    const res = await request(app)
      .get('/api/transfers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.list.length).toBe(1);
    expect(res.body.total).toBe(1);
  });
});