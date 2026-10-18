const { normalizeSymbol } = require('./symbol');

/**
 * 将公司行动应用于按证券汇总的持仓。调用方负责按日期把交易和公司行动交错执行；
 * 此函数只处理已到生效日的行动，不会生成伪造交易或手续费。
 */
const applyCorporateActions = (performanceBySymbol, actions, rates = {}) => {
  for (const action of actions || []) {
    const key = normalizeSymbol(action.symbol);
    const holding = performanceBySymbol.get(key);
    if (!holding) continue;
    const quantity = Number(holding.quantity) || 0;
    const type = String(action.type || '').toUpperCase();
    const quantityChange = Number(action.quantityChange) || 0;
    const cashAmount = Number(action.cashAmount) || 0;
    const rate = rates[action.currency || holding.currency || 'CNY'] || 1;

    if (type === 'SPLIT' || type === 'REVERSE_SPLIT') {
      const numerator = Number(action.ratioNumerator) || 0;
      const denominator = Number(action.ratioDenominator) || 0;
      if (quantity > 0 && numerator > 0 && denominator > 0) {
        const factor = numerator / denominator;
        holding.quantity = quantity * factor;
        holding.avgCost = (Number(holding.avgCost) || 0) / factor;
      }
    } else if (type === 'STOCK_DIVIDEND' || type === 'BONUS_ISSUE') {
      if (quantityChange > 0) {
        holding.quantity = quantity + quantityChange;
        holding.avgCost = holding.quantity > 0 ? ((Number(holding.totalBuyCost) || 0) - (Number(holding.totalSellProceed) || 0)) / holding.quantity : 0;
      }
    } else if (type === 'RIGHTS_ISSUE') {
      if (quantityChange > 0) {
        holding.quantity = quantity + quantityChange;
        holding.totalBuyCost = (Number(holding.totalBuyCost) || 0) + cashAmount;
        holding.avgCost = holding.quantity > 0 ? ((Number(holding.totalBuyCost) || 0) - (Number(holding.totalSellProceed) || 0)) / holding.quantity : 0;
      }
    } else if (type === 'CASH_DIVIDEND') {
      holding.realizedProfitCNY = (Number(holding.realizedProfitCNY) || 0) + cashAmount * rate;
      holding.cashDividendCNY = (Number(holding.cashDividendCNY) || 0) + cashAmount * rate;
    }
  }
  return performanceBySymbol;
};

module.exports = { applyCorporateActions };
