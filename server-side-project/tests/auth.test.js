const request = require('supertest');

const app = require('../src/index');
const User = require('../src/models/User');

describe('Auth API', () => {
  beforeAll(async () => {
    await User.deleteMany({ username: { $in: ['testuser', 'nonexistent'] } });
  });

  test('should reject login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nonexistent', password: 'wrong' });
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBeDefined();
  });

  test('should register and login a user', async () => {
    await User.create({ username: 'testuser', password: 'password123', nickname: 'Test' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.userInfo).toBeDefined();
  });

  test('should reject access without token', async () => {
    const res = await request(app).get('/api/assets/summary');
    expect(res.statusCode).toBe(401);
  });
});
