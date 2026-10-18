# 股票指标统一与账户重置实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清空既有用户业务数据，并以按币种账本、统一估值和资金流调整收益率重建股票复盘系统的指标体系。

**Architecture:** 原始转账锁定 CNY 换算值，资产保存按币种现金余额；集中估值模块负责当前资产与行情质量。每日快照由同一个估值结果和 Modified Dietz 收益公式生成，首页、日历和曲线分别读取该统一来源。当前仓位保留加权平均成本为主口径，并把摊薄成本独立作为可选展示；已清仓仓位按完整持仓周期返回。

**Tech Stack:** Node.js 20、Express 5、Mongoose 8、Jest 30、MongoDB、Vue 3 / uni-app。

**Spec:** `docs/superpowers/specs/2026-09-19-stock-metrics-reset-design.md`

## Global Constraints

- 用户业务日期一律按北京时间（UTC+08:00）计算。
- 不迁移历史用户业务数据；重置后交易、复盘、转账、资产和收益派生数据均为空。
- 仅保留用户身份、登录与微信绑定信息；手续费偏好恢复默认值。
- 转账和交易的历史 CNY 换算信息创建后不可因当前汇率变化而改变。
- 不可用持仓成本作为缺失行情估值价格。
- 首页、日历、日快照和收益曲线必须使用同一日收益口径。
- 摊薄成本法只能是当前持仓的可选展示指标，不能驱动资产账本、日收益或历史已清仓收益。
- 每一步先写失败测试，实施最小代码后运行对应测试与现有回归测试。

---

### Task 1: 建立统一日期、币种和外部资金流基础工具

**Files:**
- Modify: `apps/backend/src/utils/datetime.js`
- Create: `apps/backend/src/utils/marketCurrency.js`
- Create: `apps/backend/src/utils/money.js`
- Test: `apps/backend/tests/datetime.test.js`
- Test: `apps/backend/tests/money.test.js`

**Interfaces:**
- Produces `getDateStringInOffset(offsetMinutes, date)`, `getDayRangeInOffset(offsetMinutes, date)`, `getPreviousDateStringInOffset(offsetMinutes, date)`.
- Produces `getCurrencyForMarket({ symbol, market }) => 'CNY' | 'HKD' | 'USD'`.
- Produces `toMoney(value)`, `toCNY(amount, rate)`, `normalizeCashBalances(input)`, `sumCashBalancesCNY(balances, rates)`.
- All later tasks must use `BEIJING_OFFSET_MINUTES = 480` exported from `datetime.js`, rather than direct `toISOString().slice(0, 10)` date derivation.

- [ ] **Step 1: Write failing timezone and currency tests**

```js
import {
  BEIJING_OFFSET_MINUTES,
  getDateStringInOffset,
  getPreviousDateStringInOffset
} from '../src/utils/datetime';
import { getCurrencyForMarket } from '../src/utils/marketCurrency';

test('北京时间凌晨仍返回北京时间业务日', () => {
  expect(getDateStringInOffset(BEIJING_OFFSET_MINUTES, new Date('2026-09-19T16:30:00.000Z')))
    .toBe('2026-09-20');
  expect(getPreviousDateStringInOffset(BEIJING_OFFSET_MINUTES, new Date('2026-09-19T16:30:00.000Z')))
    .toBe('2026-09-19');
});

test.each([
  [{ symbol: '600519.SH' }, 'CNY'],
  [{ symbol: '00700.HK' }, 'HKD'],
  [{ symbol: 'AAPL.US' }, 'USD']
])('按市场推导唯一币种', (input, expected) => {
  expect(getCurrencyForMarket(input)).toBe(expected);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- datetime.test.js money.test.js --runInBand` in `apps/backend`.

Expected: FAIL，因为导出常量、币种工具和金额工具尚不存在。

- [ ] **Step 3: Implement minimal utility modules**

```js
const BEIJING_OFFSET_MINUTES = 480;
const getPreviousDateStringInOffset = (offsetMinutes, baseDate) => {
  const { start } = getDayRangeInOffset(offsetMinutes, baseDate);
  return getDateStringInOffset(offsetMinutes, new Date(start.getTime() - 1));
};
```

