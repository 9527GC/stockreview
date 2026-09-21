const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const WechatBindSession = require('../models/WechatBindSession');
const WechatLoginSession = require('../models/WechatLoginSession');
const authController = require('./authController');
const miniappService = require('../services/wechatMiniappService');

const WECHAT_APP_ID = process.env.WECHAT_WEB_APP_ID || process.env.WECHAT_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_WEB_APP_SECRET || process.env.WECHAT_APP_SECRET;
const WECHAT_CALLBACK_URL = process.env.WECHAT_CALLBACK_URL;
const FRONTEND_PROFILE_URL = process.env.FRONTEND_PROFILE_URL;
const STATE_EXPIRES_IN = '10m';
const DEFAULT_BIND_EXPIRES_SECONDS = 300;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const getBindExpiresSeconds = () => {
  const value = Number.parseInt(process.env.WECHAT_MINIAPP_BIND_EXPIRES || DEFAULT_BIND_EXPIRES_SECONDS, 10);
  return Number.isFinite(value) && value >= 60 && value <= 600 ? value : DEFAULT_BIND_EXPIRES_SECONDS;
};
const getRemainingSeconds = (expiresAt) => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));

const normalizeWechatProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return {};
  const nickname = typeof profile.nickname === 'string' ? profile.nickname.trim().slice(0, 50) : '';
  const usableNickname = /^(微信用户|微信用户[0-9_ -]*)$/i.test(nickname) ? '' : nickname;
  const avatar = typeof profile.avatar === 'string' && /^https:\/\//i.test(profile.avatar) ? profile.avatar.trim().slice(0, 2048) : '';
  return { ...(usableNickname ? { nickname: usableNickname } : {}), ...(avatar ? { avatar } : {}) };
};

const checkWebWechatConfig = () => {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET || !WECHAT_CALLBACK_URL) {
    throw new Error('WeChat web application environment variables are not configured');
  }
};

/**
 * Legacy website-application OAuth endpoint. The profile UI uses the mini-program
 * QR binding flow below, which works without a WeChat Open Platform website app.
 */
