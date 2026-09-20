# API 接口文档

本文档汇总了当前系统对前端开放的所有 HTTP 接口。

**基础信息**

- **基础路径 (Base URL)**: `/api`
- **认证方式**: Bearer Token (Authorization: Bearer <token>)
- **数据格式**: JSON

***

## 环境配置

### 支持的环境

| 环境 | 说明 | 启动命令 | 数据库 |
|------|------|----------|--------|
| `development` | 本地开发 / 测试 | `npm run dev` | 本地 MongoDB 或阿里云测试数据库 |
| `production` | 生产环境 | `npm run start:prod` | 阿里云 MongoDB |

### 环境变量配置

后端通过 `.env.{环境}` 文件加载配置：

| 文件 | 用途 |
|------|------|
| `.env.development` | 开发/测试环境配置（连接测试数据库） |
| `.env.production` | 生产环境配置（连接生产数据库） |

**关键环境变量：**

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `MONGODB_URI` | MongoDB 连接字符串 | `mongodb://root:password@host:27017` |
| `PORT` | 服务端口 | `3000` |
| `JWT_SECRET` | JWT 签名密钥 | `your-secret-key` |
| `ENABLE_PROFIT_HISTORY_SCHEDULER` | 是否启用进程内定时快照 | `true` / `false` |
| `TRADE_MOODS` | 自定义交易情绪枚举（可选）；系统会强制保证 `NEUTRAL`、`EXCITED`、`FEAR` 存在，传入值仅作为补充 | `NEUTRAL,CALM,CONFIDENT` |

**注意：** `.env.*` 文件包含敏感信息，已加入 `.gitignore`，请勿提交到版本控制。

### 前端环境对应

| 前端环境 | 构建命令 | 后端 API 域名 |
|----------|----------|---------------|
| 开发/测试 | `npm run dev:h5` | `http://127.0.0.1:3000` (本地) |
| 生产 | `npm run build:h5` | `实际部署的前端 HTTPS 域名` |

***

## 1. 用户认证 (Auth)

### 登录

- **接口地址**: `POST /auth/login`
- **说明**: 用户登录，获取访问令牌。
- **入参 (Body)**:
  | 参数名      | 类型     | 必填 | 说明  |
  | :------- | :----- | :- | :-- |
  | username | string | 是  | 用户名 |
  | password | string | 是  | 密码  |
- **出参**:
  ```json
  {
    "token": "eyJhbGci...",
    "userInfo": {
      "id": "60d5ec...",
      "nickname": "Admin",
      "avatar": "..."
    }
  }
  ```

***

## 2. 资产管理 (Assets)

### 获取资产汇总

- **接口地址**: `GET /assets/summary`
- **说明**: 获取当前用户的总资产、持仓市值、现金余额等概览数据。
- **口径说明**:
  - `totalAssets`(总资产) = `cash + holdingsMarketValue`（均为 CNY 口径）
  - `holdingsMarketValue`(持仓总市值) = Σ( `quantity * currentPrice * FX` )，其中 `currentPrice` 取价策略见“获取持仓列表”的取价说明。
  - `totalProfit`(累计盈亏) = `totalAssets - currentPrincipal`
  - `currentPrincipal`(本金/净投入) = 初始本金 + 转入(IN) + 转出(OUT, 记为负数)（均折算为 CNY）。
    - 初始本金通常表现为第一笔 `IN`（可在 `remark` 标注“初始入金/初始本金”）。
    - 买入/卖出交易不会改变本金，只会改变现金与持仓市值。
  - `totalDailyProfit`（今日盈亏）直接读取北京时间当日 `DailyProfit.dailyProfitAmount` 快照；它与收益曲线使用同一日收益快照，不再从当前持仓临时重算。
  - “今日”边界：按北京时间 (UTC+8) 的 00:00\~24:00 统计今日交易。
  - **手续费处理**:
    - `totalAssets` 已考虑交易手续费：买入会从 `cash` 扣除手续费，卖出会从回款中扣除手续费，因此手续费会直接影响总资产。
    - `totalProfit` 由于基于 `totalAssets` 计算，因此也已包含手续费影响（手续费会降低累计盈亏）。
  - 请求 `GET /assets/summary` 时，后端会先刷新一次持仓最新市值，再返回汇总并 upsert 当天 `DailyProfit`，因此该接口现在既是查询接口，也是一次“最新快照补齐”触发点。
- **入参**: 无
- **响应头 (Header)**:
  - `X-Assets-Summary-Logic`: 当前后端使用的资产汇总口径标识（例如 `computed-v2`），用于前后端联调确认是否已更新部署。
  - `X-ProfitHistory-Date`: 本次请求触发写入/更新的收益记录日期（YYYY-MM-DD），用于联调确认当日收益率已入库。
