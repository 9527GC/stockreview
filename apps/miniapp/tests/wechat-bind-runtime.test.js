const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const pageSource = fs.readFileSync(path.join(root, 'pages/wechat-bind/index.js'), 'utf8');
const envPath = path.join(root, 'config/env.js');

const loadPage = (wx = {}) => {
  let definition;
  vm.runInNewContext(pageSource, {
    Page: (page) => { definition = page; },
    require: (id) => require(path.resolve(root, 'pages/wechat-bind', id)),
    wx
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

test('小程序统一使用生产 API 域名', () => {
  delete require.cache[require.resolve(envPath)];
  assert.equal(require(envPath).API_BASE_URL, 'https://stock.gc9527.com');
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
test('重新扫码同时支持普通二维码和微信小程序码', () => {
  let scanOptions;
  const token = 'b'.repeat(32);
  const wx = {
    scanCode(options) {
      scanOptions = options;
      options.success({ scanType: 'WX_CODE', path: `pages/wechat-bind/index?scene=${token}` });
    }
  };
  const page = loadPage(wx);
  const context = {
    data: {},
    setData(update) { Object.assign(this.data, update); },
    showRescanError(message) { this.error = message; }
  };

  page.rescan.call(context);

  assert.equal(JSON.stringify(scanOptions.scanType), JSON.stringify(['qrCode', 'wxCode']));
  assert.equal(context.data.bindingToken, token);
});