`marketCurrency.js` 以标准化代码和交易所映射 CNY/HKD/USD；`money.js` 对输入做有限数字校验，并统一使用 `round2` 输出 CNY 金额。

- [ ] **Step 4: Run focused tests and backend suite**

Run: `npm test -- datetime.test.js money.test.js --runInBand`, then `npm test -- --runInBand`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/datetime.js apps/backend/src/utils/marketCurrency.js apps/backend/src/utils/money.js apps/backend/tests/datetime.test.js apps/backend/tests/money.test.js
git commit -m "feat: 统一业务日期与币种金额工具"
```

### Task 2: 扩展账本模型，持久化锁定汇率和按币种现金余额

**Files:**
- Modify: `apps/backend/src/models/Transfer.js`
- Modify: `apps/backend/src/models/Trade.js`
- Modify: `apps/backend/src/models/Asset.js`
- Modify: `apps/backend/src/utils/ledger.js`
- Test: `apps/backend/tests/ledger.test.js`

**Interfaces:**
- `Transfer` 新字段：`fxRateToCNY: Number`、`amountCNY: Number`。
- `Trade` 新字段：`fxRateToCNY: Number`、`grossAmount: Number`、`netSettlementAmount: Number`。
- `Asset` 新字段：`cashBalances: Map<String, Number>`，保留 `cash` 为当前 CNY 估值。
- `buildLedger({ transfers, trades })` 返回：

```js
{
  cashBalances: { CNY: 0, HKD: 0, USD: 0 },
  principalCNY: 0,
  transferFlowsByDate: Map<string, Array<{ amountCNY, occurredAt }>>
}
```

- [ ] **Step 1: Write failing ledger tests**

```js
test('账本保持原始币种现金，并使用转账锁定 CNY 本金', () => {
  const ledger = buildLedger({
    transfers: [{ type: 'IN', amount: 100, currency: 'USD', amountCNY: 720, date }],
    trades: [{ type: 'BUY', currency: 'USD', grossAmount: 30, commission: 1, date }]
  });
  expect(ledger.cashBalances).toEqual({ CNY: 0, HKD: 0, USD: 69 });
  expect(ledger.principalCNY).toBe(720);
});

test('账本不读取当前汇率重估既有转账', () => {
  expect(buildLedger({ transfers: [{ type: 'IN', amountCNY: 700, amount: 100, currency: 'USD' }], trades: [] }).principalCNY)
    .toBe(700);
});
```

- [ ] **Step 2: Run ledger test and verify failure**

Run: `npm test -- ledger.test.js --runInBand`.

Expected: FAIL，因为当前账本只输出 CNY `cashCNY` 且依赖当前汇率。

- [ ] **Step 3: Add model fields and replace ledger implementation**

`buildLedger` 只能使用已持久化的 `amountCNY`，交易仅改变 `cashBalances[currency]`。对尚未写入锁定字段的异常对象应抛出明确错误；重置后不支持旧流水兼容。

保留 `calculateCashAndPrincipalCNY` 作为过渡包装器：它调用 `buildLedger` 和 `sumCashBalancesCNY`，但不得被新业务路径使用。

- [ ] **Step 4: Run focused and existing transfer/trade tests**

Run: `npm test -- ledger.test.js transfer.test.js trade.test.js --runInBand`.

Expected: 所有测试通过；更新旧测试工厂，使其为新建流水提供锁定汇率字段。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/Transfer.js apps/backend/src/models/Trade.js apps/backend/src/models/Asset.js apps/backend/src/utils/ledger.js apps/backend/tests/ledger.test.js apps/backend/tests/transfer.test.js apps/backend/tests/trade.test.js
git commit -m "feat: 按币种账本与锁定汇率流水"
```

### Task 3: 实现唯一资产估值引擎与行情质量标记

**Files:**
- Create: `apps/backend/src/utils/portfolioValuation.js`
- Modify: `apps/backend/src/utils/assetSnapshot.js`
- Modify: `apps/backend/src/utils/marketData.js`
- Test: `apps/backend/tests/portfolioValuation.test.js`