- **出参**:
  ```json
  {
    "totalAssets": 150000.00,       // 总资产 (CNY)
    "totalProfit": 5000.00,         // 累计总盈亏 (CNY)
    "totalDailyProfit": 200.00,     // 今日总盈亏 (CNY)
    "cash": 50000.00,               // 现金余额 (CNY)
    "holdingsMarketValue": 100000,  // 持仓总市值 (CNY)
    "currentPrincipal": 145000,     // 当前投入本金 (CNY)
    "totalHoldingsCount": 3         // 持仓标的数量
  }
  ```

### 获取收益曲线

- **接口地址**: `GET /assets/profit-curve`
- **说明**: 获取历史收益率走势数据。
- **口径说明**:
  - `data[].value`：个人区间累计收益率（百分比数值），由区间内 `DailyProfit.dailyReturn` 按时间顺序复利计算；若区间前已有快照，首日也参与复利，否则首个点是零基线。
  - `DailyProfit.dailyReturn` 已按外部资金流调整，区间内入金/出金不会被误判为投资收益。
  - `data[].benchmark`：基准曲线（百分比数值），当前由后端在请求时按上证指数 (`000001.SH`) 历史日线**实时计算**，不会随每日收益记录持久化。
    - 计算口径：以当前返回区间内“首个可用交易日”的上证指数收盘点位作为基线，`benchmark = ((indexClose / indexBaseClose) - 1) * 100`。
    - 若某日缺少对应的基准历史数据，`benchmark` 返回 `null`，不会静默回填成 `0`。
  - 顶层返回中的 `benchmarkName` / `benchmarkSymbol` 用于明确当前基准语义，避免前后端理解不一致。
  - 个人每日收益率入库：当日发生资产变动（新增/删除/修改交易、删除持仓、入金出金）或请求 `GET /assets/summary` 时，后端会 upsert 当天的 `DailyProfit` 记录：
    - `DailyProfit` 同时保存当日收益率、当日盈亏额、外部资金流与估值质量；历史流水的 CNY 金额使用写入时锁定的汇率，不会以当前汇率重估
    - 收益曲线请求时的 `benchmark` 按上证指数累计涨跌幅实时计算，基线为该账户收益曲线首个可用交易日
    - `DailyProfit.dailyProfitAmount` / `DailyProfit.cumulativeProfitAmount` 按当日/累计盈亏（CNY）写入
- **后台定时快照建议**:
  - 为避免“用户不登录就不更新收益历史”，仓库已提供批处理脚本：`npm run snapshot:profit-history`
  - 推荐由服务器 `cron` 按北京时间触发，而不是简单固定“每天 2 点一次”：
    - A 股 / 港股收盘后：`10 16 * * 1-5 cd <项目路径> && npm run snapshot:profit-history -- --markets=CN,HK`
    - 美股收盘后：`10 5 * * 2-6 cd <项目路径> && npm run snapshot:profit-history -- --markets=US`
    - （请根据阿里云实际项目目录修改）
  - 批处理会先按市场过滤账户，并确认目标市场“今天确实已有新行情或今日有交易”后，才刷新账户持仓市值并 upsert 当天 `DailyProfit`，避免节假日/非交易时段误写快照
  - 若只部署单个后端实例，也可设置环境变量 `ENABLE_PROFIT_HISTORY_SCHEDULER=true` 启用进程内定时器；多实例部署不建议开启，避免重复触发
- **入参 (Query)**:
  | 参数名       | 类型     | 说明                               |
  | :-------- | :----- | :------------------------------- |
  | range     | string | 时间范围: 'month', 'quarter', 'year', 'all' |
  | startDate | string | 开始日期 (YYYY-MM-DD)                |
  | endDate   | string | 结束日期 (YYYY-MM-DD)                |
- **补充说明**:
  - 当 `range=all` 时，由后端直接返回账户当前可用的完整收益历史区间，前端无需自行推测起始日期。
  - 若同时传 `startDate/endDate`，以后者为准。
- **出参**:
  ```json
  {
    "benchmarkName": "上证指数",
    "benchmarkSymbol": "000001.SH",
    "data": [
      { "date": "2023-01-01", "value": 1.02, "benchmark": 1.01 },
      { "date": "2023-01-02", "value": 1.03, "benchmark": -0.42 }
    ]
  }
  ```

### 获取收益日历

