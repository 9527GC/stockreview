# 后端部署说明（阿里云）

## 环境准备

- Node.js 20+
- 可访问的 MongoDB（阿里云 MongoDB 或同等服务）
- Nginx/负载均衡（推荐）
- 进程守护工具，例如 systemd、pm2 或容器编排平台

## 配置环境变量

在 `apps/backend/.env.production` 创建生产配置，参考 `.env.production.example`。真实文件不得提交 Git。重点确认：

- `MONGODB_URI` 指向阿里云数据库，且安全组/白名单允许访问
- `JWT_SECRET` 使用独立随机密钥
- `CORS_ORIGINS` 填写实际前端域名
- 微信 AppID/AppSecret 通过环境变量注入
- 生产微信版本使用 `release`

## 部署与启动

```bash
cd apps/backend
npm ci --omit=dev
./entrypoint.sh prod
```

`entrypoint.sh` 会自动切换到脚本所在目录，不依赖固定平台路径。生产环境应使用 systemd、pm2 或容器守护进程保持服务运行，并通过 Nginx 反向代理到 `PORT`。

## 发布后检查

- 健康接口可访问
- 前端登录和个人中心正常
- `POST /api/users/wechat/miniapp-bind` 能保存 `wechatNickname`、`wechatAvatar`
- PC 扫码登录能创建并完成登录会话
- 后端日志无 MongoDB、CORS 或微信接口错误

## 故障排查

如果小程序已显示“昵称/头像已获取”，但 PC 端没有更新，优先确认：

1. 测试域名指向的后端已更新到最新代码；
2. 远程后端使用的是正确的测试数据库；
3. 后端进程已重启；
4. 请求实际发送到当前环境的 `/api/users/wechat/miniapp-bind`；
5. 数据库用户记录中已出现 `wechatNickname` 与 `wechatAvatar`。
## 指标发布与数据重置核验

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

### 生产业务数据重置（仅维护窗口）

若需要将业务数据清为空账户状态，仅可在完成数据库备份、复核生产 `MONGODB_URI` 且进入维护窗口后执行。该操作不可恢复：

```bash
# 单用户
npm run reset:user-business-data -- --userId <USER_ID> --confirm

# 全部用户
npm run reset:all-business-data -- --confirm-all-users
```

不要在生产环境试运行或省略确认参数；缺少确认参数时脚本会在连接数据库前退出。脚本只删除用户业务数据和临时微信会话，保留账号身份、密码、微信绑定身份、全局行情与已撤销令牌；执行后还需人工核对脚本输出的集合删除数量、重置用户数量与时间戳。
