const ENVIRONMENTS = {
  production: 'https://stock.gc9527.com',
  staging: 'https://test-stock.gc9527.com'
};

const runtimeEnvironment = typeof globalThis !== 'undefined' ? globalThis.__MINIAPP_ENV__ : '';
const API_BASE_URL = runtimeEnvironment === 'staging' ? ENVIRONMENTS.staging : ENVIRONMENTS.production;

module.exports = {
  API_BASE_URL,
  ENVIRONMENTS
};
