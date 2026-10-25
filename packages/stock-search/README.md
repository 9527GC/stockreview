# 股票搜索公共模块

`packages/stock-search` 是前后端共用的匹配实现，依赖 pinyin-pro。支持代码（含市场前缀及后缀）、中文/英文名称、拼音全拼、首字母和大小写/空格归一化。多音字按词组读音转换。

入口：
- 持仓明细：前端 `matchesStock` 筛选，与市场条件叠加。
- 历史持仓：后端 `matchesStock` 筛选完整结果后排序、分页。
- 复盘日志：后端用同一匹配器找出当前用户匹配的股票代码，再叠加日期、复盘状态等条件查询与分页。
- 添加交易、两种公司行动表单：共用 `/api/market/search`；交易表单本地候选兜底也使用 `matchesStock`。
- 输入框统一使用 `StockFilterInput`；选股下拉复用原有 UI，由统一接口返回候选。

行情搜索先合并当前用户交易中的证券与外部候选。外部接口不接受全拼时，`pinyinInitialQueries` 生成有限首字母候选用于召回，再用原始全拼匹配结果，避免误选。外部请求缓存一分钟并复用并发请求；用户交易数据不放入公共缓存。

开发：分别在 apps/backend、apps/frontend 运行 `npm install`，同时在本目录运行 `npm ci` 安装链接包依赖。前端 Vite 已配置公共 CommonJS 模块转换。

生产目录结构与仓库不同，先在本目录 `npm pack`，上传生成的 tgz 至 `/opt/stock-review/packages/`；在生产 backend 目录安装 `../packages/stock-review-stock-search-1.0.0.tgz`，再部署调用代码及前端构建。生产控制器与仓库存在其他差异，保留无关业务逻辑。