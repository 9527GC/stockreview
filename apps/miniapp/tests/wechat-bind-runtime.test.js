const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pageSource = fs.readFileSync(path.join(root, 'pages/wechat-bind/index.js'), 'utf8');

const loadPage = () => {
  let definition;
  vm.runInNewContext(pageSource, {
    Page: (page) => { definition = page; },
    require: (id) => require(path.resolve(root, 'pages/wechat-bind', id)),
    wx: {}
  }, { filename: 'pages/wechat-bind/index.js' });
  return definition;
};

const createContext = () => ({
  data: {},
  setData(update) { Object.assign(this.data, update); },
  checkCurrentBindingCalls: 0,
  checkCurrentBinding() { this.checkCurrentBindingCalls += 1; },
  confirmedToken: '',
  confirmLogin(token) { this.confirmedToken = token; }
});

test('小程序环境配置默认生产域名，staging 明确使用测试域名', () => {
  const envPath = path.join(root, 'config/env.js');
  delete require.cache[require.resolve(envPath)];
  delete globalThis.__MINIAPP_ENV__;
  assert.equal(require(envPath).API_BASE_URL, 'https://stock.gc9527.com');

  globalThis.__MINIAPP_ENV__ = 'staging';
  delete require.cache[require.resolve(envPath)];
  assert.equal(require(envPath).API_BASE_URL, 'https://test-stock.gc9527.com');
  delete globalThis.__MINIAPP_ENV__;
});

test('非法 scene 参数不会令小程序页面崩溃', () => {
  const page = loadPage();
  const context = createContext();

  assert.doesNotThrow(() => page.onLoad.call(context, { scene: '%' }));
  assert.equal(context.checkCurrentBindingCalls, 1);
});

test('合法 login scene 仍确认电脑端登录', () => {
  const page = loadPage();
  const context = createContext();
  const token = 'a'.repeat(24);

  page.onLoad.call(context, { scene: `login_${token}` });

  assert.equal(context.confirmedToken, token);
  assert.equal(context.checkCurrentBindingCalls, 0);
});
