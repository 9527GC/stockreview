# 项目整体测试报告

**项目名称**：Stock Review（股票复盘系统）  
**测试日期**：2026-07-01  
**测试范围**：前端（uni-app Vue3 + Vite）+ 后端（Node.js + Express + MongoDB）+ 文档一致性 + 基础安全审计  
**测试人员**：Claude Code  
**代码分支**：`master`（commit `e88ad63`）  

---

## 一、测试环境

| 项目 | 路径 | 技术栈 | 主要命令 |
|------|------|--------|----------|
| 后端 | `server-side-project/` | Node.js + Express + Mongoose + Jest | `npm test`、`npm run lint`、`npm audit` |
| 前端 | `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/` | uni-app Vue3 + Vite + Vitest | `npm run test`、`npm run build:h5` |
| 文档 | `docs/` | Markdown | 人工审查 |

> **说明**：本次测试为静态检查与自动化测试结合，未进行端到端人工联调；后端测试需要本地 MongoDB 实例及外网行情接口，部分结果受网络环境影响。

---

## 二、后端测试结果

### 2.1 项目结构

- `src/` 共 **43 个 JS 文件**，主要包含 controllers、routes、models、services、utils、jobs、middleware。
- `tests/` 共 **6 个 JS 文件**，包含 `auth.test.js`、`trade.test.js`、`transfer.test.js` 及全局 setup/teardown。

### 2.2 单元测试（Jest）

**执行命令**：`npm test`（`jest --runInBand --forceExit`）

| 指标 | 结果 |
|------|------|
| 测试套件 | 3 个，2 通过 / 1 失败 |
| 测试用例 | 12 个，11 通过 / 1 失败 |
| 失败位置 | `tests/trade.test.js:102` |
| 失败原因 | 更新交易后期望 `isSystemCompliant` 为 `"不符合系统"`，实际返回 `null` |

**失败根因分析**：

`src/controllers/tradeController.js:891` 的 `allowedFields` 白名单仅包含：

```js
['price', 'quantity', 'commission', 'feeMode', 'feeRate', 'feeAmount', 'news', 'mood', 'logic']
```

缺少 `apidoc.md` 明确声明的复盘字段：`isSystemCompliant`、`cognitiveBias`、`improvementMeasures`。因此更新请求传入这些字段时被静默丢弃，测试断言失败。

> **结论**：这是功能性缺陷，影响复盘功能的核心流程，属于 **P0 级问题**。

### 2.3 测试覆盖率

| 指标 | 覆盖率 |
|------|--------|
| Statements | 38.71% |
| Branches | 20.05% |
| Functions | 31.22% |
| Lines | 40.61% |

覆盖率较低，主要因为 controllers、services、utils 中大量业务逻辑分支未被现有测试覆盖；models 和 routes 基本达到 100%。

### 2.4 Lint 检查

**执行命令**：`npm run lint`

| 类型 | 数量 |
|------|------|
| 错误 | 0 |
| 警告 | 27 |

警告类别：
- `no-unused-vars`：10 处（主要为未使用的 import 变量）
- `prefer-const`：14 处（应为 `const` 的变量使用了 `let`）
- 其他参数未使用警告：3 处

> 结论：代码可编译运行，但代码债务较多，建议定期清理。

### 2.5 安全审计

**执行命令**：`npm audit --registry=https://registry.npmjs.org --audit-level=moderate`

| 结果 | 数量 |
|------|------|
| 漏洞 | 0 个 |
| 高风险 | 0 |
| 中风险 | 0 |
| 低风险 | 0 |

> 结论：当前依赖无已知安全漏洞。

### 2.6 环境变量安全

- `.env.development` 已加入 `.gitignore`，未提交到仓库。
- 配置文件中未发现硬编码生产密钥、数据库密码或 JWT 密钥。
- `JWT_SECRET=dev-secret-key` 仅用于本地开发，符合安全预期。
- **缺失**：项目没有 `.env.example` 和 `.env.production` 文件，与 `apidoc.md` 中环境配置说明不一致，新成员/生产部署缺少参考模板。

