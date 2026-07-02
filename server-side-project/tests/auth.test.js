const request = require('supertest');

const app = require('../src/index');
const User = require('../src/models/User');
const TokenBlacklist = require('../src/models/TokenBlacklist');

describe('Auth API', () => {
  beforeAll(async () => {
    await User.deleteMany({ username: { $in: ['testuser', 'nonexistent', 'newuser'] } });
    await TokenBlacklist.deleteMany({});
  });

  afterAll(async () => {
    await User.deleteMany({ username: { $in: ['testuser', 'nonexistent', 'newuser'] } });
    await TokenBlacklist.deleteMany({});
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

  test('should register a new user via register endpoint', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'password123', nickname: 'New' });
    expect(res.statusCode).toBe(201);
    expect(res.body.token).toBeDefined();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'newuser', password: 'password123' });
    expect(loginRes.statusCode).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  test('should reject duplicate registration', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', password: 'password123' });
    expect(res.statusCode).toBe(409);
  });

  test('should logout and invalidate token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    const token = loginRes.body.token;

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(logoutRes.statusCode).toBe(200);

    const protectedRes = await request(app)
      .get('/api/assets/summary')
      .set('Authorization', `Bearer ${token}`);
    expect(protectedRes.statusCode).toBe(401);
  });

  test('should change password', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    const token = loginRes.body.token;

    const changeRes = await request(app)
      .put('/api/auth/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: 'password123', newPassword: 'newpassword123' });
    expect(changeRes.statusCode).toBe(200);

    const oldLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' });
    expect(oldLoginRes.statusCode).toBe(401);

    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'newpassword123' });
    expect(newLoginRes.statusCode).toBe(200);
  });
});
