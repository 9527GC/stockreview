# 微信扫码登录与绑定可靠性修复实施计划

> **供自动化执行者使用：** 必须使用 `superpowers:executing-plans` 或 `superpowers:subagent-driven-development` 逐任务执行；每个步骤均以复选框记录。

**目标：** 修复二维码登录令牌泄露、微信绑定并发竞争、小程序参数与环境配置缺陷、网页端轮询可靠性及收益回填测试不稳定问题。

**架构：** 后端以会话状态机保障二维码会话的时效性和一次性消费：登录会话在过期后不可领取，确认后的 JWT 通过原子更新仅可领取一次；绑定会话用原子状态抢占避免并发重复写入。小程序把环境域名集中到配置模块，并将二维码参数解码改为容错流程；网页端将轮询封装为可取消、可失败的逻辑。收益回填测试完全替换外部行情与缓存路径，确保测试数据隔离。

**技术栈：** Node.js、Express、Mongoose、Jest、Vue 3、Vitest、微信原生小程序、node:test。

**规格：** 本计划基于 2026-09-19 的项目整体测试报告及用户确认的“直接在当前工作区增量修复”执行。

## 全局约束

- 所有代码注释、文档和提交信息使用简体中文。
- 保留当前工作区已有未提交改动；禁止执行 `git reset`、`git clean` 或覆盖无关文件。
- 每项行为变更先新增或修改能够复现问题的自动化测试，先观察失败，再写最小实现。
- 本轮不执行 `npm audit fix --force`，不将 DCloud / uni-app 大版本升级混入功能安全修复。
- 小程序统一使用生产 API 域名 `https://stock.gc9527.com`；本地开发数据库与生产部署是仅有的两个环境。

---

## 文件结构

- `apps/backend/src/models/WechatLoginSession.js`：增加过期自动清理所需 TTL 索引，并允许记录领取时间。
- `apps/backend/src/models/WechatBindSession.js`：增加 `processing` 会话状态和处理开始时间。
- `apps/backend/src/controllers/wechatController.js`：实现登录结果原子领取、过期拒绝与绑定会话原子抢占。
- `apps/backend/tests/wechatMiniappBind.test.js`：覆盖登录会话过期、一次性领取、绑定并发抢占。
- `apps/backend/tests/dailyProfitBackfill.test.js`：mock 行情缓存入口、清理相关集合并冻结时间。
- `apps/miniapp/config/env.js`：唯一的小程序 API 环境选择入口。
- `apps/miniapp/pages/wechat-bind/index.js`：安全解析 `scene` 并引用环境配置。
- `apps/miniapp/tests/wechat-bind-runtime.test.js`：以 VM 运行页面脚本，覆盖非法和合法二维码参数。
- `apps/miniapp/README.md`：记录开发者工具中切换环境的方法和发布检查项。
- `apps/frontend/src/pages/login/wechatLoginPolling.js`：封装可测试的轮询状态机。
- `apps/frontend/src/pages/login/login.vue`：接入轮询模块，补充关闭和卸载清理。
- `apps/frontend/src/pages/login/wechatLoginPolling.test.js`：覆盖确认、过期、失败、网络异常、停止轮询。

### Task 1：二维码登录会话的过期与一次性领取

**文件：**
- 修改：`apps/backend/src/models/WechatLoginSession.js`
- 修改：`apps/backend/src/controllers/wechatController.js`
- 测试：`apps/backend/tests/wechatMiniappBind.test.js`

**接口：**
- `GET /api/auth/wechat/miniapp-login/status?token=<token>` 在会话确认且未领取时返回 `{ status: 'confirmed', token, userInfo }`。
- 领取后同一 token 返回 HTTP 409，且数据库不再保存 `loginToken`。
- 任何 `expiresAt <= now` 的会话返回 HTTP 410，绝不返回 JWT。

- [ ] 新增“已过期 confirmed 会话不能返回 JWT”和“确认会话只能领取一次”的后端集成测试。
- [ ] 运行该测试，确认现有实现会返回过期 JWT 或第二次 JWT，从而失败。
- [ ] 将 `expiresAt` 改为 MongoDB TTL 索引；在状态查询中用包含 `expiresAt: { $gt: now }`、`status: 'confirmed'` 和未领取条件的 `findOneAndUpdate` 原子领取，写入 `usedAt` 并 `$unset` JWT / `jti`。
- [ ] 对查询到但过期的会话返回 410；对已领取会话返回 409；保留 pending/failed/expired 的非敏感状态响应。
- [ ] 运行会话测试及后端完整 Jest 测试。

### Task 2：微信绑定会话的并发抢占

**文件：**
- 修改：`apps/backend/src/models/WechatBindSession.js`
- 修改：`apps/backend/src/controllers/wechatController.js`
- 测试：`apps/backend/tests/wechatMiniappBind.test.js`