exports.getBindUrl = async (req, res) => {
  try {
    checkWebWechatConfig();
    const state = jwt.sign(
      { userId: req.user._id.toString(), type: 'wechat_bind' },
      process.env.JWT_SECRET,
      { expiresIn: STATE_EXPIRES_IN }
    );
    const redirectUri = encodeURIComponent(WECHAT_CALLBACK_URL);
    const url = `https://open.weixin.qq.com/connect/qrconnect?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`;
    res.json({ url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.callback = async (req, res) => {
  const redirectWith = (status, message) => {
    const fallback = 'http://localhost:5173/#/pages/user/profile';
    const url = new URL(FRONTEND_PROFILE_URL || fallback);
    const hash = url.hash || '#/pages/user/profile';
    const [route, query = ''] = hash.split('?');
    const params = new URLSearchParams(query);
    params.set('wechat_bind', status);
    if (message) params.set('message', message);
    url.hash = `${route}?${params.toString()}`;
    return res.redirect(url.toString());
  };

  try {
    checkWebWechatConfig();
    const { code, state } = req.query;
    if (!code || !state) return redirectWith('error', 'Missing code or state');

    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    if (decoded.type !== 'wechat_bind') return redirectWith('error', 'Invalid state type');

    const { data } = await axios.get('https://api.weixin.qq.com/sns/oauth2/access_token', {
      params: { appid: WECHAT_APP_ID, secret: WECHAT_APP_SECRET, code, grant_type: 'authorization_code' }
    });
    if (!data.openid) return redirectWith('error', data.errmsg || 'Failed to get WeChat openid');

    const existingUser = await User.findOne({
      $or: [{ wechatOpenId: data.openid }, ...(data.unionid ? [{ wechatUnionId: data.unionid }] : [])]
    });
    if (existingUser && existingUser._id.toString() !== decoded.userId) {
      return redirectWith('error', 'This WeChat account is already bound to another user');
    }

    const user = await User.findById(decoded.userId);
    if (!user) return redirectWith('error', 'User not found');
    user.wechatOpenId = data.openid;
    if (data.unionid) user.wechatUnionId = data.unionid;
    await user.save();
    return redirectWith('success');
  } catch (error) {
    console.error('WeChat callback error:', error.message);
    return redirectWith('error', 'WeChat authorization failed');
  }
};

/** Create a short-lived Web-to-mini-program binding task and its mini-program code. */
exports.createMiniappBindCode = async (req, res) => {
  try {
    if (req.user.wechatOpenId) {
      return res.status(409).json({ message: '当前账号已绑定微信，请先解绑后再操作' });
    }

    miniappService.ensureConfig();
    const expiresIn = getBindExpiresSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const token = crypto.randomBytes(16).toString('hex'); // 32 chars: mini-program scene limit

    await WechatBindSession.updateMany(
      { userId: req.user._id, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'failed', failureMessage: '已生成新的绑定二维码' } }
    );
    await WechatBindSession.create({ tokenHash: hashToken(token), userId: req.user._id, expiresAt });

    let image;
    try {
      image = await miniappService.getUnlimitedCode(token);
    } catch (error) {
      await WechatBindSession.deleteOne({ tokenHash: hashToken(token) });
      throw error;
    }

    res.json({
      bindToken: token,
      qrCodeDataUrl: `data:image/png;base64,${image.toString('base64')}`,
      expiresIn
    });
  } catch (error) {
    console.error('Create mini-program bind code failed:', error.message);
    res.status(error.statusCode || 500).json({ message: error.message || '生成小程序码失败' });
  }
};

/** Called from the mini program after scanning the code and receiving wx.login code. */
exports.bindMiniappWechat = async (req, res) => {
  const { code, bindingToken, profile } = req.body || {};
  if (typeof code !== 'string' || !code.trim() || typeof bindingToken !== 'string' || !/^[a-f0-9]{32}$/.test(bindingToken)) {
    return res.status(400).json({ message: '绑定参数无效，请返回网页重新生成二维码' });
  }

  const tokenHash = hashToken(bindingToken);
  const now = new Date();
  let session;
  try {
    session = await WechatBindSession.findOneAndUpdate(
      { tokenHash, status: 'pending', expiresAt: { $gt: now } },
      { $set: { status: 'processing', processingStartedAt: now } },
      { new: true }
    );
    if (!session) {
      const existingSession = await WechatBindSession.findOne({ tokenHash }).lean();

      if (!existingSession || existingSession.expiresAt <= now) {
        return res.status(410).json({ message: '二维码已过期，请返回网页重新生成' });
      }
      return res.status(409).json({ message: existingSession.failureMessage || '该二维码正在处理或已使用，请返回网页查看结果' });
    }

    const { openid, unionid } = await miniappService.getJsCodeSession(code.trim());
    const existingUser = await User.findOne({
      $or: [{ wechatOpenId: openid }, ...(unionid ? [{ wechatUnionId: unionid }] : [])]
    });
    if (existingUser && existingUser._id.toString() !== session.userId.toString()) {
      session.status = 'failed';
      session.failureMessage = '该微信已绑定其他 Stock Review 账号';
      await session.save();
      return res.status(409).json({ message: session.failureMessage });
    }

    const user = await User.findById(session.userId);
    if (!user) {
      session.status = 'failed';
      session.failureMessage = '待绑定账号不存在';
      await session.save();
      return res.status(404).json({ message: session.failureMessage });
    }
    if (user.wechatOpenId && user.wechatOpenId !== openid) {
      session.status = 'failed';
      session.failureMessage = '该 Stock Review 账号已绑定其他微信，请先解绑';
      await session.save();
      return res.status(409).json({ message: session.failureMessage });
    }

    user.wechatOpenId = openid;
    if (unionid) user.wechatUnionId = unionid;
    const wechatProfile = normalizeWechatProfile(profile);
    if (wechatProfile.nickname) user.wechatNickname = wechatProfile.nickname;
    if (wechatProfile.avatar) user.wechatAvatar = wechatProfile.avatar;
    await user.save();

    // Only mark the task complete after the account update succeeds.
    session.status = 'bound';
    session.usedAt = new Date();
    await session.save();
    return res.json({ message: '微信绑定成功', bound: true });
  } catch (error) {
    console.error('Bind mini-program WeChat failed:', error.message);
    if (session && session.status === 'processing') {
      session.status = 'failed';
      session.failureMessage = '绑定失败，请返回网页重新生成二维码';
      await session.save().catch(() => {});
    }
    if (error && error.code === 11000) {
      return res.status(409).json({ message: '该微信已绑定其他 Stock Review 账号' });
    }
    return res.status(error.statusCode || 500).json({ message: error.message || '微信绑定失败' });
  }
};

/** Returns the account/profile associated with the current mini-program WeChat identity. */
exports.getMiniappCurrentBinding = async (req, res) => {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ message: '微信登录参数无效' });
    }
    const { openid, unionid } = await miniappService.getJsCodeSession(code.trim());
    const user = await User.findOne({
      $or: [{ wechatOpenId: openid }, ...(unionid ? [{ wechatUnionId: unionid }] : [])]
    });
    if (!user) return res.json({ bound: false });
    return res.json({
      bound: true,
      account: {
        nickname: user.wechatNickname || user.nickname || user.username,
        avatar: user.wechatAvatar || user.avatar || ''
      }
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || '查询微信绑定状态失败' });
  }
};
/** The signed-in Web user polls this endpoint until the mini program completes binding. */
exports.getMiniappBindStatus = async (req, res) => {
  const { token } = req.query;
  if (typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
    return res.status(400).json({ message: '绑定任务参数无效' });
  }

  const session = await WechatBindSession.findOne({ tokenHash: hashToken(token), userId: req.user._id });
  if (!session || session.expiresAt <= new Date()) {
    return res.json({ status: 'expired', expiresIn: 0 });
  }
  return res.json({
    status: session.status,
    message: session.failureMessage,
    expiresIn: getRemainingSeconds(session.expiresAt),
    wechatBound: session.status === 'bound'
  });
};

