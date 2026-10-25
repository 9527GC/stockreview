# Stock Review

股票交易复盘系统：uni-app/Vue3 前端、Node.js/Express 后端、MongoDB 数据库，并支持微信小程序扫码登录与账号绑定。

## 项目结构

- `apps/frontend`：H5 前端
- `apps/miniapp`：微信小程序
- `apps/backend`：Node.js 后端
- `packages/stock-search`：前后端共享的证券搜索与代码匹配包
- `docs`：接口、产品现状与维护文档

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

## 当前功能（2026-10-25）

- 账号密码登录、微信小程序扫码登录与绑定、个人资料和头像维护。
- A 股、港股、美股交易记录、手续费偏好、出入金和结构化复盘。
- 当前持仓、按清仓周期展开的历史持仓、证券搜索与行情。
- 公司行动：现金分红、拆分/合并、送股/转增、配股，参与持仓、现金和历史收益重算。
- 人民币资产汇总、收益曲线、上证指数基准、收益日历和估值质量标记。

当前使用人民币汇总现金、当前汇率和摊薄成本；锁定汇率、分币种现金账户、标准加权成本和业务数据重置脚本尚未上线。历史补录和删除会校验完整时间序列，拒绝导致历史超卖的变更。

## 快速开始

先安装 Node.js 20 并启动本机 MongoDB。前后端均依赖共享包，安装和部署时必须保留仓库目录结构，并先执行：

```bash
cd packages/stock-search
npm ci
```

### 后端

```bash
cd apps/backend
cp .env.production.example .env.development
# 将 .env.development 中的 MONGODB_URI 改为本机 MongoDB 连接串
npm ci
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
2. 保留后端与共享包的仓库相对目录，安装两者依赖，并安全配置 `.env.production`；目录不同的生产实例按共享包说明安装打包产物。
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


## 验证与维护

```bash
cd apps/backend
npm run lint
npm test
cd ../frontend
npm test
npm run build:h5
cd ../miniapp
node --test tests/*.test.js
```

后端测试使用独立的 MongoDB 内存实例；首次运行可能需要下载测试数据库程序。`apps/backend/tests/specifications` 是未上线功能的历史规格，不属于默认回归集。GitHub CI 目前仅支持手动触发。

- [生产基线与发布记录](PRODUCTION_BASELINE.md)
- [仓库清理与保留说明](docs/repository-maintenance.md)
- [共享证券搜索包](packages/stock-search/README.md)

当前仓库没有业务数据重置命令。维护数据库前需另行制定并审核迁移方案。
