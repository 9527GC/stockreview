# Stock Review

股票交易复盘系统：uni-app/Vue3 前端、Node.js/Express 后端、MongoDB 数据库，并支持微信小程序扫码登录与账号绑定。

## 项目结构

- `apps/frontend`：H5 前端
- `apps/miniapp`：微信小程序
- `apps/backend`：Node.js 后端
- `docs`：接口与运维文档

## 技术栈

- 前端：uni-app 3、Vue 3、Vite、Pinia
- 后端：Node.js 20、Express 5、Mongoose 8、JWT
- 数据库：MongoDB 7+
- 部署：阿里云 ECS/容器 + Nginx（具体方式以目标环境为准）

## 快速开始

### 后端

```bash
cd apps/backend
cp .env.production.example .env.development
npm install
npm run dev
# 生产环境：配置 .env.production 后执行
npm run start:prod
```

生产启动脚本会使用脚本所在目录作为项目目录，不依赖固定的云平台路径：

```bash
./entrypoint.sh prod
```

### 前端

```bash
cd apps/frontend
npm install
npm run dev:h5
npm run build:h5
npm run test
```

### 小程序

使用微信开发者工具打开 `apps/miniapp`，配置小程序 AppID 后编译、预览或上传。测试环境的 `WECHAT_MINIAPP_ENV_VERSION` 应使用 `trial`，生产环境使用 `release`。

## 阿里云部署要点

1. 在阿里云 ECS、容器服务或其他目标运行环境创建项目目录。
2. 上传后端源码、`package.json`、`package-lock.json` 和经过安全配置的 `.env.production`。
3. `MONGODB_URI` 必须指向阿里云可访问的 MongoDB，不能使用 `localhost` 或已下线的旧平台内网域名。
4. 配置安全组/负载均衡放行应用端口，推荐由 Nginx 反向代理并启用 HTTPS。
5. 使用 `./entrypoint.sh prod` 或 `NODE_ENV=production npm run start:prod` 启动并设置进程守护。
6. 发布后检查健康接口、登录接口及微信小程序绑定接口。

不要把真实数据库密码、JWT 密钥、微信 AppSecret 或行情 Token 提交到 Git。

## 文档索引

- [后端部署说明](apps/backend/DEPLOY.md)
- [前端部署说明](apps/frontend/DEPLOY.md)
- [API 接口文档](docs/apidoc.md)
- [外部服务配置](docs/external-services.md)
- [需求 PRD](docs/需求prd.md)
- [开发工作指导](WORKFLOW.md)
