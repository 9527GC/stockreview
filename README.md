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
- 数据库：本地开发使用本机 MongoDB；生产使用阿里云 MongoDB
- 部署：生产环境的后端、前端和数据库统一部署在阿里云

## 环境约定

项目只有两个环境：

- **本地开发环境**：本机启动前后端，连接本机 MongoDB；
- **生产环境**：阿里云服务器运行后端和 H5 前端，连接阿里云生产 MongoDB，域名为 `https://stock.gc9527.com`。

项目不再使用测试、预发布或 staging 环境，不再使用 `test-stock.gc9527.com`、测试数据库或测试小程序凭证。

## 快速开始

### 后端

```bash
cd apps/backend
cp .env.production.example .env.development
# 将 .env.development 中的 MONGODB_URI 改为本机 MongoDB 连接串
npm install
npm run dev
```

生产环境在阿里云配置 `.env.production` 后执行：

```bash
npm run start:prod
# 或
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

前端本地开发使用 `.env.development`，生产构建使用 `.env.production`；两者只区分本地开发和生产，不再提供 staging 构建模式。

### 小程序

使用微信开发者工具打开 `apps/miniapp`，使用正式小程序 AppID。小程序统一请求生产 API `https://stock.gc9527.com`；体验版和正式版都不再切换到测试域名。

## 阿里云部署要点

1. 在阿里云服务器创建项目目录。
2. 上传后端源码、`package.json`、`package-lock.json` 和安全配置的 `.env.production`。
3. `MONGODB_URI` 必须使用阿里云生产 MongoDB，不能使用 `localhost` 或任何测试库连接串。
4. 前端生产构建产物和后端均部署到阿里云，由 Nginx 提供 H5 并反向代理 API。
5. 使用 `./entrypoint.sh prod` 或 `NODE_ENV=production npm run start:prod` 启动后端并设置进程守护。
6. 发布后检查健康接口、登录接口及微信小程序绑定接口，并确认后端连接阿里云 MongoDB。

不要把真实数据库密码、JWT 密钥、微信 AppSecret 或行情 Token 提交到 Git。

## 文档索引

- [后端部署说明](apps/backend/DEPLOY.md)
- [前端部署说明](apps/frontend/DEPLOY.md)
- [API 接口文档](docs/apidoc.md)
- [外部服务配置](docs/external-services.md)
- [需求 PRD](docs/需求prd.md)
- [开发工作指导](WORKFLOW.md)

## 用户业务数据重置（高风险维护操作）

> 此操作**不可恢复**。它只用于明确的维护窗口或新账户基线初始化；执行前必须确认目标环境、导出数据库备份，并获得业务负责人确认。默认不执行删除。

重置会删除指定用户（或明确确认后的全部用户）的交易、持仓、转账、资产、收益快照与复盘派生数据；**不会删除账号、密码或已绑定的微信身份信息**。用户手续费偏好会恢复为默认值。全局市场行情与已撤销令牌不会被删除。

```bash
cd apps/backend
# 仅重置一个已核对的用户：必须同时提供用户 ID 和确认参数
npm run reset:user-business-data -- --userId <USER_ID> --confirm

# 重置所有用户业务数据：仅限已备份、已审批的维护窗口
npm run reset:all-business-data -- --confirm-all-users
```

请勿在日常开发、未知数据库连接或生产高峰期执行上述命令；先在隔离测试数据库演练并核对命令输出的删除数量。