- **接口地址**: `GET /assets/profit-calendar`
- **说明**: 获取指定月份的每日盈亏数据及统计。
- **口径说明**:
  - `dailyProfits[YYYY-MM-DD]`：该日盈亏额，来自 `DailyRevenue.revenue`；若该日无记录则返回 `0`。
  - 返回范围：从当月 1 号开始到“当月最后一天”（若查询的是当月，则到今天）。
  - `stats.upDays`：当月 `profitAmount > 0` 的天数。
  - `stats.downDays`：当月 `profitAmount < 0` 的天数。
  - `stats.winRate`：胜率 = `upDays / (upDays + downDays) * 100`（不统计 `profitAmount = 0` 的天）。
  - `stats.totalProfit`：当月总盈亏 = Σ(当月每天 `profitAmount`)。
  - `stats.monthStartPrincipal`：按“北京时间当月 1 日 00:00 之前”的累计出入金与历史交易回放，计算得到的月初本金基线（CNY）。
  - `stats.yieldRate`：当前按本金口径计算，`yieldRate = totalProfit / monthStartPrincipal * 100`；若月初本金 `<= 0` 则返回 `0`。
  - `stats.monthStartAssets`：月初总资产基线（CNY）。若存在月初前一日的 `DailyProfit.cumulativeReturn`，则按 `monthStartPrincipal * (1 + cumulativeReturn / 100)` 反推；若缺少前序收益快照则返回 `null`。
- **入参 (Query)**:
  | 参数名   | 类型     | 说明          |
  | :---- | :----- | :---------- |
  | year  | number | 年份 (如 2023) |
  | month | number | 月份 (1-12)   |
- **出参**:
  ```json
  {
    "dailyProfits": {
      "2023-10-01": 500.00,
      "2023-10-02": -200.00
    },
    "stats": {
      "upDays": 12,       // 盈利天数
      "downDays": 8,      // 亏损天数
      "winRate": 60.0,    // 胜率 (%)
      "totalProfit": 3000,
      "yieldRate": 2.15,
      "monthStartAssets": 139500,
      "monthStartPrincipal": 139500
    }
  }
  ```

***

## 3. 交易与持仓 (Trades)

### 获取持仓列表

- **接口地址**: `GET /trades/holdings`
- **说明**: 获取当前持有的股票列表，包含实时行情与盈亏数据。
- **入参**: 无
- **出参**:
  ```json
  {
    "list": [
      {
        "symbol": "600519.SH",          // 标的代码（后端会归一化存储，推荐格式如 600519.SH / 00700.HK / AAPL.US）
        "name": "贵州茅台",             // 标的名称
        "quantity": 100,                 // 持仓数量
        "avgCost": 1800.0,               // 持仓平均成本（含买入手续费口径）

        "currentPrice": 1850.0,          // 当前价格：有实时行情取行情价；无行情取 lastPrice；都无则为 null
        "marketValue": 185000.0,         // 持仓市值 = quantity * currentPrice；currentPrice 为 null 时为 null
        "marketValueCNY": 185000.0,      // 持仓市值（折算 CNY）= marketValue * FX；marketValue 为 null 时为 null
        "currency": "CNY",              // 币种（CNY / USD / HKD）

        "profitRate": 0.0310,            // 累计盈亏率（小数）：cumulativeProfit / totalInvestmentCNY；无法取价时为 null
        "profitAmount": 5000.0,          // 兼容旧字段：未实现盈亏（标的原币种）
        "unrealizedProfit": 5000.0,      // 未实现盈亏（CNY）
        "realizedProfit": 25999.0,       // 已实现盈亏（CNY）
        "cumulativeProfit": 30999.0,     // 累计盈亏 = realizedProfit + unrealizedProfit（CNY）

        "dailyProfit": 1500.0,           // 今日盈亏额（按“今日”口径计算）；若报价不属于“今天”且今日无实际交易，则返回 null
        "marketTag": "SH",              // 市场标签（SH / SZ / HK / US）

        "positionRatio": 0.13962,        // 仓位占比（小数）：marketValueCNY / totalAssetsCNY；marketValueCNY 为 null 时为 0
        "positionPercent": 13.96         // 仓位占比（百分比）：positionRatio * 100
      }
    ]
  }
  ```

**取价策略说明**

- 有实时行情时：`currentPrice` 取行情价。
- 无实时行情时：`currentPrice` 使用该标的收盘价 `lastPrice`（来自接口查询的该标的收盘价格）。
- 若既无实时行情也无 `lastPrice`：`currentPrice/marketValue/marketValueCNY/profitRate/profitAmount/unrealizedProfit/cumulativeProfit/dailyProfit` 返回 `null`，前端可显示 `"--"`。

