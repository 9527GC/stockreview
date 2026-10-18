# 部署环境约定

本项目只支持两个环境，部署前必须明确目标：

## 本地开发环境（默认用于开发和测试）

- 前端：**apps/frontend**，使用 **.env.development**，运行 **npm run dev:h5**
- 后端：**apps/backend**，使用 **.env.development** 或本地 **.env**，运行 **npm run dev**
- 数据库：本机 MongoDB 的开发库
- 不上传服务器，不重启远程服务，不连接生产数据库

## 远程生产环境

- 域名：**https://stock.gc9527.com**
- 后端：阿里云服务器上的生产服务
- 前端：生产 H5 构建产物
- 数据库：生产 MongoDB
- 只有用户明确说“部署生产环境”或明确提供生产目标时，才允许执行远程部署。

## 已移除的旧配置

项目不再维护 staging/test 远程环境，旧的 **.env.staging** 和 **alicloud.staging.local.ps1** 已删除，避免将“本地测试”和“远程部署”混为一谈。
