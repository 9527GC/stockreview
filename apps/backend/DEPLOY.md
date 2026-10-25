# 后端部署说明（阿里云）

## 环境准备

- Node.js 20+
- 可访问的阿里云 MongoDB 生产实例（生产库已迁移至阿里云）
- Nginx/负载均衡（推荐）
- 进程守护工具，例如 systemd、pm2 或容器编排平台

## 配置环境变量

在 `apps/backend/.env.production` 创建生产配置，参考 `.env.production.example`。真实文件不得提交 Git。重点确认：

- `MONGODB_URI` 指向阿里云 MongoDB 的生产库，且安全组/白名单允许当前后端运行环境访问；不得使用 localhost 或任何测试库
- `JWT_SECRET` 使用独立随机密钥
- `CORS_ORIGINS` 填写实际前端域名
- 微信正式小程序 AppID/AppSecret 通过环境变量注入，所有部署环境统一使用生产小程序凭证
- 小程序联调需避免多个后端竞争刷新同一 AppID 的 access_token，防止其他进程缓存失效；本项目不维护独立远程测试环境
- 生产微信版本使用 `release`

## 部署与启动

```bash
cd packages/stock-search
npm ci --omit=dev
cd ../../apps/backend
npm ci --omit=dev
./entrypoint.sh prod
```

以上安装要求保留仓库目录结构，共享包使用 file:../../packages/stock-search。生产目录不一致时，按 [共享包说明](../../packages/stock-search/README.md) 打包安装。

`entrypoint.sh` 会自动切换到脚本所在目录，不依赖固定平台路径。生产环境应使用 systemd、pm2 或容器守护进程保持服务运行，并通过 Nginx 反向代理到 `PORT`。

## 发布后检查

- 健康接口可访问
- 前端登录和个人中心正常
- `POST /api/users/wechat/miniapp-bind` 能保存 `wechatNickname`、`wechatAvatar`
- PC 扫码登录能创建并完成登录会话
- 后端日志显示已成功连接阿里云 MongoDB，且无 MongoDB、CORS 或微信接口错误

## 故障排查

### 收益日历自动更新

收益曲线接口统一使用 `dailyReturn` 按日复利计算区间收益，不能用首日资产作固定分母。尤其“全部”范围可能从入金前零资产记录开始，固定分母会使个人曲线全部返回空值。发布时需确认线上 `getProfitCurve` 与该计算口径一致。

收益曲线的指数基准按自然日连续计算：无当日有效指数时沿用此前最近的有效收盘值。区间起点向前查询 30 天以覆盖长假；完全没有历史依据的日期保持空值，不使用未来价格补历史。该处理仅生成曲线点，不向行情库写入虚构的交易日数据。

今日快照写入前会核对当日报价及交易、转账、公司行动。若均无变化且昨日两份快照齐全，则沿用昨日资产、现金、持仓市值及累计收益，今日金额和收益率记为零，保留历史估值不完整标记；不能把当前资产与旧历史估值的差额记作休市日收益。美股报价需转换到北京时间判断日期，不能单凭星期过滤。

收益任务在服务启动及每天北京时间 02:00、08:00 执行。08:00 的再次计算用于补偿美股收盘和行情延迟。每次滚动重算最近 14 天；停机超过该窗口时，从最后一条收益记录接续恢复。

启用 `HISTORY_REPLAY_USER_IDS` 的账户在回放前会自动补抓窗口内实际持仓证券的真实历史行情（含前一天基线），再同步写入收益曲线和收益日历。行情请求单次超时为 10 秒；缺少行情时保留旧价及 `valuationQuality`、`valuationDiagnostics` 标记，下次任务继续尝试，估算价格不会写入历史行情库。当前历史行情提供方主要覆盖 A 股和港股，美股缺失报价仍会显式标记。

发布前备份相关源码以及受影响账户的 `dailyprofits`、`dailyrevenues`、`monthlystats`、`historicalquotes` 数据。重启后检查 `[Scheduler]` 日志和行情日期是否推进，并核对收益曲线与日历同日金额一致。

如果小程序已显示“昵称/头像已获取”，但 PC 端没有更新，优先确认：

1. 生产域名指向的后端已更新到预期代码；
2. 远程后端使用的是阿里云生产数据库；
3. 后端进程已重启；
4. 请求实际发送到当前环境的 `/api/users/wechat/miniapp-bind`；
5. 数据库用户记录中已出现 `wechatNickname` 与 `wechatAvatar`。
## 指标发布核验

### 发布前回归

在发布包含资产、交易、转账或收益统计改动的版本前，必须在隔离环境执行：

```bash
cd apps/backend
npm test -- --runInBand
npm run lint

cd ../frontend
npm test -- --run
npm run build:h5
```

后端回归包含空账户 → 入金 → 买入 → 清仓 → 统一日快照 → 汇总、收益日历、收益曲线与完整清仓周期的端到端用例。验收时重点确认：汇总的 `totalDailyProfit` 与收益日历同一北京时间日期的金额一致，收益曲线只复利日收益率而不将入金/出金计作收益，清仓后完整周期的收益率正确。

### 数据维护

当前生产基线不包含业务数据重置脚本，旧本地脚本及其测试规格已归档。发布时不得运行历史文档中的 reset:user-business-data 或 reset:all-business-data 命令。
