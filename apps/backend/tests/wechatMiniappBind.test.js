const request = require('supertest');

jest.mock('../src/services/wechatMiniappService', () => ({
  ensureConfig: jest.fn(),
  getUnlimitedCode: jest.fn(),
  getJsCodeSession: jest.fn(),
  resetCacheForTests: jest.fn()
}));

const app = require('../src/index');
const User = require('../src/models/User');
const WechatBindSession = require('../src/models/WechatBindSession');
const WechatLoginSession = require('../src/models/WechatLoginSession');
const miniappService = require('../src/services/wechatMiniappService');
const { hashToken } = require('../src/controllers/wechatController');

const testUsers = ['wechat-bind-user', 'wechat-bind-other'];

const login = async (username, password = 'password123') => {
  const response = await request(app).post('/api/auth/login').send({ username, password });
  return response.body.token;
};

describe('mini-program WeChat binding', () => {
  beforeEach(async () => {
    await WechatBindSession.deleteMany({});
    await WechatLoginSession.deleteMany({});
    await User.deleteMany({ username: { $in: testUsers } });
    await User.create({ username: testUsers[0], password: 'password123' });
    await User.create({ username: testUsers[1], password: 'password123' });
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await WechatBindSession.deleteMany({});
    await WechatLoginSession.deleteMany({});
    await User.deleteMany({ username: { $in: testUsers } });
  });

  test('creates a short-lived mini-program code for the signed-in user', async () => {
    miniappService.getUnlimitedCode.mockResolvedValue(Buffer.from('mini-program-image'));
    const token = await login(testUsers[0]);

    const response = await request(app)
      .post('/api/users/wechat/miniapp-bind-code')
      .set('Authorization', `Bearer ${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.bindToken).toMatch(/^[a-f0-9]{32}$/);
    expect(response.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(response.body.expiresIn).toBe(300);

    const session = await WechatBindSession.findOne({ tokenHash: hashToken(response.body.bindToken) });
    expect(session.userId).toBeDefined();
    expect(session.status).toBe('pending');
  });

  test('binds the scanned mini-program identity and exposes bound status only to its owner', async () => {
    const user = await User.findOne({ username: testUsers[0] });
    const bindingToken = 'a'.repeat(32);
    await WechatBindSession.create({
      tokenHash: hashToken(bindingToken),
      userId: user._id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    miniappService.getJsCodeSession.mockResolvedValue({ openid: 'mini-open-id', unionid: 'mini-union-id' });

    const bindResponse = await request(app)
      .post('/api/users/wechat/miniapp-bind')
      .send({
        code: 'temporary-login-code',
        bindingToken,
        profile: {
          nickname: '测试微信昵称',
          avatar: 'https://example.com/wechat-avatar.png'
        }
      });
    expect(bindResponse.statusCode).toBe(200);
    expect(bindResponse.body.bound).toBe(true);

    const updatedUser = await User.findById(user._id);
    expect(updatedUser.wechatOpenId).toBe('mini-open-id');
    expect(updatedUser.wechatUnionId).toBe('mini-union-id');
    expect(updatedUser.wechatNickname).toBe('测试微信昵称');
    expect(updatedUser.wechatAvatar).toBe('https://example.com/wechat-avatar.png');

    const ownerToken = await login(testUsers[0]);
    const statusResponse = await request(app)
      .get(`/api/users/wechat/miniapp-bind-status?token=${bindingToken}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.body.status).toBe('bound');

    const profileResponse = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(profileResponse.statusCode).toBe(200);
    expect(profileResponse.body.wechatNickname).toBe('测试微信昵称');
    expect(profileResponse.body.wechatAvatar).toBe('https://example.com/wechat-avatar.png');

    const otherToken = await login(testUsers[1]);
    const otherResponse = await request(app)
      .get(`/api/users/wechat/miniapp-bind-status?token=${bindingToken}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherResponse.statusCode).toBe(200);
    expect(otherResponse.body.status).toBe('expired');
  });
  test('returns the saved WeChat profile when a mini-program visitor is already bound', async () => {
    const user = await User.findOne({ username: testUsers[0] });
    user.wechatOpenId = 'current-binding-open-id';
    user.wechatNickname = '已绑定微信昵称';
    user.wechatAvatar = 'https://example.com/bound-avatar.png';
    await user.save();
    miniappService.getJsCodeSession.mockResolvedValue({ openid: 'current-binding-open-id' });

    const response = await request(app)
      .post('/api/users/wechat/miniapp-current-binding')
      .send({ code: 'current-binding-login-code' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      bound: true,
      account: {
        nickname: '已绑定微信昵称',
        avatar: 'https://example.com/bound-avatar.png'
      }
    });
  });
  test('拒绝领取已过期的确认登录会话，且绝不返回 JWT', async () => {
    const rawToken = 'e'.repeat(24);
    await WechatLoginSession.create({
      tokenHash: hashToken(rawToken),
      status: 'confirmed',
      expiresAt: new Date(Date.now() - 1000),
      loginToken: 'expired-login-token',
      userInfo: { username: testUsers[0] }
    });

    const response = await request(app).get(`/api/auth/wechat/miniapp-login/status?token=${rawToken}`);

    expect(response.statusCode).toBe(410);
    expect(response.body.token).toBeUndefined();
  });

  test('确认后的登录 JWT 只能被原子领取一次', async () => {
    const loginToken = 'single-use-login-token';
    const rawToken = 'f'.repeat(24);
    await WechatLoginSession.create({
      tokenHash: hashToken(rawToken),
      status: 'confirmed',
      expiresAt: new Date(Date.now() + 60 * 1000),
      loginToken,
      jti: 'single-use-jti',
      userInfo: { username: testUsers[0] }
    });

    const firstResponse = await request(app).get(`/api/auth/wechat/miniapp-login/status?token=${rawToken}`);
    const secondResponse = await request(app).get(`/api/auth/wechat/miniapp-login/status?token=${rawToken}`);

    expect(firstResponse.statusCode).toBe(200);
    expect(firstResponse.body).toMatchObject({ status: 'confirmed', token: loginToken });
    expect(secondResponse.statusCode).toBe(409);
    expect(secondResponse.body.token).toBeUndefined();

    const session = await WechatLoginSession.findOne({ tokenHash: hashToken(rawToken) }).lean();
    expect(session.loginToken).toBeUndefined();
    expect(session.jti).toBeUndefined();
    expect(session.usedAt).toBeDefined();
  });

  test('并发绑定请求只有一个可以抢占待处理会话', async () => {
    const user = await User.findOne({ username: testUsers[0] });
    const bindingToken = 'b'.repeat(32);
    await WechatBindSession.create({
      tokenHash: hashToken(bindingToken),
      userId: user._id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });
    miniappService.getJsCodeSession.mockResolvedValue({ openid: 'concurrent-open-id' });

    const bind = () => request(app).post('/api/users/wechat/miniapp-bind').send({
      code: 'concurrent-login-code',
      bindingToken
    });
    const responses = await Promise.all([bind(), bind()]);

    expect(miniappService.getJsCodeSession).toHaveBeenCalledTimes(1);
    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
  });
});