**盈亏口径说明**

- `realizedProfit`：该标的历史已实现盈亏（折算 CNY），按全量交易正序回放、使用移动均价计算。
- `unrealizedProfit`：当前剩余持仓的未实现盈亏（折算 CNY）。
- `cumulativeProfit`：`realizedProfit + unrealizedProfit`，用于“当前持仓累计盈亏”展示。
- `profitRate`：累计盈亏率，`cumulativeProfit / totalInvestmentCNY`。
- `profitAmount`：保留为兼容旧前端的未实现盈亏原币种字段；新前端建议改用 `unrealizedProfit` / `cumulativeProfit`。
- `dailyProfit`：仅在“该标的报价属于今天（北京时间口径）”或“用户今天确实交易过该标的”时才计算；否则返回 `null`，前端应显示 `--`。

### 获取清仓汇总列表

- **接口地址**: `GET /trades/history-holdings`
- **说明**: 返回所有“已清仓(最终 quantity<=0)”标的的汇总列表，用于清仓列表页；点击某条再用 `GET /trades/reviews?symbol=...` 查看明细。
- **入参 (Query)**:
  | 参数名      | 类型     | 必填 | 说明 |
  | :--------- | :------ | :-- | :-- |
  | page       | number  | 否  | 页码 (默认 1) |
  | pageSize   | number  | 否  | 每页数量 (默认 20) |
  | sort       | string  | 否  | 排序字段，默认 `-lastTradeDate`；支持 `cumulativeProfit` / `profitRate` / `lastTradeDate` / `tradesCount`，加 `-` 表示倒序 |
- **计算口径**:
  - 按 `symbol` 分组，以交易日期正序回放，使用“移动均价”计算已实现盈亏。
  - `cumulativeProfit` 为已实现盈亏（折算 CNY），`profitRate = cumulativeProfit / totalInvestment`，其中 `totalInvestment` 为累计买入成本（含手续费，折算 CNY）。
- **出参**:
  ```json
  {
    "list": [
      {
        "symbol": "600519.SH",
        "name": "贵州茅台",
        "cumulativeProfit": 1234.56,
        "profitRate": 0.1234,
        "lastTradeDate": "2026-04-13T00:50:39.000Z",
        "tradesCount": 18
      }
    ],
    "total": 1
  }
  ```


### 获取交易记录 (复盘)

- **接口地址**: `GET /trades/reviews`
- **说明**: 分页获取历史交易明细。
- **入参 (Query)**:
  | 参数名      | 类型     | 说明           |
  | :------- | :----- | :----------- |
  | page     | number | 页码 (默认 1)    |
  | pageSize | number | 每页数量 (默认 20) |
  | symbol   | string | (可选) 筛选特定股票  |
  | type     | string | (可选) 交易类型精确匹配；支持 `BUY` / `SELL` |
  | sort     | string | (可选) 排序: date_desc(默认) / date_asc |
  | date     | string | (可选) 筛选某日交易 (YYYY-MM-DD，按北京时间口径) |
  | include  | string | (可选) 逗号分隔字段: `marketOverview`、`news`；**默认不返回**，需显式传入 `marketOverview,news` 才会带出大盘快照与新闻字段 |
- **组合查询规则**:
  - `symbol`、`date`、`type`、`page`、`pageSize` 可同时生效，后端会合并到同一查询条件中。
  - `type` 按交易落库值精确匹配，当前固定使用大写枚举：`BUY`、`SELL`。
  - `total` 始终基于当前筛选条件计算，而不是全量总数。
- **出参**:
  ```json
  {
    "list": [
      {
        "id": "...",
        "symbol": "600519.SH",
        "name": "贵州茅台",
        "stockName": "贵州茅台",
        "date": "2023-10-01T...",
        "type": "BUY",
        "price": 1800.00,
        "quantity": 100,
        "commission": 1.00,
        "currency": "CNY",
        "market": "CN",
        "exchange": "SH",
        "mood": "CALM",
        "logic": "看好白酒板块",
        "isSystemCompliant": "符合系统",
        "cognitiveBias": "过早确认",
        "improvementMeasures": "等待放量突破后再买入",
        "marketOverview": {
          "index": 3050.12,
          "change": 15.24,
          "changePercent": 0.5,
          "volume": 40670784,
          "volumeChangeRatio": null,
          "upCount": null,
          "downCount": null,
          "flatCount": null,
          "limitUpCount": null,
          "limitDownCount": null,
          "snapshotTime": "2024-05-10T15:00:00+08:00",
          "snapshotSource": "sohu-hisHq-daily"
        },
        "marketOverviewSnapshot": {
          "index": 3050.12,
          "change": 15.24
        },
        "snapshotStatus": "partial",
        "snapshotSource": "sohu-hisHq-daily",
        "snapshotTime": "2024-05-10T15:00:00+08:00",
        "news": "<p>关键新闻</p>"
      }
    ],
    "total": 50
  }
  ```

