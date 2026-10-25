# 仓库维护与清理记录

核对日期：2026-10-25。

## 本次清理

| 文件 | 依据 |
|------|------|
| apps/backend/scripts/create-user.js | 无代码或文档引用；固定账号密码的一次性用户创建脚本，现有注册接口可承担注册 |
| apps/backend/scripts/create_user.js | 同类重复脚本，硬编码本机数据库和账号密码 |
| apps/frontend/shims-uni.d.ts | tsconfig 仅收集 src 内声明；src/shime-uni.d.ts 已提供 Vue 组件声明 |
| apps/miniapp/project.private.config.json | 微信开发者工具个人设置，停止跟踪并忽略，保留本机副本 |
| 根目录六个 backend/frontend dev/test 日志 | 9 月遗留且已被 Git 忽略的运行日志，删除本机副本 |
| apps/backend/coverage | 可再生成的旧测试覆盖率产物，验证结束后清理 |

## 保留依据

- 两套公司行动接口及其组件都被使用，职责和枚举不同。
- scripts 中迁移、核验、快照及冒烟脚本属于维护入口，无静态调用不代表无用；不自动执行这些脚本。
- akshare_a_share_breadth.py 与 scripts/data/a_share_codes.json 被行情模块使用。
- tests/specifications 和 superpowers 设计/计划保留历史业务口径，不能作为当前功能承诺或通过的回归。
- .runtime/production-baseline 包含回滚归档和验证记录，保留；其他运行目录、依赖、前端 dist、头像 uploads、本机环境文件和私钥也保留。
- logo.png 是 HTML 的备用图标；部署脚本和 CI 有独立用途。

## 后续规则

先查路由、导入、构建配置和文档引用，再判断是否删除；命令行维护脚本还需确认业务用途。个人设置、密钥、环境文件、日志和构建产物不提交。清理后运行回归、构建和差异检查；双远端普通推送，不强制覆盖远端历史。

## 本次验证

后端 23 个测试套件、126 项测试通过；前端 9 个文件、69 项测试通过，H5 生产构建通过；小程序 5 项测试通过。后端 lint 为 0 错误、33 条已有警告。构建仍提示 Vite CommonJS 接口弃用及运行时 config.js 无 module 属性；不影响本次构建完成。