### 2.7 依赖版本风险

| 依赖 | 当前版本 | 风险 |
|------|----------|------|
| `mongoose` | `^8.23.0` | 主版本已落后（最新 9.x），建议评估升级 |
| `dotenv` | `^17.3.1` | 小版本落后，可更新至 17.4.2 |
| `express` | `^5.2.1` | 正常 |
| `jsonwebtoken` | `^9.0.3` | 正常 |
| `sanitize-html` | `^2.17.5` | 正常 |

---

## 三、前端测试结果

### 3.1 项目结构

- `src/` 共 **26 个 JS/Vue/TS 文件**，包含入口、页面、组件、工具函数、状态管理、配置。
- 主要页面：登录、资产汇总、持仓复盘、交易记录等。
- 组件：弹窗、图表、日历、表单等。

### 3.2 单元测试（Vitest）

**执行命令**：`npm run test`

| 指标 | 结果 |
|------|------|
| 测试文件 | 3 个，全部通过 |
| 测试用例 | 38 个，全部通过 |
| 耗时 | 约 2.04 秒 |

测试文件覆盖：
- `src/utils/format.test.js`（12 个用例）
- `src/utils/request.test.js`（13 个用例）
- `src/utils/stock.test.js`（13 个用例）

> 结论：工具函数测试覆盖充分，全部通过。

### 3.3 H5 生产构建

**执行命令**：`npm run build:h5`

| 指标 | 结果 |
|------|------|
| 构建结果 | 成功 |
| 产物目录 | `dist/build/h5/` |
| 产物大小 | 约 2.9 MB |
| 最大 JS | `index-*.js` 约 1.5 MB |

构建警告：
1. `<script src="/static/config.js"> in "/index.html" can't be bundled without type="module" attribute` — 不影响功能，但建议修复。
2. `Browserslist: browsers data (caniuse-lite) is 6 months old` — 建议运行 `npx update-browserslist-db@latest`。

> 结论：前端可成功构建部署，产物体积可控。

### 3.4 类型与配置检查

| 配置项 | 状态 | 说明 |
|--------|------|------|
| `tsconfig.json` | ⚠️ | `strict: false`，类型安全较弱；未包含 Vitest 全局类型 |
| `vite.config.js` | ⚠️ | 缺少 `@` 路径别名显式声明；`test` 配置与 `vitest.config.js` 重复 |
| `vitest.config.js` | ⚠️ | 使用 `__dirname`，在 ESM 模式下存在兼容性风险 |

### 3.5 依赖版本风险

| 依赖 | 当前版本 | 风险 |
|------|----------|------|
| `@dcloudio/uni-*` | `3.0.0-4080720251210001` | **高风险**：日期标记版本属于 alpha/预览通道，不稳定 |
| `echarts` | `^6.0.0` | 中风险：大版本升级，需确认兼容性 |
| `vue-i18n` | `^9.1.9` | 低风险：版本较旧，建议升级 |
| `vue` / `pinia` / `dayjs` | 正常 | 版本合理 |

### 3.6 环境变量安全

- `.env` 与 `.env.example` 仅包含本地 API 地址，无敏感信息泄露。
- 环境变量命名以 `VITE_` 开头，符合 Vite 约定。

---

## 四、代码安全与质量风险

### 4.1 已收敛的安全风险（基本修复）

- JWT 密钥改为环境变量读取，无硬编码生产密钥。
- CORS 改为 `CORS_ORIGINS` 环境变量白名单，未使用通配符。
- HTML 输入已使用 `sanitize-html` 消毒。
- 接口已加 `express-rate-limit` 限流，登录接口额外限制。
- 核心 MongoDB 集合已加索引。

### 4.2 剩余安全风险

