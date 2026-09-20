# 公司行动自动重算功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以将分红、拆分、送股、配股作为独立流水维护；新增、编辑、删除后自动刷新持仓、成本及收益统计。

**Architecture:** 后端新增 `CorporateAction` 独立模型和受保护的 CRUD API。重建持仓时，将交易与公司行动按生效日期合并为时间线：现金分红只计入收益，拆分/送转按比例更新数量和单位成本，配股作为数量与现金成本变动；随后复用既有脏数据回算机制更新统计。前端在资产页提供公司行动管理入口及表单。

**Tech Stack:** Node.js、Express、Mongoose、Jest、Vue 3 / uni-app。

**Spec:** 用户于 2026-09-20 确认的公司行动模块设计。

## Global Constraints

- 普通买入/卖出流水只保存真实成交，拆分不得伪造为 0 元买入。
- 支持 CNY、HKD、USD，并保存原始币种。
- 公司行动必须含用户、证券、日期和类型；同一用户同一证券同一天只能有一条记录，不需要来源标识。
- 已有收益回算机制必须在公司行动新增、编辑、删除后触发。
- 所有新增业务逻辑先写失败测试，再实现。

---

### Task 1: 公司行动模型和重算工具

**Files:**
- Create: `apps/backend/src/models/CorporateAction.js`
- Create: `apps/backend/src/utils/corporateActions.js`
- Test: `apps/backend/tests/corporateActions.test.js`

- [ ] 为拆分、现金分红、送股/转增、配股写失败测试。
- [ ] 实现按时间排序的公司行动应用函数。
- [ ] 运行测试确认通过。

### Task 2: 后端 CRUD 与持仓重建集成

**Files:**
- Create: `apps/backend/src/controllers/corporateActionController.js`
- Create: `apps/backend/src/routes/corporateActionRoutes.js`
- Modify: `apps/backend/src/controllers/tradeController.js`
- Modify: `apps/backend/src/index.js`
- Test: `apps/backend/tests/corporateActionApi.test.js`

- [ ] 为创建、读取、更新、删除、去重和自动重算写失败 API 测试。
- [ ] 实现模型、验证、API 路由和重算触发。
- [ ] 将公司行动应用到持仓重建流程。
- [ ] 运行后端测试确认通过。

### Task 3: 前端管理入口

**Files:**
- Create: `apps/frontend/src/components/CorporateActionModal.vue`
- Modify: `apps/frontend/src/api/index.js`
- Modify: `apps/frontend/src/pages/assets/index.vue`
- Test: 前端构建验证。

- [ ] 增加公司行动列表、新增、编辑和删除入口。
- [ ] 支持现金分红、拆分/合并、送转、配股表单字段和影响说明。
- [ ] 运行前端测试与构建确认通过。

### Task 4: 文档和验收

**Files:**
- Modify: `docs/apidoc.md`

- [ ] 记录公司行动 API、字段和自动重算规则。
- [ ] 用 159516.SZ 的 1 拆 2 场景验证：数量翻倍、总成本不变、无交易费用。
- [ ] 运行全部测试、lint 和构建。

