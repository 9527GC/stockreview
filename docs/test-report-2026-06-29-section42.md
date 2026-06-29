# Stock Review 4.2 节后续建议推进报告

**报告编号**：SR-TEST-20260629-SEC42  
**推进日期**：2026-06-29  
**推进人员**：Claude Code  
**推进范围**：测试报告 [docs/test-report-2026-06-29-fixed.md](../docs/test-report-2026-06-29-fixed.md) 第 4.2 节全部 5 项建议  
**推进结论**：5 项建议均已完成最小可运行实现，前后端构建、lint、测试全部通过。

---

## 一、推进概览

| 建议项 | 原状态 | 推进后状态 | 关键文件 |
|--------|--------|-----------|----------|
| 4.2.1 股票搜索接入真实 API | 本地 Mock | 腾讯 Smartbox → 东方财富 Suggest → Mock 兜底 | `src/services/stockSearchService.js`, `src/controllers/marketController.js` |
| 4.2.2 行情接口限流与降级 | 仅全局限流 | 新增 `/api/market` 独立限流 + 新浪行情熔断降级 | `src/index.js`, `src/utils/marketData.js` |
| 4.2.3 前端运行时测试 | 无测试框架 | 引入 Vitest + jsdom，38 个单元测试通过 | `package.json`, `vitest.config.js`, `src/utils/*.test.js` |
| 4.2.4 依赖安全 | dev 依赖在 dependencies 中，19 个漏洞 | 整理依赖结构，`npm audit fix` 后剩余 17 个 moderate（Jest 传递依赖） | `package.json` |
| 4.2.5 生产 CORS | `.env.production` 中未配置 | 配置为生产前端域名 | `.env.production` |

---

## 二、详细推进内容

### 2.1 生产 CORS 配置

- 文件：`server-side-project/.env.production`
- 变更：取消注释 `CORS_ORIGINS` 并设置为 `https://static-host-rojp4s9y-stockreview.sealosbja.site`
- 说明：生产环境启动后将只允许该域名的跨域请求，开发环境仍为 `*`。

### 2.2 依赖安全整理

- 文件：`server-side-project/package.json`
- 变更：
  - 将 `eslint`、`jest`、`supertest` 从 `dependencies` 移到 `devDependencies`
  - 新增 `audit` 脚本：`"audit": "npm audit"`
- 运行 `npm audit fix` 后：
  - 原 19 个漏洞（18 moderate + 1 high）→ 剩余 17 个 moderate
  - 剩余漏洞均来自 `jest@30.4.2` 的传递依赖 `js-yaml`，`npm audit fix --force` 要求降级到 `jest@25.0.0`（破坏性变更，可能破坏现有测试），故保留当前版本并记录风险。

### 2.3 股票搜索接入真实 API

- 新建：`server-side-project/src/services/stockSearchService.js`
- 修改：`server-side-project/src/controllers/marketController.js`
- 实现：
  - 复用 `marketData.js` 中的 `requestText`/`fetchJson` 进行 HTTP 请求
  - 腾讯 Smartbox 优先解析 `v_hint="N;data"` 格式
  - 东方财富 Suggest 解析 JSON 中的 `QuotationCodeTable.Data`
  - 统一将结果 symbol 归一化为项目标准格式
  - 两个真实 API 均失败时回退到原有 Mock 数据
  - 响应头 `X-Search-Source` 标识数据来源

### 2.4 行情接口限流与熔断降级

- 文件：`server-side-project/src/index.js`、`server-side-project/src/utils/marketData.js`、环境配置文件
- 实现：
  - 新增 `/api/market` 专属限流器，默认 60 请求/15 分钟，可通过 `RATE_LIMIT_MARKET_MAX` 调整
  - 在 `marketData.js` 的 `getQuotes` 中增加简易熔断：
    - 连续失败/超时/解析失败时开启熔断
    - 熔断 30 秒后自动半开重试
    - 熔断期间直接返回空对象，避免继续请求外部 API
  - 请求超时时间设置为 10 秒

### 2.5 前端运行时测试

- 文件：`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/package.json`、`vitest.config.js`
- 新建：`src/utils/stock.test.js`、`src/utils/format.test.js`、`src/utils/request.test.js`
- 实现：
  - 安装 `vitest@^2` 和 `jsdom@^24` 作为 devDependencies
  - 创建独立的 `vitest.config.js`，配置 `@/` 路径别名指向 `./src`
  - 导出 `request.js` 中的 `safeStringify`、`extractErrorText`、`clampToastText` 以便测试
  - 共编写 38 个单元测试，覆盖 `stock.js`、`format.js`、`request.js` 的纯函数

