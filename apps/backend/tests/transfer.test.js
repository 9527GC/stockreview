const request = require('supertest');

const app = require('../src/index');
const User = require('../src/models/User');
const { Asset } = require('../src/models/Asset');
const Transfer = require('../src/models/Transfer');

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
