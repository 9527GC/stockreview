const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const wxml = fs.readFileSync(path.join(root, 'pages/wechat-bind/index.wxml'), 'utf8');
const js = fs.readFileSync(path.join(root, 'pages/wechat-bind/index.js'), 'utf8');

test('微信绑定页面使用新的头像昵称授权控件', () => {
  assert.match(wxml, /open-type="chooseAvatar"/);
  assert.match(wxml, /type="nickname"/);
  assert.match(js, /chooseAvatar/);
  assert.match(js, /submitProfile/);
});