**接口：**
- `bindMiniappWechat` 仅允许一条符合 `{ tokenHash, status: 'pending', expiresAt: { $gt: now } }` 的会话进入处理。
- 获得处理权的会话先置为 `processing`，成功后 `bound`，失败后 `failed`。
- 未获得处理权的并发请求返回 409 或 410，且不触发微信 code 换取与用户写入。

- [ ] 写入并发/重复请求测试，断言第二请求无法进入 `getJsCodeSession`。
- [ ] 运行测试，确认旧的“先查询再保存”流程无法阻止两个请求都通过 pending 校验。
- [ ] 在 schema 中加入 `processing` 和 `processingStartedAt`；控制器用 `findOneAndUpdate` 抢占会话。
- [ ] 调整异常处理，使处理中的会话变为 failed，并保留明确错误消息。
- [ ] 运行微信绑定测试及后端完整 Jest 测试。

### Task 3：收益回填测试确定性

**文件：**
- 修改：`apps/backend/tests/dailyProfitBackfill.test.js`

**接口：**
- 测试直接 mock `historicalQuoteCache.getQuotesForRange(symbols, startDate, endDate)` 并返回固定 `Map`。
- 每次测试清理 `HistoricalQuote` 与 `DailyProfit`，冻结 `Date.now()`。

- [ ] 为测试增加行情缓存模块 mock、固定时间和缺失集合清理。
- [ ] 运行 `dailyProfitBackfill.test.js` 与覆盖率模式，确认不再从共享缓存或外部行情读取。
- [ ] 运行后端完整测试和覆盖率测试。

### Task 4：小程序环境配置与二维码参数容错

**文件：**
- 新建：`apps/miniapp/config/env.js`
- 修改：`apps/miniapp/pages/wechat-bind/index.js`
- 新建：`apps/miniapp/tests/wechat-bind-runtime.test.js`
- 修改：`apps/miniapp/README.md`

**接口：**
- `config/env.js` 固定导出生产 API `API_BASE_URL`；本地开发不再维护独立小程序测试环境。
- `safeDecodeURIComponent(value)` 对非法 percent 编码返回空字符串，不能从 `onLoad` 抛出异常。
- 合法 `scene=login_<token>` 仍调用 `confirmLogin(token)`；缺失或非法 scene 仍转入 `checkCurrentBinding()`。

- [ ] 使用 VM 编写页面运行时测试：非法 `%` scene 不抛错、合法 login scene 触发确认、缺失参数走绑定状态检查。
- [ ] 运行测试，确认当前实现对 `%` 抛 `URIError` 且源码内硬编码测试域名。
- [ ] 创建环境配置模块，在页面中替换硬编码域名，并实现安全解码。
- [ ] 更新 README，说明环境变量、测试/正式域名及发布前检查项。
- [ ] 运行全部小程序 node:test 测试。

### Task 5：网页端微信登录轮询可靠性

**文件：**
- 新建：`apps/frontend/src/pages/login/wechatLoginPolling.js`
- 修改：`apps/frontend/src/pages/login/login.vue`
- 新建：`apps/frontend/src/pages/login/wechatLoginPolling.test.js`

**接口：**
- `createWechatLoginPoller({ getStatus, onConfirmed, onTerminal, onNetworkError, intervalMs, setIntervalFn, clearIntervalFn })` 返回 `{ start(token), stop() }`。
- `confirmed` 调用 `onConfirmed` 后停止；`expired` 和 `failed` 调用 `onTerminal` 后停止；请求异常调用 `onNetworkError` 后停止。
- 组件关闭弹窗、重新生成二维码和卸载时均调用 `stop()`。

- [ ] 编写 fake timer 单元测试，覆盖 confirmed、expired、failed、网络错误与 stop 取消定时器。
- [ ] 运行测试，确认轮询模块不存在而失败。
- [ ] 实现无 UI 依赖的轮询模块；在页面中捕获创建二维码失败，接入轮询回调并通过 `onBeforeUnmount` 释放资源。
- [ ] 对关闭微信登录弹窗的事件接入 stop，终态显示可重新生成二维码的中文提示。
- [ ] 运行前端单测、H5 构建和相关页面测试。

### Task 6：综合验证与审计边界记录

**文件：**
- 修改：`README.md`（仅当现有测试章节适合记录命令时）

- [ ] 运行后端 `npm test`、`npm test -- --coverage`、`npm run lint`。
- [ ] 运行前端 `npm test`、`npm run build:h5`。
- [ ] 运行小程序 `node --test tests/*.test.js`。
- [ ] 运行 `git diff --check`，仅处理本轮引入的空白问题，不能修改用户预先存在的问题。
- [ ] 重新执行生产依赖审计并记录剩余漏洞；将依赖升级作为后续独立兼容性任务，而非隐式升级。
