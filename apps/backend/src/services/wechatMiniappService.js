const axios = require('axios');

let accessTokenCache = null;

const getConfig = () => ({
  appId: process.env.WECHAT_MINIAPP_APP_ID,
  appSecret: process.env.WECHAT_MINIAPP_APP_SECRET,
  bindPage: process.env.WECHAT_MINIAPP_BIND_PAGE || 'pages/wechat-bind/index'
});

const ensureConfig = () => {
  const { appId, appSecret } = getConfig();
  if (!appId || !appSecret) {
    const error = new Error('微信小程序配置未完成');
    error.statusCode = 503;
    throw error;
  }
};

const getAccessToken = async () => {
  ensureConfig();
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.value;
  }

  const { appId, appSecret } = getConfig();
  const { data } = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
    timeout: 10000
  });
  if (!data.access_token) {
    const error = new Error(data.errmsg || '获取微信小程序访问令牌失败');
    error.statusCode = 502;
    throw error;
  }

  accessTokenCache = {
    value: data.access_token,
    // 提前 5 分钟刷新，避免令牌在请求期间过期。
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 7200) - 300) * 1000
  };
  return accessTokenCache.value;
};

const getJsCodeSession = async (code) => {
  ensureConfig();
  const { appId, appSecret } = getConfig();
  const { data } = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
    params: { appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' },
    timeout: 10000
  });
  if (!data.openid) {
    const error = new Error(data.errmsg || '微信小程序登录失败');
    error.statusCode = 502;
    throw error;
  }
  return data;
};

const getUnlimitedCode = async (scene) => {
  const accessToken = await getAccessToken();
  const { bindPage } = getConfig();
  const response = await axios.post(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
    {
      // check_path: false is required while the experience-version page list propagates.
      // Supplying the target page ensures WeChat forwards scene to onLoad(options).
      page: bindPage,
      scene,
      check_path: false,
      env_version: process.env.WECHAT_MINIAPP_ENV_VERSION || 'release'
    },
    { responseType: 'arraybuffer', timeout: 15000 }
  );

  const contentType = String(response.headers['content-type'] || '');
  if (contentType.includes('application/json')) {
    const body = JSON.parse(Buffer.from(response.data).toString('utf8'));
    const error = new Error(body.errmsg || '生成小程序码失败');
    error.statusCode = 502;
    throw error;
  }

  return Buffer.from(response.data);
};

const resetCacheForTests = () => { accessTokenCache = null; };

module.exports = { ensureConfig, getJsCodeSession, getUnlimitedCode, resetCacheForTests };