**Interfaces:**
- `valuatePortfolio({ cashBalances, holdings, quotes, rates, fallbackPrices })` 返回：

```js
{
  cashByCurrency,
  cashCNY,
  holdingsMarketValueCNY,
  totalAssetsCNY,
  valuations,
  quality
}
```

- `valuations` 每项包含 `symbol`、`price`、`priceDate`、`source: 'realtime' | 'close' | 'last-close' | 'missing'`、`isStale`。
- `refreshAssetMarketValue(userId)` 必须从账本重建现金余额，并调用 `valuatePortfolio`；写入 `Asset.cashBalances`、`cash`、`holdingsMarketValue`、`totalAssets` 与 `valuationQuality`。

- [ ] **Step 1: Write failing valuation tests**

```js
test('使用最近有效收盘价而不是持仓成本作为行情缺失回退', () => {
  const result = valuatePortfolio({
    cashBalances: { CNY: 0 },
    holdings: [{ symbol: '600519.SH', quantity: 10, currency: 'CNY', avgCost: 100 }],
    quotes: {},
    fallbackPrices: { '600519.SH': { price: 120, date: '2026-09-18' } },
    rates: { CNY: 1 }
  });
  expect(result.holdingsMarketValueCNY).toBe(1200);
  expect(result.quality).toBe('stale');
});

test('无任何行情时标记 partial，而不以成本估值', () => {
  const result = valuatePortfolio({ cashBalances: { CNY: 0 }, holdings, quotes: {}, fallbackPrices: {}, rates });
  expect(result.valuations[0].price).toBeNull();
  expect(result.quality).toBe('partial');
});
```

- [ ] **Step 2: Run focused test to verify failure**

Run: `npm test -- portfolioValuation.test.js --runInBand`.

Expected: FAIL，因为模块尚不存在。

- [ ] **Step 3: Implement valuation engine and integrate asset refresh**

读取 `Holding.lastPrice` 仅作为“最近有效收盘价”缓存，增加 `lastPriceDate` 字段；不得读取 `avgCost` 作为估值回退。汇率用于现金与持仓市值的当前折算；缺失汇率应使对应项目 `partial`。

- [ ] **Step 4: Run focused tests and asset-facing tests**

Run: `npm test -- portfolioValuation.test.js dailyProfitBackfill.test.js trade.test.js --runInBand`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/portfolioValuation.js apps/backend/src/utils/assetSnapshot.js apps/backend/src/utils/marketData.js apps/backend/src/models/Trade.js apps/backend/tests/portfolioValuation.test.js
git commit -m "feat: 统一投资组合估值与行情质量标记"
```

### Task 4: 重建交易和转账写入路径，强制市场币种与锁定汇率

**Files:**
- Modify: `apps/backend/src/controllers/transferController.js`
- Modify: `apps/backend/src/controllers/tradeController.js`
- Modify: `apps/backend/src/services/dirtyDataManager.js`
- Test: `apps/backend/tests/transfer.test.js`
- Test: `apps/backend/tests/trade.test.js`

**Interfaces:**
- 新建转账时由服务器获取当前汇率，写入 `fxRateToCNY` 和 `amountCNY`；不得先直接增减旧 `Asset.cash` 后再保存流水。
- 新建/编辑交易时以 `getCurrencyForMarket` 取得唯一币种；请求提供不一致币种时返回 HTTP 400。
- 交易创建后调用 `rebuildPortfolioFromLedger(userId)` 和 `scheduleRecalc(userId, getDateStringInOffset(480, trade.date))`。
- 转账创建后调用同一重建与重算流程，重算起点用北京时间归属日。

- [ ] **Step 1: Add failing endpoint tests**

```js
test('外币转账保存锁定汇率并以账本重建当前资产', async () => {
  mockRates({ CNY: 1, USD: 7.2, HKD: 0.92 });
  const res = await request(app).post('/api/transfers').send({ type: 'IN', amount: 100, currency: 'USD', date: '2026-09-19 09:00:00' });
  expect(res.body.amountCNY).toBe(720);
  expect((await Asset.findOne({ userId })).cashBalances.USD).toBe(100);
});

