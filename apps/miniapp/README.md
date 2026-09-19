# 微信小程序（仅微信绑定）

该目录是一个独立的原生微信小程序工程，只负责承接 Web 端的小程序码并绑定当前微信身份。主 H5 前端继续位于 `apps/frontend`；它依赖 ant-design-vue，当前不能直接编译成微信小程序。

## 使用方式

1. 在微信开发者工具中导入 `apps/miniapp`。
2. 确认 `project.config.json` 的 AppID 与微信公众平台一致。
3. 体验版联调时，在微信公众平台配置服务器域名：`https://test-stock.gc9527.com`；正式版同时保留 `https://stock.gc9527.com`。
4. 上传体验版或正式版。后端生成的小程序码会进入 `pages/wechat-bind/index`。

`API_BASE_URL` 位于 `config/env.js`。默认使用正式域名 `https://stock.gc9527.com`；仅在开发者工具或构建入口显式设置 `globalThis.__MINIAPP_ENV__ = 'staging'` 时使用测试域名 `https://test-stock.gc9527.com`。发布正式版前请确认没有设置 staging；微信服务器无法访问 `localhost`。