**复盘字段说明**

- `isSystemCompliant`: 复盘时记录“是否符合交易系统/策略”的结论。
- `cognitiveBias`: 复盘时记录本次交易暴露出的认知偏差。
- `improvementMeasures`: 复盘时记录后续改进措施。
- `marketOverviewSnapshot`: 后端按 `trade.date + trade.market/symbol` 生成并持久化的历史大盘快照。
- `snapshotStatus`: 快照状态，当前支持 `complete / partial / missing`。
- `snapshotSource`: 快照来源标识。
- `snapshotTime`: 快照时间。当前 A 股历史快照默认落日线时间点（如 `15:00:00+08:00`）。
- **历史快照字段可用性说明**:
  - 若交易记录由前端随交易提交大盘快照，则 `marketOverviewSnapshot` / `marketOverview` 会保留前端当时读取的实时口径：
    - `volume` 为 **A 股全市成交额（元）**；
    - `volumeChangeRatio` 为 **较昨日 A 股全市成交额变化量（元），计算口径为 当日成交额 - 上一交易日成交额**；
    - `upCount / downCount / flatCount / limitUpCount / limitDownCount` 为 **A 股全市**涨跌分布与涨跌停家数。
  - 若由后端按交易日期自动补抓 A 股指数历史日线，则稳定可返回：`index`、`price`、`change`、`changePercent`。
  - 当前第三方历史源无法稳定提供：`volume`（A 股全市成交额）、`volumeChangeRatio`（较昨日成交额变化量）、`upCount`、`downCount`、`flatCount`、`limitUpCount`、`limitDownCount`，这些字段会返回 `null`，前端通常显示为 `--`。
  - `snapshotStatus=partial` 表示只拿到部分字段；`snapshotStatus=missing` 表示该交易日期/市场未取到有效历史快照；两种情况下都不使用假 `0` 兜底。
  - 当前 `marketOverview` 与 `marketOverviewSnapshot` 返回的是同一份历史快照数据，前者为兼容字段，推荐优先读取 `marketOverviewSnapshot`。

### 获取单条复盘详情

- **接口地址**: `GET /trades/reviews/:id`
- **说明**: 获取单条交易记录的完整字段（包含 `marketOverview/news`）。
- **历史快照说明**:
  - 详情接口中的 `marketOverviewSnapshot` 与列表接口口径一致。
  - 若字段值为 `null`，表示当前历史数据源无法还原该项真实值，不代表业务值为 `0`。
- **出参**:
  ```json
  {
    "id": "...",
    "symbol": "600519.SH",
    "name": "贵州茅台",
    "stockName": "贵州茅台",
    "date": "2023-10-01T09:30:00.000Z",
    "type": "BUY",
    "price": 1800,
    "quantity": 100,
    "commission": 1,
    "currency": "CNY",
    "market": "CN",
    "exchange": "SH",
    "mood": "CALM",
    "logic": "看好白酒板块",
    "isSystemCompliant": "符合系统",
    "cognitiveBias": "过早确认",
    "improvementMeasures": "等待放量突破后再买入",
    "marketOverview": {
      "index": 3050.12,
      "changePercent": 0.5
    },
    "marketOverviewSnapshot": {
      "index": 3050.12,
      "changePercent": 0.5,
      "snapshotTime": "2024-05-10T15:00:00+08:00",
      "snapshotSource": "sohu-hisHq-daily"
    },
    "snapshotStatus": "partial",
    "snapshotSource": "sohu-hisHq-daily",
    "snapshotTime": "2024-05-10T15:00:00+08:00",
    "news": "<p>关键新闻</p>"
  }
  ```

### 新增交易

- **接口地址**: `POST /trades`
- **说明**: 录入一笔新的买入或卖出交易。
- **入参 (Body)**:
  | 参数名        | 类型     | 必填 | 说明                |
  | :--------- | :----- | :- | :---------------- |
  | symbol     | string | 是  | 股票代码 (如 SH600519) |
  | type       | string | 是  | 'BUY' 或 'SELL'    |
  | price      | number | 是  | 成交单价              |
  | quantity   | number | 是  | 成交数量              |
  | date       | string | 是  | 交易日期              |
  | name       | string | 否  | 股票名称 (不传会自动获取)    |
  | currency   | string | 否  | 币种 (默认 CNY)       |
  | market     | string | 否  | 市场 (SH/SZ/HK/US)  |
  | commission | number | 否  | 手续费               |
  | mood       | string | 否  | 交易时个人状态（枚举，默认 NEUTRAL） |
  | logic      | string | 否  | 交易逻辑/备注           |
  | news       | string | 否  | 交易当时新闻/事件（支持简单 HTML；后端会做基础清洗） |
