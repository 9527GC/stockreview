# 微信小程序（微信绑定与电脑端扫码登录）

该目录是一个独立的原生微信小程序工程，负责承接 Web 端的小程序码，完成微信身份绑定或确认电脑端扫码登录；主 H5 前端继续位于 `apps/frontend`。

## 环境约定

项目只有两个运行环境：

1. **本地开发环境**：后端使用本机 MongoDB，前端和后端在本地启动；
2. **生产环境**：后端、H5 前端和 MongoDB 均部署在阿里云同一套生产环境。

小程序只连接生产 API：

```text
https://stock.gc9527.com
```

本地开发小程序不直接连接本地后端；如需联调，必须通过可访问的本地 HTTPS 隧道，并临时在本地配置中明确指定该地址。生产小程序配置始终使用生产 API。

## 发布检查

1. 在微信开发者工具中导入 `apps/miniapp`。
2. 确认 `project.config.json` 使用正式小程序 AppID。
3. 在微信公众平台将 `https://stock.gc9527.com` 配置为 request 合法域名。
4. 上传体验版或正式版。后端生成的小程序码会进入 `pages/wechat-bind/index`。
5. 体验版和正式版都连接同一个生产后端，不再按 `trial` 或其他环境配置切换 API。
## 本地验证

```bash
node --test tests/*.test.js
```

project.private.config.json 是开发者工具个人配置，不纳入 Git。真实微信授权和扫码登录仍需在微信客户端验收。
