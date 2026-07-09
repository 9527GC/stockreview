# Stock Review

股票交易复盘系统 —— 记录持仓、交易、资产变动，支持收益曲线、复盘标签与大盘快照。

## 项目结构

```text
Stock Review/
├── apps/
│   ├── frontend/          # 前端：uni-app + Vue3 + Vite（H5/小程序）
│   └── backend/           # 后端：Node.js + Express + MongoDB
├── docs/                  # 项目文档
├── WORKFLOW.md            # 开发工作指导与流程规范
├── CLAUDE.md              # 项目级 Claude 工作偏好
└── .github/workflows/     # CI 工作流
```

## 技术栈

- **前端**：uni-app 3 (Vue 3 + Vite)、Pinia、ant-design-vue、ECharts、Day.js
- **后端**：Node.js 20、Express 5、Mongoose 8、JWT、node-cron
- **数据库**：MongoDB 7+
- **部署**：Sealos Devbox + 前端静态托管

## 快速开始

### 后端

```bash
cd apps/backend
cp .env.production.example .env.development   # 按需修改数据库连接
npm install
npm run dev          # 开发模式
npm run start:prod   # 生产模式（需先配置 .env.production）
```

### 前端

```bash
cd apps/frontend
npm install
npm run dev:h5       # H5 开发
npm run build:h5     # H5 生产构建
npm run test         # Vitest 测试
```

## 文档索引

- [后端部署说明](apps/backend/DEPLOY.md)
- [前端 Sealos 部署说明](apps/frontend/DEPLOY_SEALOS.md)
- [API 接口文档](docs/apidoc.md)
- [外部服务配置](docs/external-services.md)
- [需求 PRD](docs/需求prd.md)
- [开发工作指导](WORKFLOW.md)

## 环境变量

后端环境变量文件（均已被 Git 忽略）：

- `apps/backend/.env`：本地开发默认
- `apps/backend/.env.development`：开发/测试环境
- `apps/backend/.env.production`：生产环境
- `apps/backend/.env.production.example`：生产环境模板（已纳入版本库）

首次在新机器/新环境部署时，请参考 [apps/backend/DEPLOY.md](apps/backend/DEPLOY.md) 手动创建 `.env.production`。

## 重要提醒

- `.env.production` 等敏感环境文件**不会进入 Gitee**，跨设备部署时务必手动同步。
- 生产环境启动必须使用 `NODE_ENV=production` 模式，否则可能误连本地开发数据库。
- 提交代码前请确认没有暴露真实 Token、密码等敏感信息。
