# 前端部署说明（阿里云）

本项目是 uni-app H5 前端，构建产物由 Nginx 提供静态文件服务。部署可使用阿里云 ECS、容器服务或其他兼容 Docker 的运行环境。

## 构建与本地验证

```bash
cd apps/frontend
rm -rf dist
npm run build:h5
```

产物目录：`dist/build/h5`。

如使用项目内 Dockerfile：

```bash
docker build -t stock-review-frontend:latest .
docker run --rm -p 8080:80 stock-review-frontend:latest
```

浏览器访问 `http://localhost:8080` 验证。

## 阿里云 ECS + Nginx

1. 将 `dist/build/h5` 上传到服务器静态目录，例如 `/var/www/stock-review`。
2. 配置 Nginx 将站点根目录指向该目录，并为前端路由配置 history fallback。
3. 配置 HTTPS 证书和域名。
4. 确认后端 `CORS_ORIGINS` 包含实际前端域名。
5. 发布后强制刷新浏览器，确认登录、个人中心和微信扫码入口。

## 容器部署

构建镜像并推送到阿里云容器镜像仓库后，在 ECS、ACK 或其他容器运行环境部署，暴露容器端口 `80`，并由 Nginx/负载均衡绑定域名和 HTTPS。

不要在前端源码中写入后端密钥、微信 AppSecret 或数据库密码；运行时 API 地址按现有环境配置注入。