- **出参**: 创建成功的交易对象 (JSON)。

**历史快照说明**

- 新增交易时，后端会优先使用请求体中的 `marketOverview` 作为交易当时的大盘快照落库；该字段为空或无效时，再由后端按 `trade.date + trade.market/symbol` 自动补抓历史大盘快照。
- 当前已接入 A 股指数历史日线快照：
  - `SH` 默认使用上证指数
  - `SZ` 默认使用深证成指
  - `300/301` 开头的深市标的优先使用创业板指
- 自动补抓的历史快照可能无法稳定提供涨跌分布、涨跌停、较昨日成交额变化量等字段，这些字段会返回 `null`，不会写入假 `0`。
- 前端通过 `GET /market/overview` 获取实时大盘时，`volume` 为 **A 股全市成交额（元）**，`volumeChangeRatio` 为 **较昨日 A 股全市成交额变化量（元），计算口径为 当日成交额 - 上一交易日成交额**；将实时大盘快照随交易提交后，上述口径会被原样保留到交易记录中。

**mood 枚举说明**

- 默认枚举：`NEUTRAL,CALM,CONFIDENT,ANXIOUS,IMPULSIVE,EXCITED,FEAR`
- 可通过后端环境变量 `TRADE_MOODS` 补充（逗号分隔）。系统会强制保证 `NEUTRAL`、`EXCITED`、`FEAR` 存在，因此即使只传 `NEUTRAL,CALM,CONFIDENT`，最终可用枚举仍会包含 `EXCITED` 和 `FEAR`。
- 后端会将入参 `mood` 自动转为大写后校验（例如 `calm` 会被当作 `CALM`）。

**时间口径补充**

- 后端以"北京时间 (UTC+8)"界定"今日"的起止区间（00:00\~24:00），用于今日盈亏统计。
- `date` 建议传 ISO8601 且带时区（例如 `2026-03-21T09:30:00+08:00`）。
- 若 `date` 未带时区（如 `2026-03-21` 或 `2026-03-21 09:30:00`），后端会按北京时间 (UTC+8) 解释该时间。

**股票代码口径补充**

- 后端会对 `symbol` 做归一化存储，推荐前端统一传：A 股用 `600519.SH` / `000001.SZ`，港股用 `00700.HK`，美股用 `AAPL.US`。
- 为兼容历史数据与输入习惯，后端也接受 `SH600519` / `SZ000001` / `HK00700` 等格式。

**收益历史回溯说明**

- 新增交易后，后端会自动触发收益历史回溯重算：从该交易日期到今天的所有 `DailyProfit` / `DailyRevenue` 记录都会被重新计算并更新。
- 这确保了当用户补录历史交易时，收益日历和收益曲线的历史数据能够同步更新，保持数据一致性。
- **出参**: 创建成功的交易对象 (JSON)。

### 删除持仓

- **接口地址**: `DELETE /trades/holdings/:symbol`
- **说明**: 删除该股票的持仓记录，并级联删除该股票的全部历史交易记录（用于"清空该股历史后重新开始计算"场景）。
- **资产更新**: 删除完成后，后端会基于"剩余的入金/出金记录 + 剩余的交易记录(含手续费)"重算 `cash/currentPrincipal/totalAssets`，因此 `GET /assets/summary` 的累计盈亏与总资产会同步变化。
- **收益历史回溯**: 删除后会触发收益历史回溯重算：从被删除交易中最早的日期到今天的所有 `DailyProfit` / `DailyRevenue` 记录都会被重新计算并更新，确保收益日历和收益曲线数据一致。
- **入参 (Path)**: `symbol` (股票代码)
- **出参**:
  ```json
  {
    "message": "持仓及历史交易删除成功",
    "symbol": "600519.SH",
    "deletedTradesCount": 12
  }
  ```

### 删除/修改交易记录