### 2.6 CI 更新

- 文件：`server-side-project/.github/workflows/ci.yml`
- 变更：
  - 后端 job 增加 `npm audit` 步骤
  - 前端 job 增加 `npm run test` 步骤

---

## 三、验证结果

### 3.1 后端验证

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 静态检查 | `npm run lint` | 通过（0 errors，31 个历史 warning） |
| 接口测试 | `npm test` | 通过，12/12 tests passed |
| 依赖审计 | `npm audit` | 剩余 17 moderate（Jest 传递依赖） |
| 服务启动 | `npm run dev` | 成功监听 `0.0.0.0:3000` |

### 3.2 后端功能冒烟测试

在后端服务运行状态下验证：

1. ✅ `POST /api/auth/login` 返回 token
2. ✅ `GET /api/market/search?keyword=茅台` 返回 eastmoney 结果，携带 `X-Search-Source: eastmoney`
3. ✅ `GET /api/market/search?keyword=xyznonexistent` 返回 Mock 兜底，`count: 0`
4. ✅ `GET /api/market/quote?symbol=SH600519` 返回行情价格
5. ✅ 连续请求 `/api/market/quote` 超过 60 次后返回 429

### 3.3 前端验证

| 检查项 | 命令 | 结果 |
|--------|------|------|
| 单元测试 | `npm run test` | 通过，38/38 tests passed |
| H5 生产构建 | `npm run build:h5` | 成功 |

### 3.4 CI 配置验证

- `.github/workflows/ci.yml` 已更新
- 由于本地无法直接运行 GitHub Actions，建议在推送后观察 Actions 运行状态

---

## 四、剩余风险与后续建议

| 风险 | 说明 | 建议 |
|------|------|------|
| Jest 传递依赖漏洞 | `npm audit` 剩余 17 个 moderate 均来自 `jest` 的 `js-yaml` | 关注 Jest 官方更新，或在确认兼容后评估降级方案 |
| 前端历史依赖漏洞 | 前端 `npm audit` 仍有 83 个漏洞（多为 uni-app 生态旧依赖） | 定期运行 `npm audit fix`，必要时升级 `@dcloudio` 相关包 |
| 第三方搜索 API 变更 | 腾讯/东方财富接口可能调整 | 通过 `X-Search-Source` 监控数据源分布，接口失效时自动降级到 Mock |
| 熔断时间窗口 | 当前固定 30 秒，可能不适用于所有场景 | 后续可根据线上错误率动态调整 |
| 分布式部署 | 当前限流使用内存存储，多实例不共享 | 如需多实例部署，引入 Redis + `rate-limit-redis` |

---

## 五、文件变更清单

### 后端
- `server-side-project/.env.production`
- `server-side-project/.env.development`
- `server-side-project/package.json`
- `server-side-project/src/index.js`
- `server-side-project/src/utils/marketData.js`
- `server-side-project/src/controllers/marketController.js`
- `server-side-project/src/services/stockSearchService.js`（新建）
- `server-side-project/.github/workflows/ci.yml`

### 前端
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/package.json`
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/vite.config.js`
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/vitest.config.js`（新建）
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/request.js`
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/stock.test.js`（新建）
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/format.test.js`（新建）
- `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/request.test.js`（新建）

---

## 六、结论

本次推进完成了测试报告 4.2 节全部 5 项建议的最小可运行实现：

- ✅ 股票搜索已接入腾讯/东方财富真实 API，Mock 兜底保留
- ✅ 行情接口已配置独立限流与熔断降级
- ✅ 前端已引入 Vitest，38 个单元测试全部通过
- ✅ 后端依赖结构已整理，`npm audit` 漏洞从 19 降至 17（剩余为 Jest 传递依赖）
- ✅ 生产 CORS 已配置为真实前端域名
- ✅ CI 已增加 `npm audit` 和前端测试步骤
- ✅ 前后端构建、lint、测试均通过

建议后续关注 Jest/前端依赖漏洞修复、第三方搜索 API 稳定性，以及多实例部署时的分布式限流。

---

**报告生成时间**：2026-06-29  
**对应修改范围**：本次会话内对 `server-side-project/`、`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/`、`.github/workflows/` 的 4.2 节专项修改
