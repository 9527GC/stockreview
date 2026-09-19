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