- **更新**: `PUT /trades/:id` (Body 传更新字段)
- **删除**: `DELETE /trades/reviews/:id` (Path 传交易 ID)
  - 若 `id` 不是合法的 Mongo ObjectId，后端返回 `400 {"message":"Invalid trade id"}`。
  - 删除/更新后后端会基于"入金/出金 + 全量交易记录(含手续费)"重算持仓、现金与资产汇总，并同步更新当日收益入库。
  - **收益历史回溯**: 删除或修改交易后会触发收益历史回溯重算：从该交易日期到今天的所有 `DailyProfit` / `DailyRevenue` 记录都会被重新计算并更新。
  - `PUT /trades/:id` 当前支持更新复盘相关字段：
    - `isSystemCompliant`
    - `cognitiveBias`
    - `improvementMeasures`
  - 同时也支持更新已有交易字段，如 `date/type/price/quantity/logic/mood/marketOverview/news` 等；未传字段保持不变。

***

## 4. 市场行情 (Market)

### 搜索股票

- **接口地址**: `GET /market/search`
- **说明**: 根据关键词搜索股票代码。
- **入参 (Query)**: `keyword` (股票代码或名称)
- **出参**:
  ```json
  {
    "suggestions": [
      { "symbol": "SH600519", "name": "贵州茅台", "market": "SH" }
    ],
    "source": "tencent"
  }
  ```
- **字段说明**：
  - `suggestions`：搜索结果数组。
  - `source`：本次搜索实际命中的数据源，可能为 `tencent`（腾讯 Smartbox）、`eastmoney`（东方财富 Suggest）或 `mock`（本地兜底数据）。

### 获取大盘指数

- **接口地址**: `GET /market/overview`
- **说明**: 获取主要指数 (上证、深证、创业板、恒生、标普 500) 的行情与 A 股全市场广度指标。
- **入参 (Query)**:
  - `date`（可选）: 日期格式 `YYYY-MM-DD`。
    - 不传或传当天日期：返回**实时大盘**，后端会并发拉取东方财富全市场数据并做 3 分钟服务端缓存；缓存命中时直接返回，不再请求外部行情源。
    - 传历史日期：返回该交易日**收盘大盘快照**，指数点位来自腾讯历史日线，全市成交量/涨跌分布/涨跌停来自后端已保存的 `MarketDailySnapshot`；若当天未保存，则这些全市指标返回 `null`。
- **字段约定**:
  - 后端稳定返回：`index`、`price`、`change`、`changePercent`、`volume`、`volumeChangeRatio`、`upCount`、`downCount`、`flatCount`、`limitUpCount`、`limitDownCount`。
  - 当前若第三方数据源无法提供某字段，返回 `null`，不使用假 `0` 兜底。
  - 非 A 股指数（恒生、标普 500）返回 `null`；但前端在港股、美股交易时统一回退展示 A 股大盘数据，因此实际交易中仍可见 A 股全市成交额与较昨日变化量。
  - 历史日期的港美股指数当前无法提供稳定历史数据源，返回数组中只包含 A 股指数；前端若按市场名称（如 `恒生指数`）未命中，会回退到数组第一项（上证指数），从而在历史交易中统一展示 A 股大盘。
- **出参**:
  ```json
  {
    "list": [
      {
        "name": "上证指数",
        "symbol": "000001.SH",
        "index": 3120.55,
        "price": 3120.55,
        "change": 12.34,
        "changePercent": 0.4,
        "volume": 456700000000,
        "volumeChangeRatio": -4500000000,
        "upCount": 1876,
        "downCount": 3021,
        "flatCount": 146,
        "limitUpCount": 42,
        "limitDownCount": 11
      }
    ]
  }
  ```
- **出参字段说明**:
  - `list[].name`: 指数名称，如 `上证指数`、`深证成指`、`创业板指`、`恒生指数`、`标普500`。
  - `list[].symbol`: 指数代码，当前使用统一格式，如 `000001.SH`。
  - `list[].index`: 指数点位。
  - `list[].price`: 指数现价；当前与 `index` 保持一致，便于前端复用通用行情展示组件。
  - `list[].change`: 较上一交易日收盘的涨跌额。
  - `list[].changePercent`: 较上一交易日收盘的涨跌幅，单位为 `%`。
  - `list[].volume`: **A 股全市成交额（元）**，即沪深京所有 A 股当日成交金额合计；由东方财富全市场行情聚合得到，不是单个指数自身成交额。若外部行情源不可达或历史日期未保存快照则返回 `null`。
  - `list[].volumeChangeRatio`: **较昨日 A 股全市成交额变化量（元）**，计算口径为 `当日 A 股全市成交额 - 上一交易日 A 股全市成交额`；增量展示为红色正数，缩量展示为绿色负数，无变化或缺失展示为 `--`。上一日数据来自后端持久化的 `MarketDailySnapshot`，首次部署后需至少经过一个交易日（或收盘后定时任务执行）才能生成前一日基线。
  - `list[].upCount`: **A 股全市上涨家数**，按沪深京 A 股行情聚合统计；若外部行情源不可达或历史未保存快照则返回 `null`。
  - `list[].downCount`: **A 股全市下跌家数**，按沪深京 A 股行情聚合统计；若外部行情源不可达或历史未保存快照则返回 `null`。
  - `list[].flatCount`: **A 股全市平盘家数**，按沪深京 A 股行情聚合统计；若外部行情源不可达或历史未保存快照则返回 `null`。
  - `list[].limitUpCount`: **A 股全市涨停家数**，按涨跌幅结合各板块涨跌停规则估算统计（主板/ST 约 ±5%/10%，创业板/科创板约 ±20%，北交所约 ±30%）；若外部行情源不可达或历史未保存快照则返回 `null`。
  - `list[].limitDownCount`: **A 股全市跌停家数**，统计口径同 `limitUpCount`；若外部行情源不可达或历史未保存快照则返回 `null`。
