# A 股大盘数据风控与历史交易快照方案

## 一、问题评估

### 1. 风控风险（高）

当前 `GET /market/overview` 每次调用都要向东方财富并发请求 **55~60 页** 全市场数据（每页 100 只，共约 5500+ 只 A 股）。

- **每天首次添加交易**、大盘页面首次加载、以及轮询（当前 60 秒一次）都会触发。
- 东方财富对同一 IP 的短时高并发请求通常有限流策略，60 次/秒级别的并发**有较高概率触发风控**，表现为返回空数据、请求被拒绝，甚至短期封 IP。
- 多用户同时使用时，风险还会放大。

### 2. 历史交易大盘快照错误（高）

当前 `TradeModal.vue` 在添加交易时，不管 `date` 是哪一天，都调用 `store.fetchMarketOverview()` 获取**当前实时大盘**：

```js
watch(() => [formState.market, formState.date], ([newMarket, newDate]) => {
  if (newDate) {
    store.fetchMarketOverview();  // 始终取今天数据
  }
}, { immediate: true });
```

- 添加 **过去某天** 的交易时，前端提交的是**今天**的 `marketOverview`。
- 后端 `addTrade` 又优先使用前端传入的快照，导致历史交易记录里保存了错误日期的大盘数据。
- 即使前端不传，后端自动补抓的历史日线也只能拿到指数点位，**拿不到历史全市成交量、涨跌分布、涨跌停数**。

### 3. 盘中 vs 收盘数据

- **今天/实时交易**：可以拿到盘中实时数据（东方财富实时接口）。
- **补录历史交易**：
  - 指数点位可以通过腾讯/搜狐历史日线拿到**收盘数据**。
  - 全市成交量、涨跌分布、涨跌停数**无法从第三方历史接口回抓**。
  - 只有当交易发生当天，系统已经通过定时任务把 `MarketDailySnapshot` 保存下来了，才能拿到历史全市指标。
  - 因此补录历史交易时，大盘快照最多只能是**当天收盘后**的数据，不可能是盘中交易时的精确数据。

---

## 二、推荐方案

### 目标

1. 降低东方财富风控风险，提升大盘接口响应速度。
2. 修复历史交易保存错误大盘数据的问题。
3. 明确盘中实时 vs 历史收盘的数据边界。

### 2.1 服务端缓存 + 定时任务（解决风控/性能）

#### 实时大盘缓存

在 `GET /market/overview` 增加一层服务端缓存，例如：

- 缓存 key：`market:overview:{YYYYMMDD}`
- 缓存有效期：**3~5 分钟**
- 缓存命中时直接返回，不再请求东方财富。
- 缓存未命中时，再并发拉取 60 页数据，汇总后写入缓存并返回。

效果：
- 大部分请求毫秒级返回。
- 每分钟最多触发 1 次东方财富 60 页请求，风控风险大幅降低。
- 即使轮询每 60 秒一次，实际也只会命中缓存。

> 如果没有 Redis，可以先用内存缓存（进程内 Map），但多实例部署时不共享。也可用 MongoDB 加一个 `MarketCache` 集合作为兜底。

#### 收盘后定时任务

每天 A 股收盘后（如 16:10）运行一次定时任务：

- 调用东方财富全市场接口，保存/更新当天 `MarketDailySnapshot`。
- 保证即使盘中缓存失效，也有完整的收盘数据可用于历史查询和量比计算。

已有 `MarketDailySnapshot` 模型，只需要加一个调度脚本或复用 `ENABLE_PROFIT_HISTORY_SCHEDULER` 机制即可。

### 2.2 区分实时大盘与历史大盘接口

让 `GET /market/overview` 支持 `date` 参数：

```http
GET /api/market/overview?date=2026-06-27
```

- **不传 date 或 date=今天**：返回实时大盘（走缓存或实时抓取）。
- **传历史 date**：返回该日收盘大盘快照：
  - 指数点位：从腾讯/搜狐历史日线获取。
  - 全市成交量/涨跌分布/涨跌停：从 `MarketDailySnapshot` 读取，缺失返回 `null`。

### 2.3 前端按交易日期调用不同大盘接口

修改 [`TradeModal.vue`](Stock%20Review/uni-preset-vue-vite/uni-preset-vue-vite/src/components/TradeModal.vue)：

```js
watch(() => [formState.market, formState.date], ([newMarket, newDate]) => {
  if (!newDate) return;
  const dateStr = dayjs(newDate).format('YYYY-MM-DD');
  const todayStr = dayjs().format('YYYY-MM-DD');
  if (dateStr === todayStr) {
    store.fetchMarketOverview();          // 今天：实时大盘
  } else if (formState.market === 'CN') {
    store.fetchMarketOverview({ date: dateStr });  // 历史 A 股：按日期大盘
  } else {
    // 港股/美股历史大盘：当前第三方历史源支持有限，可暂由后端补抓指数点位
    store.fetchMarketOverview();
  }
}, { immediate: true });
```

效果：
- 添加今天交易：拿到盘中实时全市数据，保存正确。
- 添加历史 A 股交易：拿到历史收盘指数 + 已保存的全市指标，保存正确。
- 如果历史日期的全市指标未保存，前端显示 `--`，不会用今天数据顶替。

### 2.4 历史自动补抓快照不再包含全市指标

已经修改：后端自动补抓的历史日线快照中，`volume`、`volumeChangeRatio`、`upCount`、`downCount`、`flatCount`、`limitUpCount`、`limitDownCount` 统一返回 `null`，避免用指数成交量冒充全市成交量。

---

## 三、实施优先级

| 优先级 | 事项 | 改动文件 | 效果 |
|--------|------|----------|------|
| P0 | 服务端缓存 `GET /market/overview` | `marketController.js`, `marketData.js` | 降风控、提速度 |
| P0 | 前端按日期调大盘接口 | `TradeModal.vue`, `trade.js`, `api/index.js` | 修复历史交易快照错误 |
| P1 | 后端 `GET /market/overview` 支持 `date` 参数 | `marketController.js`, `marketData.js` | 提供历史大盘数据 |
| P1 | 收盘后定时保存 `MarketDailySnapshot` | 新增脚本或复用 scheduler | 让历史查询有数据 |
| P2 | 更新接口文档 | `docs/apidoc.md` | 明确口径 |

---

## 四、风险与兜底

- **风控兜底**：如果东方财富限流，缓存失效后首次请求可能返回空或变慢。可以设置：缓存未命中时若请求失败，继续沿用旧缓存 15 分钟，避免雪崩。
- **历史数据缺失**：今天的全市指标从今天开始保存；之前的日期无法补全，文档中说明为 `--`。
- **港股/美股历史**：当前没有稳定的全市场历史源，仍只保存指数点位，全市指标返回 `null`。

---

## 五、建议下一步

按 P0 先做：
1. 给 `GET /market/overview` 加 3 分钟服务端缓存。
2. 前端按交易日期区分实时/历史接口调用。

这两项改动完成后，风控和历史数据错误问题即可基本解决。需要我现在开始实现吗？
