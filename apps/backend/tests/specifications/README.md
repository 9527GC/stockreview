# 尚未上线功能的测试规格

这些文件从同步前的本地测试保留而来，不属于当前生产基线的已实现接口，默认 Jest testMatch 不收集 *.specification.js。

- ledger：锁定汇率、固定清算金额、分币种现金。
- money / portfolioValuation：旧本地估值改造专用工具，生产基线没有这些模块。
- resetUserBusinessData：未部署的数据清理脚本。
- standardCost：标准加权成本与锁定汇率，当前生产采用摊薄成本。

原有 trade、transfer、assetSnapshot、metricsEndToEnd 测试已按生产人民币估值口径改写，继续验证真实金额、持仓和资金流。未上线字段的预期不代表当前产品承诺。
这些规格被明确归档，不能计为通过的测试。恢复对应功能时，应将规格移回默认测试集并修正实现。
同步前完整测试还保存在 .runtime/production-baseline/local-backend-before.tgz。
