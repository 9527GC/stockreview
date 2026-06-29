# Stock Review 项目测试报告

**报告编号**：SR-TEST-20260627  
**测试日期**：2026-06-27  
**测试人员**：Claude Code（测试角色）  
**测试范围**：后端 `server-side-project` + 前端 `Stock Review/uni-preset-vue-vite/uni-preset-vue-vite`  
**测试方法**：代码审查、静态检查、构建验证、API 契约比对、PRD/apidoc 对照  
**测试结论**：本次仅发现并记录问题，未修改任何代码。

---

## 目录

1. [执行摘要](#一执行摘要)
2. [严重问题（Critical）](#二严重问题critical)
3. [高风险问题（High）](#三高风险问题high)
4. [中等问题（Medium）](#四中等问题medium)
5. [低优先级问题（Low）](#五低优先级问题low)
6. [构建与工程化检查](#六构建与工程化检查)
7. [API 契约与文档偏差](#七api-契约与文档偏差)
8. [修复优先级建议](#八修复优先级建议)
9. [结论](#九结论)

---

## 一、执行摘要

本次测试共发现 **4 项严重问题**、**9 项高风险问题**、**17 项中等问题**、**8 项低优先级问题**，以及若干工程化缺失项。问题分布如下：

| 级别 | 数量 | 说明 |
|------|------|------|
| 严重 Critical | 4 | 安全漏洞、功能完全不可用、运行时崩溃 |
| 高风险 High | 9 | 数据完整性、性能、XSS、接口滥用风险 |
| 中等 Medium | 17 | 字段映射错误、UI/UX、API 契约偏差、跨平台兼容 |
| 低优先级 Low | 8 | 代码重复、死代码、显示优化 |

**最需立即关注的问题**：

1. 后端 JWT 签名使用硬编码回退密钥（C-001）
2. `PUT /api/trades/:id` 存在运行时崩溃 bug（C-002）
3. 前端收益曲线/日历/月统计调用错误 API 地址（C-003）
4. CORS 配置为 `origin: '*'`（C-004）
5. 没有任何自动化测试、类型检查、ESLint 或 CI 配置（B-001 ~ B-004）

---

## 二、严重问题（Critical）

### C-001 JWT 签名使用硬编码回退密钥

- **严重级别**：Critical
- **文件位置**：
  - [`server-side-project/src/middleware/auth.js:11`](server-side-project/src/middleware/auth.js#L11)
  - [`server-side-project/src/controllers/authController.js:13`](server-side-project/src/controllers/authController.js#L13)
- **问题描述**：当环境变量 `JWT_SECRET` 未设置时，系统回退到固定字符串 `'stickreview_secret_key'` 进行 JWT 签名与校验。
- **实际代码**：
  ```javascript
  // auth.js:11
  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'stickreview_secret_key');

  // authController.js:13
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'stickreview_secret_key', { expiresIn: '7d' });
  ```
- **风险影响**：攻击者可用该公开密钥伪造任意用户 token，直接绕过登录鉴权，访问所有资产、交易接口。
- **预期行为**：`JWT_SECRET` 必须来自环境变量；若缺失，应用应拒绝启动。
- **修复建议**：删除 `|| 'stickreview_secret_key'`，在启动时校验 `process.env.JWT_SECRET` 是否存在。

---

### C-002 `PUT /api/trades/:id` 运行时崩溃

- **严重级别**：Critical
- **文件位置**：[`server-side-project/src/controllers/tradeController.js:739-756`](server-side-project/src/controllers/tradeController.js#L739-L756)
- **问题描述**：在 `updateTrade` 函数中，第 739 行开始根据 `symbol/market` 推断币种时引用了 `trade.symbol`、`trade.market`、`trade.currency`，但 `trade` 变量直到第 756 行才通过 `Trade.findOne` 查询出来。
- **实际代码**：
  ```javascript
  if (updates.symbol !== undefined || updates.market !== undefined || updates.currency !== undefined) {
    updates.currency = inferCurrencyFromSymbol(
      updates.symbol ?? trade.symbol,   // trade 尚未定义！
      updates.market ?? trade.market,
      updates.currency ?? trade.currency
    );
  }
  // ...
  const trade = await Trade.findOne({ _id: id, userId: req.user._id });
  ```
- **风险影响**：任何调用修改交易接口的请求都会触发 `TypeError: Cannot read properties of undefined`，导致服务不可用。
- **预期行为**：先查询交易记录，再进行币种推断。
- **修复建议**：将币种推断逻辑移动到 `const trade = await Trade.findOne(...)` 之后。

---

### C-003 前端收益曲线/日历/月统计调用错误 API

- **严重级别**：Critical
- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/api/index.js`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/api/index.js)
- **问题描述**：前端三个核心图表接口调用了错误或未文档化的端点：
  - `getProfitCurve` 调用 `/api/profit-curve/profit-curve`，但 [`apidoc.md`](../apidoc.md) 规定应为 `/api/assets/profit-curve`
  - `getProfitCalendar` 调用 `/api/profit-curve/revenue-calendar`，但文档规定应为 `/api/assets/profit-calendar`
  - `getMonthlyStats` 调用 `/api/profit-curve/monthly-stats`，该端点未在文档中定义；月度统计应在 `GET /api/assets/profit-calendar` 的 `stats` 字段返回
- **实际代码**：
  ```javascript
  export const getProfitCurve = (params) => {
    return request({ url: '/api/profit-curve/profit-curve', method: 'GET', params });
  };

  export const getProfitCalendar = (params) => {
    return request({ url: '/api/profit-curve/revenue-calendar', method: 'GET', params });
  };

  export const getMonthlyStats = (params) => {
    return request({ url: '/api/profit-curve/monthly-stats', method: 'GET', params });
  };
  ```
- **风险影响**：收益曲线、收益日历、月度统计功能完全无法正常工作，用户看不到任何图表数据。
- **修复建议**：前端统一改为调用 `/api/assets/profit-curve` 和 `/api/assets/profit-calendar`；月度统计从 `profit-calendar` 响应中解析。

---

### C-004 CORS 允许任意来源

- **严重级别**：Critical
- **文件位置**：[`server-side-project/src/index.js:51-55`](server-side-project/src/index.js#L51-L55)
- **问题描述**：CORS 中间件配置 `origin: '*'`，且允许携带 `Authorization` 头。
- **实际代码**：
  ```javascript
  app.use(cors({
    origin: '*', // 在开发环境中允许所有来源，生产环境应限制为特定域名
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  ```
- **风险影响**：任何恶意网站都可向 API 发起跨域请求。虽然需要 token，但扩大了 XSS/CSRF 攻击面，且与“生产环境应限制”的注释不符。
- **修复建议**：生产环境通过环境变量配置白名单；开发环境可限制为本地前端地址。

---

## 三、高风险问题（High）

### H-001 交易创建缺少必要字段校验

- **严重级别**：High
- **文件位置**：[`server-side-project/src/controllers/tradeController.js:563-607`](server-side-project/src/controllers/tradeController.js#L563-L607)
- **问题描述**：
  - `price`、`quantity` 仅通过 `Number()` 转换，可能得到 `NaN`
  - `type` 未校验必须是 `BUY` 或 `SELL`
  - BUY 方向未校验 `quantity > 0`
  - `symbol` 虽有 `normalizeSymbol`，但未校验空值
- **风险影响**：可写入无效交易记录，导致持仓、现金、资产、收益曲线全部计算错误。
- **修复建议**：增加显式校验并返回 400 错误，例如 `price > 0`、`quantity > 0`、`type ∈ {BUY, SELL}`、`symbol` 非空。

---

### H-002 MongoDB 关键字段缺少索引

- **严重级别**：High
- **文件位置**：
  - [`server-side-project/src/models/Trade.js`](server-side-project/src/models/Trade.js)
  - [`server-side-project/src/models/Asset.js`](server-side-project/src/models/Asset.js)
  - [`server-side-project/src/models/Transfer.js`](server-side-project/src/models/Transfer.js)
- **问题描述**：`Trade`、`Asset`、`Transfer` 等核心集合未对 `userId`、`symbol`、`date` 等高频查询字段建立索引。
- **风险影响**：数据量增大后，持仓、复盘、资产汇总等接口将进行全表扫描，响应时间显著增加。
- **修复建议**：
  - `Trade`：`{ userId: 1, date: 1 }`、`{ userId: 1, symbol: 1 }`
  - `Asset`：`{ userId: 1 }`（唯一索引）
  - `Transfer`：`{ userId: 1, date: -1 }`

---

### H-003 HTML 消毒器可被绕过，存在 XSS 风险

- **严重级别**：High
- **文件位置**：[`server-side-project/src/utils/sanitizeHtml.js`](server-side-project/src/utils/sanitizeHtml.js)
- **问题描述**：使用正则表达式进行 HTML 消毒，无法覆盖多种 XSS 攻击向量：
  - `<img src=x onerror=alert(1)>`（无引号属性）
  - `<svg onload=alert(1)>`
  - `<iframe src="javascript:...">`
  - data URI、CSS `expression()`、`@import`
- **实际代码**：
  ```javascript
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  ```
- **风险影响**：交易备注/新闻中的恶意脚本可能在其他用户查看复盘时被触发。
- **修复建议**：使用经过安全审计的库，如 `DOMPurify`（Node 环境可用 `isomorphic-dompurify`）或 `sanitize-html`。

---

### H-004 没有任何接口限流

- **严重级别**：High
- **文件位置**：[`server-side-project/src/index.js`](server-side-project/src/index.js)
- **问题描述**：未安装/使用 `express-rate-limit` 等限流中间件。
- **风险影响**：
  - 登录接口可被暴力破解
  - 行情、搜索接口可被高频调用，导致第三方 API 额度耗尽或本服务过载
- **修复建议**：对 `/api/auth/login` 及所有 market 接口增加限流，按 IP 或用户维度计数。

---

### H-005 股票搜索返回硬编码 Mock 数据

- **严重级别**：High
- **文件位置**：[`server-side-project/src/controllers/marketController.js:3-23`](server-side-project/src/controllers/marketController.js#L3-L23)
- **问题描述**：搜索接口只返回 6 只固定股票的过滤结果。
- **实际代码**：
  ```javascript
  const suggestions = [
    { symbol: 'SH600519', name: '贵州茅台', market: 'SH' },
    { symbol: 'SZ000001', name: '平安银行', market: 'SZ' },
    { symbol: 'HK00700', name: '腾讯控股', market: 'HK' },
    { symbol: 'AAPL', name: 'Apple Inc.', market: 'US' },
    { symbol: 'BABA', name: 'Alibaba', market: 'US' },
    { symbol: 'HK09988', name: '阿里巴巴', market: 'HK' }
  ];
  ```
- **风险影响**：用户无法搜索到真实股票，交易记账功能受阻。
- **修复建议**：接入真实股票搜索 API；若暂不可行，应在 UI 明确提示“搜索功能维护中”。

---

### H-006 出入金接口未校验类型和金额

- **严重级别**：High
- **文件位置**：[`server-side-project/src/controllers/transferController.js:33-80`](server-side-project/src/controllers/transferController.js#L33-L80)
- **问题描述**：
  - `type` 未校验必须是 `IN` 或 `OUT`
  - `amount` 未校验为正数
  - 当 `type === 'OUT'` 时未校验余额是否充足
- **风险影响**：传入负数金额或非法类型会导致现金、本金计算混乱，总资产可能变为负数。
- **修复建议**：
  - 校验 `type ∈ {IN, OUT}`
  - 校验 `amount > 0` 且为有限数字
  - OUT 时校验 `asset.cash >= amountInCNY`

---

### H-007 收益曲线存在两条冲突路由

- **严重级别**：High
- **文件位置**：
  - [`server-side-project/src/index.js:75`](server-side-project/src/index.js#L75)
  - [`server-side-project/src/routes/profitCurveRoutes.js`](server-side-project/src/routes/profitCurveRoutes.js)
- **问题描述**：`/api/profit-curve` 路由挂载了 `/profit-curve`、`/revenue-calendar`、`/monthly-stats` 等，与 `/api/assets/*` 重复，且返回结构不同（带 `success` 包装）。
- **风险影响**：
  - 前端调用错误路径会 404 或解析失败
  - 维护困难，同一功能存在两份实现
  - 文档与实现不一致
- **修复建议**：下线 `/api/profit-curve` 下的重复端点，或统一合并到 `/api/assets` 并遵循文档响应格式。

---

### H-008 `getQuote` 未归一化股票代码

- **严重级别**：High
- **文件位置**：[`server-side-project/src/controllers/marketController.js:34-51`](server-side-project/src/controllers/marketController.js#L34-L51)
- **问题描述**：直接将用户输入的 `symbol` 传给 `getQuotes()`，未调用 `normalizeSymbol()` 进行归一化。
- **风险影响**：用户输入 `SH600519` 与 `600519.SH` 可能返回不同结果或查不到数据，导致交易价格无法自动填充。
- **修复建议**：在接口入口处调用 `normalizeSymbol(symbol)`。

---

### H-009 `cleanDirtyData` 只做标记未真正重算

- **严重级别**：High
- **文件位置**：[`server-side-project/src/services/dirtyDataManager.js:110-154`](server-side-project/src/services/dirtyDataManager.js#L110-L154)
- **问题描述**：代码注释写明“这里应该调用 profitCurveScheduler 的重新计算逻辑”，但实际只把 `isDirty` 置为 `false`。
- **风险影响**：脏数据被伪装成已清理，收益曲线/日历数据仍可能是错误的历史值。
- **修复建议**：实现真正的重新计算逻辑，或移除该接口避免误导。

---

## 四、中等问题（Medium）

### M-001 前端 `TradeModal` 手续费字段命名错误

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:629-638`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L629-L638)
- **问题描述**：前端根据 `feeRate` 计算手续费后，以 `fee` 字段提交，但 API 文档期望 `commission`。
- **修复建议**：提交字段改为 `commission`。

---

### M-002 前端 `TradeModal` 股票名称字段命名错误

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:629-638`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L629-L638)
- **问题描述**：前端提交 `stockName`，但 API 文档期望 `name`。
- **修复建议**：提交字段改为 `name`。

---

### M-003 前端复盘提交把字段包在 `review` 对象里

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/review/list.vue:176-185`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/review/list.vue#L176-L185)
- **问题描述**：`handleReviewSubmit` 将 `isSystemCompliant`/`cognitiveBias`/`improvementMeasures` 包装在 `review` 对象中提交，而 API 文档要求顶层字段。
- **修复建议**：按文档要求改为顶层字段提交。

---

### M-004 `POST /api/trades` 未接收复盘字段

- **文件位置**：[`server-side-project/src/controllers/tradeController.js:563-580`](server-side-project/src/controllers/tradeController.js#L563-L580)
- **问题描述**：创建交易时未从请求体中提取 `isSystemCompliant`、`cognitiveBias`、`improvementMeasures`，用户只能在创建后再通过 PUT 编辑。
- **修复建议**：在 `addTrade` 中读取并保存这些字段。

---

### M-005 `Asset` 模型的 `updatedAt` 不会自动更新

- **文件位置**：[`server-side-project/src/models/Asset.js`](server-side-project/src/models/Asset.js)
- **问题描述**：`updatedAt` 字段仅有 `default: Date.now`，没有 `timestamps: true` 或 pre-save 钩子。
- **修复建议**：在 Schema options 中增加 `timestamps: true`。

---

### M-006 资产汇总响应头名称与文档不符

- **文件位置**：[`server-side-project/src/controllers/assetController.js:50`](server-side-project/src/controllers/assetController.js#L50)
- **问题描述**：实际返回头为 `X-DailyProfit-Date`，文档规定为 `X-ProfitHistory-Date`。
- **修复建议**：统一为 `X-ProfitHistory-Date`。

---

### M-007 `getReviews` 未限制 `pageSize` 且默认拉取快照

- **文件位置**：[`server-side-project/src/controllers/tradeController.js:355-423`](server-side-project/src/controllers/tradeController.js#L355-L423)
- **问题描述**：
  - `pageSize` 未校验上限，可能被设为极大值
  - `include` 默认值为 `'marketOverview,news'`，每次查询都返回完整快照数据
- **修复建议**：限制 `pageSize <= 100`；默认 `include` 为空或只包含必要字段。

---

### M-008 前端 `ProfitCalendar` 响应解析错误

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ProfitCalendar.vue:100-111`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ProfitCalendar.vue#L100-L111)
- **问题描述**：按 `res.data.dailyProfits` 解析，但文档返回结构为 `{ dailyProfits, stats }`，没有 `data` 包装。
- **修复建议**：改为 `res.dailyProfits` 和 `res.stats`。

---

### M-009 前端 `App.vue` 用 `window.location.pathname` 判断登录页

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/App.vue:7-11`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/App.vue#L7-L11)
- **问题描述**：在非 H5 平台（微信小程序、App）中 `window` 对象可能不存在或行为不一致。
- **修复建议**：使用 `uni.getSystemInfoSync` 或 `getCurrentPages` 判断当前页面。

---

### M-010 `PCLayout.vue` 用 `uni.reLaunch` 切换主导航

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/layouts/PCLayout.vue:159-163`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/layouts/PCLayout.vue#L159-L163)
- **问题描述**：`reLaunch` 会关闭所有页面并重新打开目标页，导致页面状态丢失、导航缓慢。
- **修复建议**：使用 `uni.redirectTo` 或 `uni.navigateTo`。

---

### M-011 `TradeModal` 含硬编码 Mock 股票选项

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:523-535`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L523-L535)
- **问题描述**：组件内写死了几只股票作为 fallback，生产环境会误导用户。
- **修复建议**：移除 Mock 数据，或仅在开发环境显示。

---

### M-012 登录页手机号登录功能无效

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/login/login.vue:150-153`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/login/login.vue#L150-L153)
- **问题描述**：当用户选择“手机号登录”并输入手机号/验证码后，仍发送 `username` 和 `password`。
- **修复建议**：移除手机号登录选项，或实现独立的后端手机号登录接口。

---

### M-013 前端 `getMarketOverview` 参数展开过于宽松

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/api/index.js:126-132`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/api/index.js#L126-L132)
- **问题描述**：`...options` 直接展开到请求配置，若传入 `method` 等字段会覆盖默认配置。
- **修复建议**：只接受已知选项（如 `silent`、`params`）。

---

### M-014 资产页未显示大盘行情

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/assets/index.vue`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/assets/index.vue)
- **问题描述**：PRD 要求在资产页展示上证指数、深证成指、创业板指，但页面只调用了 `store.fetchMarketOverview()`，未渲染数据。
- **修复建议**：增加大盘行情卡片。

---

### M-015 `TradeModal` 支持 `FUND` 市场但后端未定义

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:38-42`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L38-L42)
- **问题描述**：前端可选择“基金”，但 API 文档和后端仅支持 `SH/SZ/HK/US`。
- **修复建议**：移除 `FUND` 选项或扩展后端支持。

---

### M-016 `ReviewModal` 硬编码 `¥` 货币符号

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ReviewModal.vue:24`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ReviewModal.vue#L24)
- **问题描述**：成交价格始终显示 `¥`，但交易可能是 HKD 或 USD。
- **修复建议**：根据 `record.currency` 动态显示货币符号。

---

### M-017 `getProfitCalendar` 前端日期缺少时区处理

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/review/list.vue:144-151`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/review/list.vue#L144-L151)
- **问题描述**：日期选择器返回本地时间格式化为 `YYYY-MM-DD`，但后端按北京时间口径统计。
- **风险影响**：海外用户或系统时区不一致时可能出现日期偏差。
- **修复建议**：统一使用北京时间进行日期格式化。

---

## 五、低优先级问题（Low）

### L-001 `normalizeSymbol` 函数多处重复

- **文件位置**：
  - `src/stores/trade.js`
  - `src/components/HistoryHoldingsModal.vue`
  - `src/components/HoldingDetailModal.vue`
- **问题描述**：相同函数在多个文件中重复定义。
- **修复建议**：提取到 `src/utils/symbol.js` 共享。

---

### L-002 `getCurrencySymbol` 函数多处重复

- **文件位置**：
  - `src/pages/assets/index.vue`
  - `src/pages/review/list.vue`
  - `src/components/HistoryHoldingsModal.vue`
  - `src/components/HoldingDetailModal.vue`
- **修复建议**：提取到共享工具函数。

---

### L-003 `toFiniteNumber`、`formatOverviewValue` 等工具函数重复

- **文件位置**：`src/components/TradeModal.vue`、`src/components/ReviewModal.vue`
- **修复建议**：提取到 `src/utils/format.js`。

---

### L-004 `pages/trade/add.vue` 是冗余/孤立页面

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/trade/add.vue`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/pages/trade/add.vue)
- **问题描述**：功能与 `TradeModal` 重复，使用原生 `<input type="date">`，缺少股票搜索、自动填价、市场概览等功能，且没有导航入口。
- **修复建议**：删除或整合到主流程。

---

### L-005 `TradeModal` 中 `filterStockOption` 为死代码

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:537-544`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L537-L544)
- **问题描述**：函数定义了但未被使用。
- **修复建议**：删除。

---

### L-006 `ProfitCalendar` 年份选择器固定 5 年范围

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ProfitCalendar.vue:137-144`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/ProfitCalendar.vue#L137-L144)
- **问题描述**：仅显示当前年前后 5 年，历史更久的交易无法查看。
- **修复建议**：根据实际数据动态确定范围。

---

### L-007 `request.js` 错误提取未处理嵌套 `data.data`

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/request.js:13-36`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/utils/request.js#L13-L36)
- **问题描述**：`extractErrorText` 只检查一层 `data.message`，未处理 `{ data: { message: '...' } }` 的嵌套情况。
- **修复建议**：增加对 `data.data?.message` 的检查。

---

### L-008 前端 `mood` 枚举与后端不一致

- **文件位置**：[`Stock Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue:179-184`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue#L179-L184)
- **问题描述**：后端支持 `NEUTRAL,CALM,CONFIDENT,ANXIOUS,IMPULSIVE,EXCITED,FEAR`，前端只提供 4 项。
- **修复建议**：统一枚举值。

---

## 六、构建与工程化检查

### B-001 测试基础设施缺失

- **问题描述**：
  - 后端 `package.json` 中 `test` 脚本为 `echo "Error: no test specified" && exit 1`
  - 无 Jest/Vitest/Playwright 等任何测试框架配置
- **风险影响**：无法通过自动化测试保障回归质量。
- **修复建议**：为后端接口增加 Jest/Supertest 测试；为前端组件增加 Vitest 单元测试。

---

### B-002 无 ESLint/Prettier 配置

- **问题描述**：前后端均未发现 `.eslintrc*`、`.prettierrc*` 或对应 package script。
- **风险影响**：代码风格不一致，潜在问题（如未使用变量、=== 与 == 混用）无法被静态发现。
- **修复建议**：统一配置 ESLint + Prettier。

---

### B-003 前端无 TypeScript 配置

- **问题描述**：前端 package.json 依赖了 Vue/UniApp 类型包，但项目根目录无 `tsconfig.json`，`vue-tsc --noEmit` 无法运行。
- **风险影响**：类型检查缺失，运行时容易出现 `Cannot read properties of undefined` 类错误。
- **修复建议**：补充 `tsconfig.json` 并接入 `vue-tsc` 类型检查。

---

### B-004 无 CI/CD 配置

- **问题描述**：项目根目录无 `.github/workflows`、`.gitlab-ci.yml` 等持续集成配置。
- **风险影响**：无法自动执行构建、测试、部署流水线。
- **修复建议**：建立 CI 流水线，至少执行安装、构建、静态检查。

---

### B-005 前端构建存在脚本类型警告

- **问题描述**：运行 `npm run build:h5` 成功，但提示：
  ```
  <script src="/config.js"> in "/index.html" can't be bundled without type="module" attribute
  ```
- **修复建议**：为 `index.html` 中的 `<script>` 标签添加 `type="module"` 或按 UniApp 推荐方式处理。

---

### B-006 后端语法检查通过

- **验证结果**：对 `server-side-project/src/**/*.js` 执行 `node --check`，无语法错误。

---

### B-007 前端生产构建通过

- **验证结果**：`npm run build:h5` 构建成功，输出到 `dist/build/h5`。

---

### B-008 后端可启动

- **验证结果**：`npm run dev` 可正常启动并监听端口，需本地 MongoDB 可达。

---

## 七、API 契约与文档偏差

| 编号 | 偏差项 | 文档规定 | 实际实现 | 涉及文件 |
|------|--------|----------|----------|----------|
| D-001 | 收益曲线端点 | `/api/assets/profit-curve` | 另有 `/api/profit-curve/profit-curve` | `index.js:75`、`routes/profitCurveRoutes.js` |
| D-002 | 收益日历端点 | `/api/assets/profit-calendar` | 另有 `/api/profit-curve/revenue-calendar` | `index.js:75`、`routes/profitCurveRoutes.js` |
| D-003 | 月度统计端点 | 在 `profit-calendar.stats` 返回 | 前端调用未文档化的 `/api/profit-curve/monthly-stats` | `src/api/index.js:38` |
| D-004 | 交易手续费字段 | `commission` | 前端发送 `fee` | `TradeModal.vue:629-638` |
| D-005 | 股票名称字段 | `name` | 前端发送 `stockName` | `TradeModal.vue:629-638` |
| D-006 | 复盘字段位置 | 顶层字段 | 前端包装在 `review` 对象 | `review/list.vue:176-185` |
| D-007 | 资产汇总响应头 | `X-ProfitHistory-Date` | 实际返回 `X-DailyProfit-Date` | `assetController.js:50` |
| D-008 | 新增交易复盘字段 | 应接收 `isSystemCompliant` 等 | `addTrade` 未读取 | `tradeController.js:563-580` |
| D-009 | 响应格式一致性 | 统一 `{ message }` | `profitCurveRoutes` 使用 `{ success, message }` | `routes/profitCurveRoutes.js` |
| D-010 | Transfer 列表 | 应返回 `total` | 仅返回 `list` | `transferController.js:18-27` |

---

## 八、修复优先级建议

### P0 — 阻塞上线（必须修复）

1. **C-001**：删除 JWT 硬编码回退密钥
2. **C-002**：修复 `updateTrade` 中 `trade` 未定义 bug
3. **C-003**：前端统一改为调用 `/api/assets/profit-curve` 和 `/api/assets/profit-calendar`
4. **C-004**：生产环境限制 CORS 来源

### P1 — 尽快修复（影响核心功能或安全）

5. **H-001**：为交易创建增加字段校验
6. **H-002**：为 MongoDB 关键字段加索引
7. **H-003**：替换 `sanitizeHtml` 为安全库
8. **H-004**：增加接口限流
9. **H-005**：接入真实股票搜索接口
10. **H-006**：为出入金增加类型/金额校验
11. **H-007**：下线或合并重复的收益曲线路由
12. **H-008**：`getQuote` 归一化股票代码
13. **H-009**：实现真正的脏数据重算逻辑

### P2 — 质量提升（建议排期）

14. **M-001 ~ M-003**：统一前端字段命名与提交结构
15. **M-004**：新增交易支持复盘字段
16. **M-005 ~ M-007**：模型与接口细节修正
17. **M-008 ~ M-017**：前端响应解析、跨平台、UI/UX 改进
18. **L-001 ~ L-008**：代码重构、删除死代码、枚举统一
19. **B-001 ~ B-005**：建立测试、类型检查、ESLint、CI/CD

---

## 九、结论

Stock Review 项目当前处于**“可运行但不可靠”**的状态：

- **可用**：基础登录、交易创建、持仓查询、资产汇总接口可正常工作。
- **不可用/有风险**：收益曲线/日历因前端调用错误端点而完全失效；交易编辑接口会因代码 bug 崩溃；JWT、CORS、XSS 存在安全漏洞；搜索功能仅为 Mock；缺少所有基础工程化保障。

建议按 **P0 → P1 → P2** 的顺序修复，并在完成 P0/P1 后进行一次完整的端到端回归测试。

---

**报告生成时间**：2026-06-27  
**下次建议复核时间**：P0/P1 修复完成后  
**报告维护者**：待指定