| 风险 | 位置 | 说明 |
|------|------|------|
| XSS 依赖后端消毒 | `ReviewModal.vue:122` | 使用 `v-html` 渲染 `news`，若后端消毒被绕过则存在 XSS 风险 |
| 测试/脚本硬编码密码 | `scripts/create-user.js`、`create_user.js` | 均硬编码用户名/密码 `9527` |
| 缺少 Helmet 等加固 | `src/index.js` | 未配置 Helmet、请求体大小限制等安全中间件 |
| 限流器内存存储 | `src/index.js` | 多实例部署时 `express-rate-limit` 不共享，需后续接入 Redis |

### 4.3 业务逻辑风险

| 风险 | 位置 | 说明 |
|------|------|------|
| **复盘字段无法更新（P0）** | `tradeController.js:891` | `allowedFields` 缺少复盘字段，与 `apidoc.md` 不一致 |
| **收益曲线口径错误（P1）** | `assetController.js:138-143` | 返回区间归一化收益率，而非 `DailyProfit.cumulativeReturn`，与文档不符 |
| 交易写操作依赖外部行情 API | `tradeController.js` / `dailyProfitBackfill.js` | `addTrade`/`updateTrade` 同步调用 Eastmoney 历史行情，网络失败会导致操作失败或耗时 |
| 持仓接口全量回放交易 | `assetController.js` / `tradeController.js` | 数据量增长后可能成为性能瓶颈 |
| 脏数据日志异常 | `dirtyDataManager.js:72` | 输出 `Marked undefined snapshots as dirty`，计数变量未正确获取 |

### 4.4 代码质量债务

- 后端 ESLint 27 个警告，主要为未使用变量和 `const`/`let` 混用。
- 前端 `tsconfig.json` 未开启严格模式。
- 多个 `scripts/` 临时脚本重复或命名不规范（`create-user.js` 与 `create_user.js` 并存）。
- 控制台日志较多，生产环境建议接入结构化日志。

---

## 五、文档一致性检查

| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/apidoc.md` | ⚠️ | 与代码存在不一致：收益曲线口径、PUT 复盘字段 |
| `docs/market-snapshot-proposal.md` | ✅ | 与代码基本一致，P0/P1 项已实施 |
| `docs/需求prd.md` | ✅ | 未检出明显不一致 |
| `DEPLOY_SEALOS.md` | ⚠️ | 文档写生成 `/usr/share/nginx/html/config.js`，实际生成 `/usr/share/nginx/html/static/config.js` |
| 后端 `.env.example` | ❌ | 缺失，与 `apidoc.md` 环境配置说明不一致 |
| 后端 `.env.production` | ❌ | 缺失 |

---

## 六、Git 与工程化检查

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Git 工作区 | 存在未跟踪文件 | `server-side-project/coverage/` 未加入 `.gitignore` |
| 根目录 `.gitignore` | ⚠️ | 第 19 行 ` dist/` 前带空格，导致 `dist/` 实际未被忽略 |
| 子目录 `.gitignore` | 基本合理 | 已覆盖 `node_modules`、`.env` 等 |
| 后端 Dockerfile | 缺失 | 仅 `entrypoint.sh`，无容器化构建文件 |
| 前端 Dockerfile | 合理 | 多阶段构建 + nginx 静态服务 |

---

## 七、风险清单与优先级

| 优先级 | 编号 | 问题描述 | 影响 |
|--------|------|----------|------|
| **P0** | R-001 | `PUT /api/trades/:id` 无法更新复盘字段（`isSystemCompliant` 等） | 复盘功能核心流程不可用，测试失败 |
| **P0** | R-002 | 后端 `.env.example` / `.env.production` 缺失 | 新成员/生产部署无法正确配置环境变量 |
| **P1** | R-003 | 收益曲线返回值使用区间归一化，与 `apidoc.md` 和用户预期不符 | 数据口径错误，可能误导投资决策 |
| **P1** | R-004 | 交易创建/编辑强依赖外部行情 API，失败后请求耗时/不稳定 | 核心写操作成功率下降 |
| **P1** | R-005 | 测试用脚本硬编码用户名密码 | 凭证泄露和误操作风险 |
| **P1** | R-006 | `ReviewModal.vue` 使用 `v-html` 渲染用户输入 HTML | XSS 风险依赖后端消毒正确性 |
| **P1** | R-007 | 后端测试覆盖率仅 40.61%，测试不稳定 | 回归风险高，部署信心不足 |
| **P1** | R-008 | `@dcloudio/uni-*` 使用 alpha 日期版本 | 生产环境底层框架不稳定 |
| **P2** | R-009 | 根目录 `.gitignore` 中 `dist/` 前带空格，未生效 | 可能误提交根目录构建产物 |
| **P2** | R-010 | `server-side-project/coverage/` 未加入 `.gitignore` | 测试覆盖率报告可能误提交 |
| **P2** | R-011 | `dirtyDataManager` 输出 `undefined snapshots` 日志 | 日志不准确，掩盖潜在问题 |
| **P2** | R-012 | 持仓接口全量回放交易历史 | 大数据量下性能下降 |
| **P2** | R-013 | `tsconfig.json` 严格模式关闭，ESLint 27 个 warning | 类型安全与代码质量债务 |
| **P2** | R-014 | 后端 Dockerfile 缺失 | 后端未容器化，部署一致性不足 |

---

## 八、改进建议

### 立即执行（P0）

1. **修复复盘字段更新**：在 `tradeController.js` 的 `allowedFields` 中补充 `isSystemCompliant`、`cognitiveBias`、`improvementMeasures`，并同步修复/补充测试。
2. **补充环境变量模板**：创建 `server-side-project/.env.example` 和 `.env.production`，覆盖所有 `process.env` 使用点。

### 短期优化（P1）

3. **统一收益曲线口径**：确认产品期望后，修改代码或文档，确保 `data[].value` 与 `apidoc.md` 一致。
4. **解耦交易写操作与外部行情**：将行情回填改为异步任务或提供降级逻辑，避免交易保存被行情接口阻塞。
5. **清理硬编码凭证**：合并/删除重复创建脚本，移除硬编码密码，或改为命令行参数传入。
6. **提升测试稳定性**：对行情 API 和 MongoDB 进行 mock/隔离，解决测试间数据冲突和外部依赖问题。
7. **升级前端依赖**：评估将 `@dcloudio/uni-*` 迁移到稳定通道，降低生产风险。

### 中期改进（P2）

8. **修复 `.gitignore`**：删除根目录 `dist/` 前的空格；将 `coverage/` 加入后端 `.gitignore`。
9. **修复构建警告**：为 `index.html` 中的 `/static/config.js` 添加 `type="module"` 或改用动态注入；更新 browserslist 数据。
10. **开启 TypeScript 严格模式**：逐步在前端启用 `strict: true`，补充 Vitest 全局类型。
11. **补充后端 Dockerfile**：完成容器化部署配置。
12. **逐步清理 ESLint 警告**：可自动修复部分使用 `eslint --fix`，其余手动清理。

---

## 九、总体结论

| 维度 | 评估 | 说明 |
|------|------|------|
| **功能正确性** | ⚠️ | 存在 P0 级功能缺陷（复盘字段无法更新），需立即修复 |
| **测试覆盖** | ⚠️ | 后端测试不稳定且覆盖率偏低（40.61%），前端测试全部通过但覆盖范围有限 |
| **代码质量** | ⚠️ | ESLint 27 个警告，前端 TypeScript 严格模式未开启 |
| **安全基线** | ✅ | 无已知漏洞，敏感信息未泄露，核心安全加固已收敛 |
| **构建部署** | ✅ | 前端构建成功，后端可直接运行；但后端缺少 Dockerfile |
| **文档一致性** | ⚠️ | 部分接口口径与文档不一致，环境模板缺失 |

**综合评级**：**B（可运行，但需修复 P0 缺陷并补充工程化细节）**

> **核心建议**：优先修复 **R-001（复盘字段无法更新）** 和 **R-002（环境模板缺失）**，随后处理收益曲线口径和测试稳定性问题。整体安全风险可控，但功能回归风险需要高度重视。

---

*报告生成时间：2026-07-01*  
*生成工具：Claude Code*  
*下次建议复核：修复 P0 问题后重新跑全量测试。*
