const runtimeConfig = typeof window !== 'undefined' && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {};

const normalizeUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

export const appConfig = {
  appEnv: runtimeConfig.APP_ENV || import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'development',
  apiBaseUrl: normalizeUrl(runtimeConfig.API_BASE_URL || import.meta.env.VITE_API_BASE_URL),
  loginBackgroundUrl: runtimeConfig.LOGIN_BACKGROUND_URL || import.meta.env.VITE_LOGIN_BACKGROUND_URL || ''
};

export const requireConfig = (key) => {
  const value = appConfig[key];
  if (!value) {
    throw new Error(`Missing required config: ${key}`);
  }
  return value;
};
