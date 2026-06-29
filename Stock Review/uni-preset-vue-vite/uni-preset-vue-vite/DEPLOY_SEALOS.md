# Sealos H5 Deployment

本项目是 `uni-app` 的 H5 前端，可通过容器镜像部署到 `Sealos`，并开启公网访问。

## 构建方式

- H5 构建命令：`npm run build:h5`
- 产物目录：`dist/build/h5`
- 容器运行方式：`Nginx` 提供静态文件服务

## 本地验证

在项目根目录执行：

```bash
docker build -t stock-review-frontend:latest .
docker run --rm -p 8080:80 stock-review-frontend:latest
```

浏览器访问：

```text
http://localhost:8080
```

## Sealos 部署步骤

1. 在本地构建镜像：

```bash
docker build -t <your-registry>/stock-review-frontend:latest .
```

2. 推送镜像到可被 Sealos 拉取的镜像仓库：

```bash
docker push <your-registry>/stock-review-frontend:latest
```

3. 登录 Sealos 控制台，创建一个新的应用：

- 镜像地址填写：`<your-registry>/stock-review-frontend:latest`
- 容器端口填写：`80`
- 资源规格按默认或低配即可

4. 打开公网访问：

- 在应用网络设置中开启外网访问
- 绑定 Sealos 自动分配的域名，或绑定你自己的域名

## 说明

- 本项目前端通过环境变量读取运行配置，部署时无需修改代码
- 本地开发可复制 `.env.example` 到 `.env`，并填写 `VITE_API_BASE_URL` 等变量
- 容器生产环境通过系统环境变量注入：`APP_ENV`、`API_BASE_URL`、`LOGIN_BACKGROUND_URL`
- 容器启动时会生成 `/usr/share/nginx/html/config.js`，前端优先读取该运行时配置
- 如果后端启用了跨域限制，需要确保部署后的前端域名被后端允许访问
