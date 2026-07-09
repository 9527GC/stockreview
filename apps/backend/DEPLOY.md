# Stock Review 后端部署说明

## 问题根因

生产环境 `https://stock.gc9527.com/` 之所以连到了本地数据库 `mongodb://localhost:27017/stock_review_dev`，是因为：

1. `.env.production` 被 `.gitignore` 忽略，不会进入 Gitee/Git 仓库。
2. 另一台电脑拉取仓库后，本地没有 `.env.production`。
3. 服务端启动时若 `NODE_ENV=production`，会先找 `.env.production`；找不到时会回退到 `.env`（默认指向本地 MongoDB），导致生产环境连接了错误的数据库。

## 已做的防护

[apps/backend/src/index.js](src/index.js) 已增加强校验：

- 生产环境启动时，如果 `.env.production` 不存在，服务会直接 `FATAL` 退出，不会再回退到 `.env`。
- 开发环境仍可回退到 `.env`，保持本地开发体验。

## 换电脑/新环境拉取后的必要操作

1. **复制生产环境配置模板**：

   ```bash
   cd apps/backend
   cp .env.production.example .env.production
   ```

2. **填入真实敏感信息**：

   - `MONGODB_URI`：把 `<PROD_MONGODB_PASSWORD>` 替换为生产数据库真实密码。
   - `JWT_SECRET`：建议保持与当前生产环境一致，避免已登录用户 Token 失效。
   - `TUSHARE_TOKEN`：替换为真实 Token。

3. **检查 `.env.production` 内容是否正确**：

   ```bash
   grep MONGODB_URI .env.production
   # 应输出类似：
   # MONGODB_URI=mongodb://root:lnf1Z8D60Z61v92T@stockreview-prod-mongodb.ns-rojp4s9y.svc:27017/stock_review_prod?authSource=admin
   ```

   **确保不是** `mongodb://localhost:27017/stock_review_dev`。

4. **生产环境启动必须使用 prod 模式**：

   ```bash
   # 方式一：推荐（会自动安装生产依赖并设置 NODE_ENV=production）
   ./entrypoint.sh prod

   # 方式二：手动
   NODE_ENV=production npm run start:prod
   ```

   不要直接运行 `npm start` 或 `npm run dev`，否则会以 development 模式启动。

   **启动优化说明**：`entrypoint.sh prod` 首次启动时会执行 `npm ci --only=production` 安装依赖；
   如果 `node_modules` 已存在且 `package.json` 没有更新，后续启动会跳过安装，显著缩短 Pod 启动时间。

## 同步到 Sealos Devbox 的完整步骤

1. 验证 Devbox 是否运行：

   ```bash
   ssh bja.sealos.run_ns-rojp4s9y_stockreview "echo SSH_OK"
   ```

2. 同步源码与配置（`.env.production` 不会随 Git 自动上传，需单独处理）：

   ```bash
   cd "e:/项目/Stock Review"

   # 同步源码
   scp -r apps/backend/src \
       bja.sealos.run_ns-rojp4s9y_stockreview:/home/devbox/project/

   scp apps/backend/entrypoint.sh \
       apps/backend/.gitattributes \
       apps/backend/package.json \
       apps/backend/package-lock.json \
       bja.sealos.run_ns-rojp4s9y_stockreview:/home/devbox/project/

   # 单独同步 .env.production（或直接在 Devbox 上创建）
   scp apps/backend/.env.production \
       bja.sealos.run_ns-rojp4s9y_stockreview:/home/devbox/project/
   ```

3. 在 Devbox 上确认 `.env.production` 存在且正确：

   ```bash
   ssh bja.sealos.run_ns-rojp4s9y_stockreview "
     cd /home/devbox/project &&
     ls -la .env.production &&
     grep MONGODB_URI .env.production
   "
   ```

4. 启动生产服务：

   ```bash
   ssh bja.sealos.run_ns-rojp4s9y_stockreview "
     cd /home/devbox/project &&
     ./entrypoint.sh prod
   "
   ```

## 检查清单（每次在新机器/新环境部署前勾选）

- [ ] 已从当前生产环境或已部署机器获取正确的 `.env.production`。
- [ ] 已在 `apps/backend/` 目录下创建 `.env.production`。
- [ ] `MONGODB_URI` 指向 Sealos 生产 MongoDB，而非 `localhost`。
- [ ] `CORS_ORIGINS` 包含 `https://stock.gc9527.com`。
- [ ] Devbox 上 `/home/devbox/project/.env.production` 已存在且内容正确。
- [ ] 使用 `./entrypoint.sh prod` 或 `NODE_ENV=production npm run start:prod` 启动。

## 常见错误

| 现象 | 原因 | 解决 |
|------|------|------|
| 生产环境报错 `MongoDB connection refused` 且 URI 是 `localhost` | 使用了 `.env` 或 `.env.development` | 创建正确的 `.env.production` 并使用 prod 模式启动 |
| 启动日志出现 `[FATAL] 生产环境文件 .env.production 不存在` | 新机器上缺少 `.env.production` | 按上文复制模板并填写真实配置 |
| 前端请求报 CORS 错误 | `.env.production` 的 `CORS_ORIGINS` 未包含 `https://stock.gc9527.com` | 更新 Devbox 上的 `.env.production` 并重启 |
