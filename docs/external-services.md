下·# 外部服务配置

本文档记录项目依赖的外部服务配置，包括行情数据源、MCP 服务连接等。

## 安全提醒

- **API Token 属于敏感信息**，已写入 `server-side-project/.env*` 文件（已加入 `.gitignore`，不会进入版本控制）。
- **MCP 服务配置属于客户端配置**，建议放在 Claude Code 的本地 `settings.json` 中，不要提交到仓库。
- 提交代码前请确认没有意外把 `.env` 或 `settings.json` 中的真实 Token 暴露出来。

## Tushare 行情服务

| 项目 | 内容 |
|------|------|
| 服务名称 | Tushare Pro |
| 账户积分 | 5000 积分 |
| 后端读取变量 | `process.env.TUSHARE_TOKEN` |

配置位置：

- `server-side-project/.env`
- `server-side-project/.env.development`
- `server-side-project/.env.production`

```env
TUSHARE_TOKEN=5846ec76a5d7a07d1e1054009a4b2c9909cdf5caed83324b5de5d1a3
```

后端代码中读取方式：

```js
const token = process.env.TUSHARE_TOKEN;
```

调用方式参考 [Tushare Pro 官方文档](https://tushare.pro/document/1)。

## 5000 积分可访问接口（与项目相关）

根据 [Tushare 积分与权限对应表](https://tushare.pro/document/2?doc_id=290)，5000 积分属于“常规数据无总量上限”档位，每分钟可调取 500 次。但部分接口仍需要单独权限或更高积分，具体如下：

### 可直接使用（5000 积分已覆盖）

| 接口 | 说明 | 项目用途 | 权限/限制 |
|------|------|----------|-----------|
| `daily` | A 股历史日线行情（未复权） | 替换个股历史日线 | 基础积分，每分钟 500 次，每次 6000 条 |
| `index_daily` | 指数历史日线行情 | 替换上证指数/深证成指/创业板指历史日线 | 2000 积分起，每次最多 8000 行 |
| `stock_basic` | 股票基础信息列表 | 替换股票搜索/列表 | 2000 积分起，每次最多 6000 行 |
| `trade_cal` | 交易日历 | 判断交易日、补全收益历史 | 基础积分 |
| `adj_factor` | 复权因子 | 配合 `daily` 计算复权行情 | 基础积分 |
| `daily_info` | 沪深市场每日交易统计 | 获取全市成交额、成交量、市盈率 | 600 积分起，每次最多 4000 行 |
| `limit_list_d` | 涨跌停列表 | 统计涨停/跌停家数 | 5000 积分：每分钟 200 次，每天总量 1 万次 |
| `daily_basic` | 股票每日指标 | 获取个股换手率、市盈率、市值等 | 基础积分，每次最多 6000 行 |
| `pro_bar` | 通用行情接口（SDK 专用） | 获取复权行情、均线 | 仅 Python SDK，HTTP 暂不支持 |

### 暂不可用（需要单独权限或更高积分）

| 接口/类型 | 说明 | 限制 |
|-----------|------|------|
| 实时日线（`rt_k`、`rt_idx_k`、`rt_etf_k`） | 盘中实时行情 | 单独权限：200 元/月起 |
| 实时分钟（`rt_min`、`rt_idx_min`） | 盘中分钟行情 | 单独权限：1000 元/月起 |
| 历史分钟（`stk_mins`、`idx_mins`） | 历史分钟 K 线 | 单独权限：2000 元/年 |
| 港股日线（`hk_daily`、`hk_daily_adj`） | 港股历史行情 | 单独权限：1000 元/年 |
| 美股日线（`us_daily`、`us_daily_adj`） | 美股历史行情 | 单独权限：2000 元/年 |
| 特色数据（`cyq_perf`、`report_rc`、`cyq_chips`） | 筹码、盈利预测等 | 需要 10000 积分以上 |
| 新闻资讯（`news`、`major_news`） | 新闻快讯、长篇新闻 | 单独权限：1000 元/年 |
| 公告信息（`anns_d`） | 上市公司公告 | 单独权限：1000 元/年 |

## 当前项目数据源与可替换建议

### 1. 个股历史日线

- **当前来源**：腾讯历史 K 线、东方财富历史 K 线、搜狐历史行情（`server-side-project/src/utils/historicalQuotes.js`）
- **可替换为**：`tushare.daily`（未复权） + `tushare.adj_factor`（复权）
- **评价**：数据质量稳定，覆盖全历史，适合批量替换；但需要注意 `daily` 返回的成交量单位是“手”、成交额单位是“千元”，与现有字段单位可能不同。

### 2. 指数历史日线

- **当前来源**：腾讯历史 K 线（`server-side-project/src/utils/marketData.js`： `getHistoricalIndexSnapshot` / `getHistoricalIndexSeries`）
- **可替换为**：`tushare.index_daily`
- **评价**：5000 积分已覆盖，可替换上证指数、深证成指、创业板指的历史日线。数据稳定，且包含开盘/最高/最低/收盘/成交量等完整字段。

### 3. 股票搜索/列表

- **当前来源**：腾讯 Smartbox、东方财富 Suggest（`server-side-project/src/services/stockSearchService.js`）
- **可替换为**：`tushare.stock_basic`
- **评价**：`stock_basic` 返回全市场 A 股列表，支持本地缓存后实现模糊搜索；但无法像 Smartbox 那样支持实时拼音/关键词联想，建议保留腾讯/东财作为搜索，Tushare 用于补充基础信息。

### 4. 沪深市场每日交易统计

- **当前来源**：东方财富全市场接口（`fetchAshareBreadthStats`）+ AKShare fallback
- **可替换为**：`tushare.daily_info`（获取总成交额/成交量） + `tushare.limit_list_d`（获取涨跌停家数）
- **评价**：
  - `daily_info` 可以拿到沪市/深市/创业板的总成交金额、成交量、挂牌数、市盈率，适合计算全市成交额和较昨日变化量。
  - `limit_list_d` 可以拿到每日涨停/跌停/炸板个股列表，进而统计涨跌停家数。
  - **但无法直接拿到上涨家数、下跌家数、平盘家数**，这部分仍需东方财富或 AKShare 提供。

### 5. 实时行情

- **当前来源**：新浪财经（`getQuotes`）
- **可替换为**：Tushare 实时日线/分钟（需要单独付费权限）
- **评价**：5000 积分不包含实时行情权限，建议继续使用新浪财经，不要替换。

### 6. 港股/美股历史行情

- **当前来源**：新浪财经（实时）、腾讯/搜狐（历史）
- **可替换为**：Tushare 港股/美股日线
- **评价**：港美股数据需要单独权限（港股 1000 元/年，美股 2000 元/年），5000 积分不包含，建议保留现有来源。

## 建议替换优先级

| 优先级 | 替换项 | 推荐接口 | 原因 |
|--------|--------|----------|------|
| P1 | 指数历史日线 | `index_daily` | 数据稳定，5000 积分已覆盖，可直接替换腾讯历史 K 线 |
| P1 | 个股历史日线 | `daily` + `adj_factor` | 数据稳定，覆盖全历史，可替换多源历史接口 |
| P2 | 股票基础信息 | `stock_basic` | 用于补充股票名称、行业、上市日期等基础信息 |
| P2 | 沪深市场成交额/涨跌停 | `daily_info` + `limit_list_d` | 降低东方财富风控压力，但无法完全替代涨跌分布 |
| P3 | 实时行情 | 保留新浪 | Tushare 实时权限需额外付费，暂不替换 |
| P3 | 港美股行情 | 保留现有 | Tushare 港美股权限需额外付费，暂不替换 |

## 调用示例

### Node.js 直接调用 Tushare HTTP API

```js
const axios = require('axios');

const callTushare = async (apiName, params = {}, fields = '') => {
  const { data } = await axios.post('https://api.tushare.pro', {
    api_name: apiName,
    token: process.env.TUSHARE_TOKEN,
    params,
    fields
  });
  if (data.code !== 0) {
    throw new Error(`Tushare error: ${data.msg}`);
  }
  return data.data;
};

// 示例：获取上证指数历史日线
const indexData = await callTushare('index_daily', {
  ts_code: '000001.SH',
  start_date: '20240101',
  end_date: '20241231'
});

// 示例：获取 A 股全部股票基础信息
const stocks = await callTushare('stock_basic', {
  exchange: '',
  list_status: 'L'
}, 'ts_code,symbol,name,area,industry,list_date');
```

## MCP Server 配置

通过 SSE/StreamableHTTP 方式连接 tushare MCP 服务，应配置在 Claude Code 客户端设置中（不进入仓库）。

本地 `~/.claude/settings.json` 或项目级 `.claude/settings.json`（如使用）示例：

```json
{
  "mcpServers": {
    "tushareMcp": {
      "url": "https://api.tushare.pro/mcp/?token=5846ec76a5d7a07d1e1054009a4b2c9909cdf5caed83324b5de5d1a3"
    }
  }
}
```

配置后，Claude Code 可以通过 `tushareMcp` 服务直接查询金融数据。

---

**历史记录**

- 2026-07-06：购买 Tushare 5000 积分，并接入 MCP 服务配置；完成可替换接口分析。
