const { round2 } = require('./pnl');
const { normalizeSymbol } = require('./symbol');
const { portfolioEvents } = require('./portfolioEvents');
const { applyCorporateActions } = require('./corporateActions');

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
const calculateDilutedPerformance = ({ trades, rates = {}, actions = [], strict = false }) => {
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

  portfolioEvents(trades, actions).forEach(({ record: t, kind }) => {
    if (kind === 'action') {
      applyCorporateActions(bySymbol, [t], rates);
      return;
    }
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
      if (strict && qty > agg.quantity + 1e-8) throw new RangeError('Sell quantity exceeds holding quantity');
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

/**
 * 按持仓归零事件对交易记录进行分仓分组。
 *
 * 算法说明：
 *   - 按 date 升序、_id 升序遍历交易；
 *   - 维护累计持仓数量 runningQty；
 *   - 当持仓数量归零时，当前分仓闭合，计算该次清仓的实现盈亏；
 *   - 每一笔新的买入（在 runningQty 为 0 后）开启新的分仓；
 *   - 若出现超卖导致 runningQty < 0，则钳位到 0 并标记 hasAnomaly。
 *
 * @param {Object} params
 * @param {Array} params.trades 单只股票的交易记录
 * @param {Object} params.rates 汇率映射
 * @returns {Array} 分仓分组数组
 */
const calculatePositionZeroGroups = ({ trades, rates = {}, actions = [] }) => {
  if (!Array.isArray(trades)) return [];

  const groups = [];
  let runningQty = 0;
  let currentGroup = null;
  let groupIndex = 0;

  const sortedTrades = portfolioEvents(trades, actions);

  sortedTrades.forEach(({ record: t, kind }) => {
    if (kind === 'action') {
      if (!currentGroup) return;
      const performance = new Map([[normalizeSymbol(t.symbol), {
        quantity: runningQty, avgCost: 0,
        totalBuyCost: currentGroup.totalBuyCost, totalSellProceed: currentGroup.totalSellProceed
      }]]);
      applyCorporateActions(performance, [t], rates);
      runningQty = performance.get(normalizeSymbol(t.symbol)).quantity;
      if (t.type === 'RIGHTS_ISSUE') currentGroup.totalBuyCost += Number(t.cashAmount) || 0;
      if (t.type === 'CASH_DIVIDEND') currentGroup.totalSellProceed += Number(t.cashAmount) || 0;
      return;
    }
    const type = String(t.type || '').toUpperCase();
    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;
    const commission = Number(t.commission) || 0;
    const currency = t.currency || 'CNY';
    const rate = rates[currency] || 1;

    // 持仓归零后，下一笔交易开启新分仓
    if (runningQty === 0 && !currentGroup) {
      groupIndex += 1;
      currentGroup = {
        groupId: `${normalizeSymbol(t.symbol)}:${groupIndex}`,
        startDate: t.date,
        endDate: t.date,
        currency,
        totalBuyCost: 0,
        totalSellProceed: 0,
        trades: [],
        hasAnomaly: false
      };
    }

    if (!currentGroup) {
      return;
    }

    currentGroup.trades.push(t);
    currentGroup.endDate = t.date;
    currentGroup.currency = currency;

    if (type === 'BUY') {
      currentGroup.totalBuyCost += price * qty + commission;
      runningQty += qty;
    } else if (type === 'SELL') {
      currentGroup.totalSellProceed += price * qty - commission;
      runningQty -= qty;
    }

    if (runningQty < 0) {
      runningQty = 0;
      currentGroup.hasAnomaly = true;
    }

    if (runningQty === 0 && currentGroup) {
      const buyCNY = currentGroup.totalBuyCost * rate;
      const sellCNY = currentGroup.totalSellProceed * rate;
      const realizedProfit = round2(sellCNY - buyCNY);
      const profitRate = buyCNY > 0 ? parseFloat((realizedProfit / buyCNY).toFixed(4)) : 0;

      groups.push({
        groupId: currentGroup.groupId,
        startDate: currentGroup.startDate,
        endDate: currentGroup.endDate,
        currency: currentGroup.currency,
        realizedProfit,
        totalBuyCost: round2(buyCNY),
        profitRate,
        tradesCount: currentGroup.trades.length,
        hasAnomaly: currentGroup.hasAnomaly,
        trades: currentGroup.trades.map((trade) => ({
          id: trade._id,
          symbol: trade.symbol,
          name: trade.name,
          stockName: trade.name,
          date: trade.date,
          type: trade.type,
          price: trade.price,
          quantity: trade.quantity,
          commission: trade.commission,
          currency: trade.currency,
          market: trade.market,
          mood: trade.mood,
          logic: trade.logic ?? null,
          isSystemCompliant: trade.isSystemCompliant ?? null,
          cognitiveBias: trade.cognitiveBias ?? null,
          improvementMeasures: trade.improvementMeasures ?? null
        }))
      });

      currentGroup = null;
    }
  });

  return groups;
};

module.exports = {
  calculateDilutedPerformance,
  calculateDilutedProfits,
  calculatePositionZeroGroups
};
