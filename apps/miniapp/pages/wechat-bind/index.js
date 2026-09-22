const { API_BASE_URL } = require('../../config/env');
const TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const LOGIN_PATTERN = /^login_([a-f0-9]{24})$/;

const safeDecodeURIComponent = (value) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (_) {
    return '';
  }
};

const getBindingToken = (options = {}) => safeDecodeURIComponent(options.bindingToken || options.scene || '');

const tokenFromScanResult = (result = {}) => {
  const candidates = [result.path, result.result].filter(Boolean);
  for (const candidate of candidates) {
    const text = String(candidate);
    if (TOKEN_PATTERN.test(text)) return text;
    const match = text.match(/[?&](?:scene|bindingToken)=([^&#]+)/i);
    if (match) {
      try {
        const token = decodeURIComponent(match[1]);
        if (TOKEN_PATTERN.test(token)) return token;
      } catch (_) { /* Try the next candidate. */ }
    }
  }
  return '';
};

Page({
  data: {
    status: 'loading',
    title: '正在查询绑定状态',
    message: '请稍候…',
    bindingToken: '',
    action: '',
    actionText: '',
    accountNickname: '',
    accountAvatar: '',
    draftAvatar: '',
    draftNickname: ''
  },

  onLoad(options = {}) {
    const scene = safeDecodeURIComponent(options.scene || '');
    const loginMatch = scene.match(LOGIN_PATTERN);
    if (loginMatch) { this.confirmLogin(loginMatch[1]); return; }
    const bindingToken = getBindingToken(options);
    if (TOKEN_PATTERN.test(bindingToken)) {
      this.setData({
        bindingToken,
        status: 'ready',
        title: '绑定微信',
        message: '点击下方按钮，授权获取微信昵称和头像后完成绑定。',
        action: 'bind',
        actionText: '授权并绑定'
      });
      return;
    }
    this.checkCurrentBinding();
  },

  confirmLogin(loginToken) {
    this.setData({ status: 'loading', title: '正在登录', message: '正在确认微信身份，请稍候…' });
    wx.login({
      success: ({ code }) => wx.request({
        url: `${API_BASE_URL}/api/auth/wechat/miniapp-login/confirm`, method: 'POST',
        data: { code, loginToken }, header: { 'content-type': 'application/json' },
        success: ({ statusCode, data }) => {
          const succeeded = statusCode >= 200 && statusCode < 300;
          this.setData({
            status: succeeded ? 'success' : 'error',
            title: succeeded ? '登录成功' : '登录失败',
            message: succeeded ? '请返回电脑端，登录状态会自动更新。' : (data?.message || '登录失败，请重新扫码。'),
            action: succeeded ? 'acknowledge' : '',
            actionText: succeeded ? '好的' : ''
          });
        },
        fail: () => this.setData({ status: 'error', title: '登录失败', message: '无法连接服务，请重新扫码。' })
      }),
      fail: () => this.setData({ status: 'error', title: '登录失败', message: '微信登录失败，请重新扫码。' })
    });
  },

  handleAction() {
    const { action } = this.data;
    if (action === 'bind') return this.showProfileForm();
    if (action === 'rescan') return this.rescan();
    if (action === 'acknowledge') return this.acknowledge();
    if (action === 'settings') return this.openSettings();
  },

  showProfileForm() {
    this.setData({ status: 'profile', title: '完善微信资料', message: '请选择微信头像和填入昵称后完成绑定', action: '', actionText: '' });
  },

  chooseAvatar({ detail = {} }) {
    if (detail.avatarUrl) this.setData({ draftAvatar: detail.avatarUrl });
  },

  nicknameInput({ detail = {} }) {
    this.setData({ draftNickname: detail.value || '' });
  },

  submitProfile() {
    const nickname = (this.data.draftNickname || '').trim();
    const avatar = this.data.draftAvatar || '';
    if (!nickname || !avatar || nickname === '微信用户') {
      wx.showToast({ title: '请先选择头像并填写真实昵称', icon: 'none' });
      return;
    }
    this.setData({ status: 'loading', title: '正在绑定微信', message: '正在验证微信身份，请稍候…' });
    wx.login({
      success: ({ code }) => this.bind(code, { nickName: nickname, avatarUrl: avatar }),
      fail: () => this.showRescanError('微信登录失败，请重新扫码后再试。')
    });
  },
  authorizeAndBind() {
    wx.getUserProfile({
      desc: '用于展示已绑定微信的昵称和头像',
      success: ({ userInfo = {} }) => {
        const nickname = userInfo.nickName || '';
        const avatar = userInfo.avatarUrl || '';
        if (!nickname || !avatar) {
          this.setData({
            status: 'error',
            title: '未获取到微信资料',
            message: "微信返回资料为空（昵称：" + (nickname ? "有" : "无") + "，头像：" + (avatar ? "有" : "无") + "）。请确认微信授权状态后重试。",
            action: 'settings',
            actionText: '打开授权设置'
          });
          return;
        }
        const profileSummary = `昵称：${nickname ? '已获取' : '未获取'}\n头像：${avatar ? '已获取' : '未获取'}`;
        wx.showModal({
          title: '微信资料调试结果',
          content: profileSummary,
          confirmText: '继续绑定',
          cancelText: '取消',
          success: ({ confirm }) => {
            if (!confirm) return;
            this.setData({
              status: 'loading',
              title: '正在绑定微信',
              message: '正在验证微信身份，请稍候…',
              action: '',
              actionText: ''
            });
            wx.login({
              success: ({ code }) => this.bind(code, userInfo),
              fail: () => this.showRescanError('微信登录失败，请重新扫码后再试。')
            });
          }
        });      },
      fail: (error) => {
        const reason = error?.errMsg || '未知原因';
        this.setData({
          status: 'error',
          title: '微信资料授权失败',
          message: "getUserProfile 未成功：" + reason,
          action: 'settings',
          actionText: '打开授权设置'
        });
      }
    });
  },

  bind(code, userInfo) {
    wx.request({
      url: `${API_BASE_URL}/api/users/wechat/miniapp-bind`,
      method: 'POST',
      data: {
        code,
        bindingToken: this.data.bindingToken,
        profile: {
          nickname: userInfo.nickName,
          avatar: userInfo.avatarUrl
        }
      },
      header: { 'content-type': 'application/json' },
      success: ({ statusCode, data }) => {
        if (statusCode >= 200 && statusCode < 300 && data?.bound) {
          this.setData({
            status: 'success',
            title: '微信绑定成功',
            message: '请返回网页，网页会自动显示绑定结果。',
            action: 'acknowledge',
            actionText: '我知道了'
          });
          return;
        }
        this.showRescanError(data?.message || '绑定失败，请重新扫码。');
      },
      fail: () => this.showRescanError('无法连接服务，请检查网络后重新扫码。')
    });
  },

  checkCurrentBinding() {
    wx.login({
      success: ({ code }) => {
        wx.request({
          url: `${API_BASE_URL}/api/users/wechat/miniapp-current-binding`,
          method: 'POST',
          data: { code },
          header: { 'content-type': 'application/json' },
          success: ({ statusCode, data }) => {
            if (statusCode >= 200 && statusCode < 300 && data?.bound) {
              const account = data.account || {};
              this.setData({
                status: 'success',
                title: '当前已绑定账号',
                message: '当前微信已绑定，可返回电脑端继续操作。',
                accountNickname: account.nickname || '',
                accountAvatar: account.avatar || '',
                action: 'acknowledge',
                actionText: '我知道了'
              });
              return;
            }
            this.setData({
              status: 'unbound',
              title: '尚未绑定微信',
              message: '请前往网页个人中心绑定微信小程序。',
              action: '',
              actionText: ''
            });
          },
          fail: () => this.setData({
            status: 'error',
            title: '无法查询绑定状态',
            message: '无法连接服务，请检查网络后重新尝试。',
            action: 'rescan',
            actionText: '重新扫码'
          })
        });
      },
      fail: () => this.setData({
        status: 'error',
        title: '无法查询绑定状态',
        message: '微信登录失败，请检查网络后重新尝试。',
        action: 'rescan',
        actionText: '重新扫码'
      })
    });
  },

  rescan() {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: ['qrCode', 'wxCode'],
      success: (result) => {
        const bindingToken = tokenFromScanResult(result);
        if (!bindingToken) {
          this.showRescanError('请扫描网页个人中心生成的绑定二维码。');
          return;
        }
        this.setData({
          bindingToken,
          status: 'ready',
          title: '绑定微信',
          message: '点击下方按钮，授权获取微信昵称和头像后完成绑定。',
          action: 'bind',
          actionText: '授权并绑定'
        });
      },
      fail: () => this.showRescanError('扫码已取消或识别失败，请重新扫码。')
    });
  },

  openSettings() {
    wx.openSetting({
      success: () => this.setData({
        status: 'ready',
        title: '绑定微信',
        message: '请重新点击授权绑定。',
        action: 'bind',
        actionText: '授权绑定'
      }),
      fail: () => this.setData({
        status: 'error',
        title: '无法打开授权设置',
        message: '请在微信右上角设置中开启头像和昵称权限。',
        action: 'settings',
        actionText: '再次打开授权设置'
      })
    });
  },
  acknowledge() {
    // A mini-program code can close the mini program directly. If WeChat rejects
    // that operation (for example, in a preview/debug context), return safely.
    wx.exitMiniProgram({
      fail: () => wx.navigateBack({
        delta: 1,
        fail: () => this.setData({ action: '', actionText: '' })
      })
    });
  },

  showRescanError(message) {
    this.setData({
      status: 'error',
      title: '绑定未完成',
      message,
      action: 'rescan',
      actionText: '重新扫码'
    });
  }
});