exports.unbind = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.wechatOpenId = undefined;
    user.wechatUnionId = undefined;
    user.wechatNickname = undefined;
    user.wechatAvatar = undefined;
    await user.save();
    await WechatBindSession.updateMany(
      { userId: user._id, status: 'pending', expiresAt: { $gt: new Date() } },
      { $set: { status: 'failed', failureMessage: '微信绑定已取消' } }
    );
    res.json({ message: 'WeChat unbound successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports.hashToken = hashToken;

exports.createMiniappLoginCode = async (req, res) => {
  try {
    miniappService.ensureConfig();
    const expiresIn = getBindExpiresSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const token = crypto.randomBytes(12).toString('hex');
    await WechatLoginSession.create({ tokenHash: hashToken(token), expiresAt });
    const image = await miniappService.getUnlimitedCode(`login_${token}`);
    res.json({ token, image: image.toString('base64'), expiresIn });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.getMiniappLoginStatus = async (req, res) => {
  const token = String(req.query.token || '');
  const tokenHash = hashToken(token);
  const now = new Date();
  const session = await WechatLoginSession.findOne({ tokenHash }).lean();
  if (!session) return res.status(404).json({ message: '登录二维码不存在' });

  if (new Date(session.expiresAt) <= now) {
    await WechatLoginSession.updateOne(
      { tokenHash, expiresAt: { $lte: now } },
      { $set: { status: 'expired' }, $unset: { loginToken: '', jti: '' } }
    );
    return res.status(410).json({ message: '登录二维码已失效，请重新扫码' });
  }

  if (session.status !== 'confirmed') return res.json({ status: session.status });

  const claimedSession = await WechatLoginSession.findOneAndUpdate(
    { tokenHash, status: 'confirmed', expiresAt: { $gt: now }, loginToken: { $exists: true } },
    { $set: { usedAt: now }, $unset: { loginToken: '', jti: '' } },
    { new: false }
  ).lean();
  if (!claimedSession) {
    return res.status(409).json({ message: '登录结果已领取，请重新生成二维码' });
  }
  return res.json({ status: 'confirmed', token: claimedSession.loginToken, userInfo: claimedSession.userInfo });
};

exports.confirmMiniappLogin = async (req, res) => {
  try {
    const { code, loginToken } = req.body || {};
    if (!code || !loginToken) return res.status(400).json({ message: '登录参数不完整' });
    const session = await WechatLoginSession.findOne({ tokenHash: hashToken(loginToken) });
    if (!session) return res.status(404).json({ message: '登录二维码不存在' });
    if (session.status !== 'pending' || session.expiresAt <= new Date()) {
      session.status = 'expired';
      await session.save();
      return res.status(410).json({ message: '登录二维码已失效，请重新扫码' });
    }
    const { openid, unionid } = await miniappService.getJsCodeSession(String(code).trim());
    const user = await User.findOne({ $or: [{ wechatOpenId: openid }, ...(unionid ? [{ wechatUnionId: unionid }] : [])] });
    if (!user) {
      session.status = 'failed';
      session.failureMessage = '当前微信尚未绑定系统账号';
      await session.save();
      return res.status(403).json({ message: session.failureMessage });
    }
    const { token, jti } = authController.generateToken(user);
    session.status = 'confirmed';
    session.userId = user._id;
    session.loginToken = token;
    session.userInfo = require('./userController').formatUserProfile(user);
    session.jti = jti;
    await session.save();
    return res.json({ confirmed: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};