- **前端联调建议**:
  - 字段名保持现状，无需改接口读取路径：`volume`、`volumeChangeRatio`、`upCount`、`downCount`、`flatCount`、`limitUpCount`、`limitDownCount`。
  - `volume` 当前语义为“**A 股全市成交额（元）**”，前端文案不应再解释为单个指数成交量。
  - `volumeChangeRatio` 当前语义为“**较昨日 A 股全市成交额变化量（元）**”，是绝对变化量，不是比值；前端展示时应按金额格式化，并追加 `+/-` 符号，增量红色、缩量绿色。
  - 港股、美股交易时，前端仍读取 A 股大盘数据（上证指数、深证成指、创业板指）并展示 A 股全市指标。
  - `upCount/downCount/flatCount/limitUpCount/limitDownCount` 在外部行情源不可达或历史快照缺失时仍可能返回 `null`，前端应显示 `--`，不要回退为 `0`。
  - 添加交易时，请根据 `date` 区分调用：当天交易不传 `date` 获取实时大盘；补录历史交易传 `date=YYYY-MM-DD` 获取收盘快照，避免把今天的大盘数据写入历史交易记录。

### 获取个股报价

- **接口地址**: `GET /market/quote`
- **说明**: 查询单只股票的实时价格。
- **入参 (Query)**: `symbol` (如 SH600519)
- **出参**:
  ```json
  {
    "symbol": "sh600519",
    "name": "贵州茅台",
    "price": 1850.00,
    "preClose": 1820.00,
    "changePercent": 1.65,
    "volume": 50000
  }
  ```

***

## 5. 出入金记录 (Transfers)

### 获取出入金列表

- **接口地址**: `GET /transfers`
- **入参 (Query)**: `page`, `pageSize`
- **出参**:
  ```json
  {
    "list": [
      {
        "id": "...",
        "type": "IN",
        "amount": 10000,
        "currency": "CNY",
        "date": "2026-03-21T00:00:00.000Z",
        "remark": "初始入金"
      }
    ]
  }
  ```

### 新增出入金

- **接口地址**: `POST /transfers`
- **口径补充**:
  - `IN` 会增加现金与本金。
  - `OUT` 会减少现金与本金（本金口径中按负数计入）。
- **入参 (Body)**:
  | 参数名      | 类型     | 必填 | 说明                     |
  | :------- | :----- | :- | :--------------------- |
  | type     | string | 是  | 'IN' (入金) 或 'OUT' (出金) |
  | amount   | number | 是  | 金额                     |
  | currency | string | 否  | 币种                     |
  | date     | string | 否  | 日期                     |
  | remark   | string | 否  | 备注                     |


***

## 运维：用户业务数据重置（不对外开放 HTTP 接口）

此功能是后端维护脚本，**不是 API 接口**，不应由前端调用。

- 单用户：`npm run reset:user-business-data -- --userId <USER_ID> --confirm`
- 全用户：`npm run reset:all-business-data -- --confirm-all-users`

### 安全约束

1. 操作不可恢复；执行前必须完成数据库备份、核对 `MONGODB_URI` 指向目标环境，并在维护窗口内执行。
2. 缺少 `--confirm` 或 `--confirm-all-users` 时，脚本会在连接数据库前拒绝执行；不要将确认参数封装进自动化日常任务。
3. 删除范围仅包括用户业务数据（交易、持仓、转账、资产、日收益/营收、月统计、快照及临时微信会话）。账号密码、微信绑定身份、全局行情数据与已撤销令牌不会被删除。
4. 重置后手续费偏好恢复为默认值；脚本会输出各集合删除数量、重置用户数量与执行时间，必须人工复核输出。
