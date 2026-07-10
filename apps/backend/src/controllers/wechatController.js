const axios = require('axios');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const WECHAT_APP_ID = process.env.WECHAT_APP_ID;
const WECHAT_APP_SECRET = process.env.WECHAT_APP_SECRET;
const WECHAT_CALLBACK_URL = process.env.WECHAT_CALLBACK_URL;
const FRONTEND_PROFILE_URL = process.env.FRONTEND_PROFILE_URL;

const STATE_EXPIRES_IN = '10m';

/**
 * 检查微信环境变量是否配置
 */
const checkWechatConfig = () => {
  if (!WECHAT_APP_ID || !WECHAT_APP_SECRET || !WECHAT_CALLBACK_URL) {
    throw new Error('WeChat environment variables are not configured');
  }
};

/**
 * 生成微信公众号授权 URL
 */
exports.getBindUrl = async (req, res) => {
  try {
    checkWechatConfig();

    const state = jwt.sign(
      { userId: req.user._id.toString(), type: 'wechat_bind' },
      process.env.JWT_SECRET,
      { expiresIn: STATE_EXPIRES_IN }
    );

    const redirectUri = encodeURIComponent(WECHAT_CALLBACK_URL);
    const url = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${WECHAT_APP_ID}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;

    res.json({ url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * 处理微信授权回调
 */
exports.callback = async (req, res) => {
  try {
    checkWechatConfig();

    const { code, state } = req.query;

    if (!code || !state) {
      return redirectWithError('Missing code or state');
    }

    // 解析并校验 state
    let decoded;
    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (err) {
      return redirectWithError('Invalid or expired state');
    }

    if (decoded.type !== 'wechat_bind') {
      return redirectWithError('Invalid state type');
    }

    // 使用 code 换取 access_token 和 openid
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${WECHAT_APP_ID}&secret=${WECHAT_APP_SECRET}&code=${code}&grant_type=authorization_code`;
    const tokenRes = await axios.get(tokenUrl);

    if (tokenRes.data.errcode) {
      return redirectWithError(`WeChat error: ${tokenRes.data.errmsg}`);
    }

    const { openid, unionid } = tokenRes.data;

    if (!openid) {
      return redirectWithError('Failed to get WeChat openid');
    }

    // 检查 openid 是否已被其他用户绑定
    const existingUser = await User.findOne({ wechatOpenId: openid });
    if (existingUser && existingUser._id.toString() !== decoded.userId) {
      return redirectWithError('This WeChat account is already bound to another user');
    }

    // 更新当前用户的微信绑定信息
    const user = await User.findById(decoded.userId);
    if (!user) {
      return redirectWithError('User not found');
    }

    user.wechatOpenId = openid;
    if (unionid) {
      user.wechatUnionId = unionid;
    }
    await user.save();

    return redirectWithSuccess();
  } catch (error) {
    console.error('WeChat callback error:', error.message);
    return redirectWithError('WeChat authorization failed');
  }

  function redirectWithError(message) {
    const url = `${FRONTEND_PROFILE_URL || 'http://localhost:3000/pages/user/profile'}?wechat_bind=error&message=${encodeURIComponent(message)}`;
    return res.redirect(url);
  }

  function redirectWithSuccess() {
    const url = `${FRONTEND_PROFILE_URL || 'http://localhost:3000/pages/user/profile'}?wechat_bind=success`;
    return res.redirect(url);
  }
};

/**
 * 解绑微信
 */
exports.unbind = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.wechatOpenId = undefined;
    user.wechatUnionId = undefined;
    await user.save();

    res.json({ message: 'WeChat unbound successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
