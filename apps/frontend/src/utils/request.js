import { requireConfig } from '@/config/env';

const BASE_URL = requireConfig('apiBaseUrl');

const safeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
};

const extractErrorText = (data) => {
  if (data === null || data === undefined) return '';
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);
  if (typeof data === 'object') {
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (typeof data.msg === 'string' && data.msg.trim()) return data.msg;
    if (typeof data.error === 'string' && data.error.trim()) return data.error;
    if (data.error && typeof data.error === 'object') {
      if (typeof data.error.message === 'string' && data.error.message.trim()) return data.error.message;
      if (typeof data.error.msg === 'string' && data.error.msg.trim()) return data.error.msg;
      return safeStringify(data.error);
    }
    if (typeof data.detail === 'string' && data.detail.trim()) return data.detail;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const first = data.errors[0];
      if (typeof first === 'string') return first;
      if (first && typeof first.message === 'string' && first.message.trim()) return first.message;
      return safeStringify(first);
    }
    // 处理嵌套 data.message 的情况
    if (data.data && typeof data.data === 'object') {
      if (typeof data.data.message === 'string' && data.data.message.trim()) return data.data.message;
      if (typeof data.data.msg === 'string' && data.data.msg.trim()) return data.data.msg;
      if (typeof data.data.error === 'string' && data.data.error.trim()) return data.data.error;
    }
    return safeStringify(data);
  }
  return String(data);
};

const clampToastText = (text, maxLength = 140) => {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + '…' : normalized;
};

const shouldSilence = (options) => options.silent === true;

const request = (options) => {
  return new Promise((resolve, reject) => {
    const token = uni.getStorageSync('token');
    const url = options.url ? (BASE_URL + (options.url.startsWith('/') ? '' : '/') + options.url) : BASE_URL;
    
    uni.request({
      url: url,
      method: options.method || 'GET',
      data: options.data || options.params || {},
      header: {
        ...options.header,
        'Authorization': token ? `Bearer ${token}` : ''
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else if (res.statusCode === 401) {
          uni.removeStorageSync('token');
          const pages = getCurrentPages();
          const currentRoute = pages.length > 0 ? pages[pages.length - 1].route : '';
          if (currentRoute !== 'pages/login/login') {
            uni.navigateTo({ url: '/pages/login/login' });
          }
          const msg = extractErrorText(res.data) || '登录已失效，请重新登录';
          if (!shouldSilence(options)) {
            uni.showToast({
              title: clampToastText(msg),
              icon: 'none'
            });
          }
          reject(res.data);
        } else {
          const requestLabel = `${(options.method || 'GET').toUpperCase()} ${options.url || url}`;
          const rawErrorText = extractErrorText(res.data);
          let toastMessage = rawErrorText || `请求失败（${res.statusCode}）`;
          if (
            res.statusCode === 400 &&
            options.method === 'POST' &&
            options.url === '/api/trades' &&
            options.data &&
            options.data.type === 'SELL' &&
            (
              toastMessage === 'Sell quantity exceeds holding quantity' ||
              toastMessage === 'No holdings available for this symbol'
            )
          ) {
            toastMessage = '已超出持仓数，请核实';
          }

          if (!shouldSilence(options)) {
            console.error('API request failed:', {
              request: requestLabel,
              statusCode: res.statusCode,
              data: res.data
            });

            uni.showToast({
              title: clampToastText(`${requestLabel}：${toastMessage}`),
              icon: 'none'
            });
          }
          reject(res.data);
        }
      },
      fail: (err) => {
        if (!shouldSilence(options)) {
          console.error('API request network error:', {
            request: `${(options.method || 'GET').toUpperCase()} ${options.url || url}`,
            err
          });

          uni.showToast({
            title: clampToastText(extractErrorText(err) || err?.errMsg || '网络错误'),
            icon: 'none'
          });
        }
        reject(err);
      }
    });
  });
};

export { safeStringify, extractErrorText, clampToastText };
export default request;
