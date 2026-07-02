const { round2 } = require('./pnl');
const { normalizeSymbol } = require('./symbol');

/**
 * 按摊薄持仓成本法计算每只股票的成本和盈亏。
 *
 * 算法（以原始币种计算）：
 *   累计买入清算金额 = Σ(买入数量 × 买入价格 + 买入手续费)
 *   累计卖出清算金额 = Σ(卖出数量 × 卖出价格 − 卖出手续费)
 *   摊薄持仓成本 = (累计买入清算金额 − 累计卖出清算金额) / 当前持股数
 *
 * 说明：
 *   - 卖出盈利会摊薄剩余持仓成本，卖出亏损会提高剩余持仓成本；
 *   - 全部清仓后，该股票 avgCost 不存在；
 *   - 清仓时的累计盈亏（CNY） = 累计卖出清算金额（CNY） − 累计买入清算金额（CNY）。
 *
 * @param {Object} params
 * @param {Array} params.trades 按时间升序排列的交易记录
 * @param {Object} params.rates 汇率映射，如 { CNY: 1, HKD: 0.91, USD: 7.23 }
 * @returns {Map<string, Object>} key 为 normalizeSymbol(symbol)，value 为绩效对象
 */
const calculateDilutedPerformance = ({ trades, rates }) => {
  const bySymbol = new Map();

  const ensure = (symbol) => {
    const key = normalizeSymbol(symbol);
    if (!bySymbol.has(key)) {
      bySymbol.set(key, {
        symbol: key,
        name: key,
        quantity: 0,
        avgCost: 0,            // 原始币种摊薄成本
        totalBuyCost: 0,       // 累计买入清算金额（原始币种）
        totalSellProceed: 0,   // 累计卖出清算金额（原始币种）
        totalBuyQty: 0,        // 累计买入数量
        totalSellQty: 0,       // 累计卖出数量
        currency: 'CNY',
        realizedProfitCNY: 0,  // 清仓后/历史已实现盈亏
        lastTradeDate: null,
        tradesCount: 0
      });
    }
    return bySymbol.get(key);
  };

  (trades || []).forEach((t) => {
    const agg = ensure(t.symbol);
    agg.tradesCount += 1;
    if (t.name) agg.name = t.name;
    agg.lastTradeDate = t.date;
    agg.currency = t.currency || agg.currency || 'CNY';

    const currency = t.currency || 'CNY';
    const rate = rates[currency] || 1;
    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const commission = Number(t.commission) || 0;

    if (t.type === 'BUY') {
      const buyAmount = price * qty;
      agg.totalBuyCost += buyAmount + commission;
      agg.totalBuyQty += qty;
      agg.quantity += qty;
    } else if (t.type === 'SELL') {
      const sellAmount = price * qty;
      agg.totalSellProceed += sellAmount - commission;
      agg.totalSellQty += qty;
      agg.quantity = Math.max(0, agg.quantity - qty);
    }

    // 重新计算摊薄成本（原始币种）
    if (agg.quantity > 0) {
      agg.avgCost = (agg.totalBuyCost - agg.totalSellProceed) / agg.quantity;
    } else {
      // 全部清仓，成本不存在，累计已实现盈亏，并重置累计买入/卖出金额
      agg.avgCost = 0;
      const buyCNY = agg.totalBuyCost * rate;
      const sellCNY = agg.totalSellProceed * rate;
      agg.realizedProfitCNY += sellCNY - buyCNY;
      // 保留清仓前的总买入成本，用于历史持仓收益率计算
      agg.closedTotalBuyCost = agg.totalBuyCost;
      agg.closedTotalSellProceed = agg.totalSellProceed;
      agg.totalBuyCost = 0;
      agg.totalSellProceed = 0;
      agg.totalBuyQty = 0;
      agg.totalSellQty = 0;
    }
  });

  return bySymbol;
};

/**
 * 基于摊薄成本法计算当前持仓的未实现盈亏、累计盈亏（CNY）。
 *
 * @param {Object} params
 * @param {number} params.currentPrice 当前价格（原始币种）
 * @param {number} params.quantity 当前持股数
 * @param {number} params.avgCost 摊薄持仓成本（原始币种）
 * @param {number} params.rate 汇率
 * @returns {Object} { unrealizedProfit, cumulativeProfit, realizedProfit }
 */
const calculateDilutedProfits = ({
  currentPrice,
  quantity,
  avgCost,
  rate = 1
}) => {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || quantity <= 0) {
    return { unrealizedProfit: 0, cumulativeProfit: 0, realizedProfit: 0 };
  }

  const marketValueCNY = currentPrice * quantity * rate;
  const costBasisCNY = avgCost * quantity * rate;

  // 摊薄法下，当前持仓的累计盈亏 = 未实现盈亏
  const unrealizedProfit = round2(marketValueCNY - costBasisCNY);

  return {
    unrealizedProfit,
    cumulativeProfit: unrealizedProfit,
    realizedProfit: 0
  };
};

module.exports = {
  calculateDilutedPerformance,
  calculateDilutedProfits
};