test('拒绝港股使用 USD 交易币种', async () => {
  const res = await request(app).post('/api/trades').send({ symbol: '00700.HK', currency: 'USD', type: 'BUY', price: 100, quantity: 1, date: '2026-09-19 09:00:00' });
  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run endpoint tests and verify failure**

Run: `npm test -- transfer.test.js trade.test.js --runInBand`.

Expected: 新断言失败，因为当前控制器直接使用 CNY 资产字段且允许请求币种。

- [ ] **Step 3: Implement write-path changes**

先保存带锁定字段的流水，再重建账本和资产。编辑既有流水时，仅允许通过重建重新生成派生资产；锁定汇率按编辑时重新确定并保存。删除操作按北京时间日期标记脏数据。

- [ ] **Step 4: Run focused suites**

Run: `npm test -- transfer.test.js trade.test.js dailyProfitBackfill.test.js --runInBand`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/controllers/transferController.js apps/backend/src/controllers/tradeController.js apps/backend/src/services/dirtyDataManager.js apps/backend/tests/transfer.test.js apps/backend/tests/trade.test.js
git commit -m "feat: 统一交易转账账本写入"
```

### Task 5: 实现日快照、Modified Dietz 日收益和统一日盈亏

**Files:**
- Create: `apps/backend/src/utils/dailyPerformance.js`
- Modify: `apps/backend/src/utils/dailyProfitBackfill.js`
- Modify: `apps/backend/src/utils/dailyProfit.js`
- Modify: `apps/backend/src/models/DailyProfit.js`
- Modify: `apps/backend/src/models/DailyRevenue.js`
- Test: `apps/backend/tests/dailyPerformance.test.js`
- Test: `apps/backend/tests/dailyProfitBackfill.test.js`

**Interfaces:**
- `calculateModifiedDietzReturn({ openingAssetsCNY, closingAssetsCNY, flows, dayStart, dayEnd })` 返回 `{ dailyProfitAmount, dailyReturn, weightedFlowCNY }`。
- `createOrUpdateDailySnapshot({ userId, date, valuation, ledger, previousSnapshot })` 同时更新 `DailyProfit` 和 `DailyRevenue`。
- `DailyProfit` 新增：`weightedFlowCNY`、`valuationQuality`。
- `DailyRevenue` 新增：`weightedFlowCNY`、`valuationQuality`。
- `calculateTotalDailyProfitCNY` 改为读取当天统一快照或调用 `createOrUpdateDailySnapshot`，不再逐标的独立计算。

- [ ] **Step 1: Write failing Modified Dietz tests**

```js
test('早盘入金按剩余交易日权重参与日收益分母', () => {
  const result = calculateModifiedDietzReturn({
    openingAssetsCNY: 10000,
    closingAssetsCNY: 20100,
    flows: [{ amountCNY: 10000, occurredAt: new Date('2026-09-19T01:00:00.000Z') }],
    dayStart: new Date('2026-09-18T16:00:00.000Z'),
    dayEnd: new Date('2026-09-19T16:00:00.000Z')
  });
  expect(result.dailyProfitAmount).toBe(100);
  expect(result.dailyReturn).toBeCloseTo(0.005, 4);
});

test('统一快照使首页日盈亏和 DailyProfit 金额相同', async () => {
  const snapshot = await createOrUpdateDailySnapshot(input);
  expect(await calculateTotalDailyProfitCNY(userId)).toBe(snapshot.dailyProfitAmount);
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- dailyPerformance.test.js dailyProfitBackfill.test.js --runInBand`.

Expected: FAIL，因为 Modified Dietz 工具和统一快照接口不存在。

- [ ] **Step 3: Implement daily performance pipeline**

`backfillDailyProfit` 必须调用统一的日快照函数。历史窗口内使用每日期末行情和已锁定现金流计算；任何行情缺失必须把 `valuationQuality` 写为 `partial` 或 `stale`。每个日期循环结束仅保存由该日期数据导出的快照，禁止混用当前实时资产。

- [ ] **Step 4: Run focused suites**

Run: `npm test -- dailyPerformance.test.js dailyProfitBackfill.test.js transfer.test.js trade.test.js --runInBand`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/dailyPerformance.js apps/backend/src/utils/dailyProfitBackfill.js apps/backend/src/utils/dailyProfit.js apps/backend/src/models/DailyProfit.js apps/backend/src/models/DailyRevenue.js apps/backend/tests/dailyPerformance.test.js apps/backend/tests/dailyProfitBackfill.test.js
git commit -m "feat: 统一日收益快照与资金流调整收益率"
```

### Task 6: 统一资产汇总、收益日历和收益曲线接口

**Files:**
- Modify: `apps/backend/src/controllers/assetController.js`
- Modify: `apps/backend/src/routes/assetRoutes.js`
- Modify: `apps/frontend/src/stores/trade.js`
- Modify: `apps/frontend/src/components/ProfitChart.vue`
- Modify: `apps/frontend/src/components/ProfitCalendar.vue`
- Test: `apps/backend/tests/assetMetrics.test.js`

**Interfaces:**
- `GET /api/assets/summary` 返回 `valuationQuality`、`cashByCurrency`、统一快照 `totalDailyProfit`。
- `GET /api/assets/profit-calendar` 的金额、收益率和质量字段来自 `DailyRevenue`。
- `GET /api/assets/profit-curve` 返回根据 `DailyProfit.dailyReturn` 复利的 `value`，并对所选范围以 0 为起点归一化。
- 前端不再从持仓数组自行降级计算总资产、总盈亏、今日盈亏；仅消费后端汇总。

- [ ] **Step 1: Write failing API consistency tests**

```js
test('区间中入金不产生收益曲线跳涨', async () => {
  await seedSnapshots([
    { date: '2026-09-18', dailyReturn: 0, totalAssets: 10000 },
    { date: '2026-09-19', dailyReturn: 0, totalAssets: 20000 }
  ]);
  const res = await request(app).get('/api/assets/profit-curve?startDate=2026-09-18&endDate=2026-09-19');
  expect(res.body.data.map(point => point.value)).toEqual([0, 0]);
});

test('首页今日盈亏与当天收益日历金额一致', async () => {
  const [summary, calendar] = await Promise.all([getSummary(), getCalendar()]);
  expect(summary.body.totalDailyProfit).toBe(calendar.body.dailyProfits['2026-09-19']);
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- assetMetrics.test.js --runInBand`.

Expected: FAIL，因为曲线当前直接比较总资产，汇总页另算实时持仓日盈亏。

- [ ] **Step 3: Implement endpoint and frontend integration**

曲线以 `dailyReturn / 100` 从区间首日前一天可用快照开始复利；没有前置快照时，范围首日为 0。所有日期边界使用北京时间工具。前端增加 `valuationQuality` 的明确提示，避免将不完整估值当作精确金额。

- [ ] **Step 4: Run backend and frontend tests**

Run: `npm test -- assetMetrics.test.js --runInBand` in `apps/backend`; then `npm test -- --runInBand` in `apps/frontend`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/controllers/assetController.js apps/backend/src/routes/assetRoutes.js apps/backend/tests/assetMetrics.test.js apps/frontend/src/stores/trade.js apps/frontend/src/components/ProfitChart.vue apps/frontend/src/components/ProfitCalendar.vue
git commit -m "feat: 统一资产汇总日历与收益曲线口径"
```

### Task 7: 重构持仓成本与已清仓周期，保留摊薄成本可选指标

**Files:**
- Modify: `apps/backend/src/utils/cost.js`
- Modify: `apps/backend/src/controllers/tradeController.js`
- Modify: `apps/frontend/src/components/HoldingDetailModal.vue`
- Modify: `apps/frontend/src/components/HistoryHoldingsModal.vue`
- Test: `apps/backend/tests/cost.test.js`
- Test: `apps/backend/tests/trade.test.js`

**Interfaces:**
- `calculateWeightedAveragePerformance({ trades })` 返回当前仓位成本、标准已实现盈亏和未实现盈亏基础数据。
- `calculateClosedPositionCycles({ trades })` 返回 `Array<{ cycleId, symbol, openedAt, closedAt, buyCost, sellProceeds, realizedProfit, profitRate, currency, tradesCount }>`。
- `calculateDilutedPerformance({ trades, rates })` 保留但只输出当前持仓的 `dilutedAvgCost` 和 `dilutedUnrealizedProfit`。
- 当前持仓接口返回 `avgCost`、`unrealizedProfit`、`dilutedAvgCost`、`dilutedUnrealizedProfit`。
- 历史持仓接口每个 `cycleId` 一条记录。

- [ ] **Step 1: Write failing cost-cycle tests**

```js
test('同一标的两轮清仓生成两条独立周期及独立收益率', () => {
  const cycles = calculateClosedPositionCycles({ trades: [buy(100, 100), sell(100, 110), buy(10, 100), sell(10, 110)] });
  expect(cycles).toHaveLength(2);
  expect(cycles.map(x => x.profitRate)).toEqual([0.1, 0.1]);
});

test('摊薄成本只作为当前仓位附加指标，不改变标准已实现盈亏', () => {
  const standard = calculateWeightedAveragePerformance({ trades });
  const diluted = calculateDilutedPerformance({ trades, rates });
  expect(standard.realizedProfit).not.toBeUndefined();
  expect(diluted.get('600519.SH').dilutedAvgCost).not.toBeUndefined();
});
```

- [ ] **Step 2: Run focused tests to verify failure**

Run: `npm test -- cost.test.js trade.test.js --runInBand`.

Expected: FAIL，因为当前历史接口按 symbol 聚合并用最后一轮成本作为累计收益率分母。

- [ ] **Step 3: Implement separate cost algorithms and API response changes**

不要在加权平均算法中重置跨周期数据；周期函数按时间与 `_id` 排序，数量由零转正开始、归零结束。异常超卖必须在写入时拒绝，周期统计不再静默钳位后继续产生指标。

前端为“摊薄成本”增加可选说明和单独字段，默认显示加权平均成本。

- [ ] **Step 4: Run focused suites**

Run: `npm test -- cost.test.js trade.test.js --runInBand`.

Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/utils/cost.js apps/backend/src/controllers/tradeController.js apps/backend/tests/cost.test.js apps/backend/tests/trade.test.js apps/frontend/src/components/HoldingDetailModal.vue apps/frontend/src/components/HistoryHoldingsModal.vue
git commit -m "feat: 分离标准成本与摊薄成本历史周期"
```

### Task 8: 实现安全的用户业务数据重置脚本与运维说明

**Files:**
- Create: `apps/backend/scripts/reset-user-business-data.js`
- Modify: `apps/backend/package.json`
- Modify: `README.md`
- Modify: `docs/apidoc.md`
- Test: `apps/backend/tests/resetUserBusinessData.test.js`

**Interfaces:**
- 命令：`npm run reset:user-business-data -- --userId <id> --confirm`。
- 全用户命令：`npm run reset:all-business-data -- --confirm-all-users`。
- 未提供明确确认参数时脚本退出码非零且不执行删除。
- 输出 JSON：每个集合删除数量、重置用户数量和执行时间。

- [ ] **Step 1: Write failing reset-script tests**

```js
test('缺少确认参数时不删除任何业务数据', async () => {
  await expect(runReset({ userId })).rejects.toThrow('--confirm');
  expect(await Trade.countDocuments({ userId })).toBe(1);
});

test('重置删除业务集合但保留用户身份与微信绑定', async () => {
  const result = await runReset({ userId, confirm: true });
  expect(result.deleted.Trade).toBe(1);
  expect(await User.findById(userId)).toMatchObject({ wechatOpenId: 'openid' });
  expect(await Asset.findOne({ userId })).toBeNull();
});
```

- [ ] **Step 2: Run focused test to verify failure**

Run: `npm test -- resetUserBusinessData.test.js --runInBand`.

Expected: FAIL，因为脚本与可测试导出尚不存在。

- [ ] **Step 3: Implement reset script**

脚本核心函数接收注入的模型和确认参数；CLI 层负责解析参数、连接 MongoDB、调用核心函数并关闭连接。先列出目标用户，再在 MongoDB session/transaction 可用时事务删除；不支持事务的部署环境使用固定顺序删除并返回准确状态。

- [ ] **Step 4: Run focused tests and document dry-run procedure**

Run: `npm test -- resetUserBusinessData.test.js --runInBand`.

Expected: 所有测试通过。README 与 API 文档必须注明该命令不可恢复、先备份数据库、必须使用确认参数。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/scripts/reset-user-business-data.js apps/backend/package.json apps/backend/tests/resetUserBusinessData.test.js README.md docs/apidoc.md
git commit -m "feat: 添加用户业务数据安全重置工具"
```

### Task 9: 全链路回归、迁移后基线与部署核验

**Files:**
- Modify: `apps/backend/tests/setup.js`
- Modify: `apps/backend/tests/globalSetup.js`
- Create: `apps/backend/tests/metricsEndToEnd.test.js`
- Modify: `docs/apidoc.md`
- Modify: `apps/backend/DEPLOY.md`

**Interfaces:**
- 端到端测试创建空账户、入金、交易、转账、估值、日快照、曲线和清仓周期。
- 测试工厂创建的所有新转账和交易必须带有锁定汇率字段。

- [ ] **Step 1: Write end-to-end failing test**

```js
test('空账户从入金到清仓的全部指标同口径', async () => {
  await addTransfer({ type: 'IN', amount: 10000, currency: 'CNY', date: '2026-09-19 09:00:00' });
  await addTrade({ symbol: '600519.SH', type: 'BUY', price: 100, quantity: 100, date: '2026-09-19 10:00:00' });
  await addTrade({ symbol: '600519.SH', type: 'SELL', price: 110, quantity: 100, date: '2026-09-20 10:00:00' });
  const [summary, calendar, curve, history] = await fetchMetrics();
  expect(summary.totalDailyProfit).toBe(calendar.dailyProfits['2026-09-20']);
  expect(curve.data.at(-1).value).toBeCloseTo(10, 4);
  expect(history.list).toHaveLength(1);
  expect(history.list[0].profitRate).toBeCloseTo(0.1, 4);
});
```

- [ ] **Step 2: Run end-to-end test to verify failure or identify remaining incompatibilities**

Run: `npm test -- metricsEndToEnd.test.js --runInBand`.

Expected: 初次执行可能暴露遗留接口字段或测试工厂缺口；逐一按根因修复，不绕过断言。

- [ ] **Step 3: Fix remaining integration incompatibilities only**

任何修复必须保持前述不变量：锁定流水汇率、按币种现金、统一估值、统一快照、北京时间日期、周期化历史持仓。不得为保留旧数据添加回退分支。

- [ ] **Step 4: Run complete verification**

Run:

```bash
cd apps/backend && npm test -- --runInBand && npm run lint
cd ../frontend && npm test -- --runInBand && npm run build:h5
```

Expected: 所有测试、lint 和前端构建通过。

- [ ] **Step 5: Commit**

```bash
git add apps/backend/tests apps/backend/DEPLOY.md docs/apidoc.md
git commit -m "test: 覆盖统一指标全链路回归"
```

## Plan Self-Review

- 规格覆盖：数据重置（Task 8）、锁定汇率和多币种账本（Tasks 2、4）、唯一估值及缺失行情（Task 3）、日收益/资金流/一致性（Tasks 5、6）、成本及完整周期（Task 7）、北京时间边界（Task 1）、端到端验证（Task 9）。
- 占位符扫描：没有遗留未决实现标记。
- 接口一致性：Task 1 提供日期、币种、金额工具；Task 2 提供账本；Task 3 消费账本输出；Task 5 消费估值和账本；Task 6 消费日快照；Task 7 独立于资产估值；Task 8 清空所有输入与派生数据；Task 9 验证所有公开接口。

