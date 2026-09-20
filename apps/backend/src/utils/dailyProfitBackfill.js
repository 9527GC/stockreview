const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const { Asset } = require('../models/Asset');
const { Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const { CorporateAction } = require('../models/CorporateAction');
const { getRates } = require('./currency');
const { getQuotesForRange } = require('./historicalQuoteCache');
const { calculateCashAndPrincipalCNY } = require('./ledger');
const { round2 } = require('./pnl');
const { normalizeSymbol } = require('./symbol');
const { parseDateInOffset } = require('./datetime');
const { getDateStringInOffset } = require('./dailyProfit');

const DEFAULT_OFFSET_MINUTES = 480; // Beijing Time

const getDatesBetween = (startDateStr, endDateStr) => {
  const dates = [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
};

const getPreviousDateStr = (dateStr) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
};

const applyTradeToHoldings = (holdings, trade) => {
  const symbol = normalizeSymbol(trade.symbol);
  const qty = Number(trade.quantity) || 0;
  const price = Number(trade.price) || 0;
  const commission = Number(trade.commission) || 0;

  if (trade.type === 'BUY') {
    const existing = holdings.get(symbol);
    if (existing) {
      const totalCost = existing.quantity * existing.avgCost + qty * price + commission;
      const totalQty = existing.quantity + qty;
      existing.avgCost = totalQty > 0 ? totalCost / totalQty : 0;
      existing.quantity = totalQty;
    } else {
      holdings.set(symbol, {
        symbol,
        name: trade.name || symbol,
        quantity: qty,
        avgCost: qty > 0 ? (price * qty + commission) / qty : 0,
        currency: trade.currency || 'CNY'
      });
    }
  } else if (trade.type === 'SELL') {
    const existing = holdings.get(symbol);
    if (existing) {
      existing.quantity = Math.max(0, existing.quantity - qty);
      if (existing.quantity === 0) {
        holdings.delete(symbol);
      }
    }
  }
};


const applyCorporateActionToHoldings = (holdings, action) => {
  const symbol = normalizeSymbol(action.symbol);
  const holding = holdings.get(symbol);
  if (!holding) return;
  const type = String(action.type || '').toUpperCase();
  const quantityChange = Number(action.quantityChange) || 0;
  const cashAmount = Number(action.cashAmount) || 0;
  if (type === 'SPLIT' || type === 'REVERSE_SPLIT') {
    const numerator = Number(action.ratioNumerator) || 0;
    const denominator = Number(action.ratioDenominator) || 0;
    if (numerator > 0 && denominator > 0) {
      const factor = numerator / denominator;
      holding.quantity *= factor;
      holding.avgCost /= factor;
    }
  } else if ((type === 'STOCK_DIVIDEND' || type === 'BONUS_ISSUE') && quantityChange > 0) {
    const totalCost = holding.quantity * holding.avgCost;
    holding.quantity += quantityChange;
    holding.avgCost = holding.quantity > 0 ? totalCost / holding.quantity : 0;
  } else if (type === 'RIGHTS_ISSUE' && quantityChange > 0) {
    const totalCost = holding.quantity * holding.avgCost + cashAmount;
    holding.quantity += quantityChange;
    holding.avgCost = holding.quantity > 0 ? totalCost / holding.quantity : 0;
  }
};

/**
 * 统一回填 DailyProfit / DailyRevenue
 * 计算口径：
 * - 每日盈亏只反映投资组合的市值变化，不包含资金转入转出（Transfer）
 * - dailyProfitAmount = 今日总资产 - 昨日总资产 - 今日净资金流入
 * - dailyReturn = dailyProfitAmount / 昨日总资产 * 100
 * - cumulativeReturn = (今日总资产 - 本金) / 本金 * 100
 * - cumulativeProfitAmount = 今日总资产 - 本金
 *
 * 优化点：
 * 1. 优先使用 startDateStr 前一天的缓存作为起点，只回填从 startDateStr 到今日的窗口
 * 2. 现金/本金使用增量累加，避免每天重复全量计算
 * 3. 历史行情通过 HistoricalQuote 缓存批量获取，减少外部请求
 */
const backfillDailyProfit = async (userId, startDateStr, offsetMinutes = DEFAULT_OFFSET_MINUTES) => {
  const todayStr = getDateStringInOffset(offsetMinutes);

  if (!startDateStr || startDateStr > todayStr) {
    return { success: true, updatedCount: 0, skippedCount: 0 };
  }

  const [rates, transfers, tradesAsc, actionsAsc] = await Promise.all([
    getRates(),
    Transfer.find({ userId }).sort({ date: 1 }),
    Trade.find({ userId }).sort({ date: 1, _id: 1 }),
    CorporateAction.find({ userId }).sort({ date: 1, _id: 1 })
  ]);

  const dateStrOf = (date) => getDateStringInOffset(offsetMinutes, date);

  const currentHoldings = new Map();
  let cashCNY = 0;
  let principalCNY = 0;
  let prevTotalAssets = null;
  let tradeIndex = 0;
  let actionIndex = 0;
  let recomputeStartDate = startDateStr;

  // 尝试使用 startDateStr 前一天的缓存作为起点，实现增量回填
  const prevDateStr = getPreviousDateStr(startDateStr);
  const prevRecord = await DailyProfit.findOne({ userId, date: prevDateStr }).lean();

  if (prevRecord) {
    prevTotalAssets = Number.isFinite(prevRecord.totalAssets) ? Number(prevRecord.totalAssets) : null;

    // 应用截止到前一天的所有交易
    while (tradeIndex < tradesAsc.length && dateStrOf(tradesAsc[tradeIndex].date) <= prevDateStr) {
      applyTradeToHoldings(currentHoldings, tradesAsc[tradeIndex]);
      tradeIndex++;
    }

    while (actionIndex < actionsAsc.length && dateStrOf(actionsAsc[actionIndex].date) <= prevDateStr) {
      applyCorporateActionToHoldings(currentHoldings, actionsAsc[actionIndex]);
      actionIndex++;
    }

    // 截止到前一天的现金与本金
    const upToPrevTransfers = transfers.filter(t => dateStrOf(t.date) <= prevDateStr);
    const upToPrevTrades = tradesAsc.slice(0, tradeIndex);
    const upToPrevActions = actionsAsc.slice(0, actionIndex);
    const ledger = calculateCashAndPrincipalCNY({
      transfers: upToPrevTransfers,
      trades: upToPrevTrades,
      actions: upToPrevActions,
      rates
    });
    cashCNY = ledger.cashCNY;
    principalCNY = ledger.principalCNY;
  } else {
    // 无前一天缓存，回退到全量回填
    const firstTradeDate = tradesAsc.length > 0 ? dateStrOf(tradesAsc[0].date) : null;
    const firstTransferDate = transfers.length > 0 ? dateStrOf(transfers[0].date) : null;
    recomputeStartDate = [firstTradeDate, firstTransferDate, startDateStr].filter(Boolean).sort()[0];
    if (!recomputeStartDate) {
      return { success: true, updatedCount: 0, skippedCount: 0 };
    }
  }

  const dates = getDatesBetween(recomputeStartDate, todayStr);
  if (dates.length === 0) {
    return { success: true, updatedCount: 0, skippedCount: 0 };
  }

  // 按日期分组交易和转账，便于增量更新
  const tradesByDate = new Map();
  for (const trade of tradesAsc) {
    const d = dateStrOf(trade.date);
    if (!tradesByDate.has(d)) tradesByDate.set(d, []);
    tradesByDate.get(d).push(trade);
  }

  const actionsByDate = new Map();
  for (const action of actionsAsc) {
    const d = dateStrOf(action.date);
    if (!actionsByDate.has(d)) actionsByDate.set(d, []);
    actionsByDate.get(d).push(action);
  }

  const transfersByDate = new Map();
  for (const t of transfers) {
    const d = dateStrOf(t.date);
    if (!transfersByDate.has(d)) transfersByDate.set(d, []);
    transfersByDate.get(d).push(t);
  }

  // 收集窗口内所有会用到行情的 symbol
  const symbolsInWindow = new Set(Array.from(currentHoldings.keys()));
  for (const action of actionsAsc) {
    symbolsInWindow.add(normalizeSymbol(action.symbol));
  }
  for (const trade of tradesAsc) {
    symbolsInWindow.add(normalizeSymbol(trade.symbol));
  }

  // 批量预取并缓存窗口内的历史行情
  const quoteMap = await getQuotesForRange(Array.from(symbolsInWindow), recomputeStartDate, todayStr);

  const dailyProfits = [];
  const dailyRevenues = [];

  for (const dateStr of dates) {
    // 公司行动在当日成交前生效。拆分/送转不改变现金；分红增加现金；配股减少现金。
    const dayActions = actionsByDate.get(dateStr) || [];
    for (const action of dayActions) {
      applyCorporateActionToHoldings(currentHoldings, action);
      const rate = rates[action.currency || 'CNY'] || 1;
      const amountCNY = (Number(action.cashAmount) || 0) * rate;
      if (action.type === 'CASH_DIVIDEND') cashCNY += amountCNY;
      if (action.type === 'RIGHTS_ISSUE') cashCNY -= amountCNY;
    }

    // 应用当天交易并同步更新现金
    const dayTrades = tradesByDate.get(dateStr) || [];
    for (const trade of dayTrades) {
      applyTradeToHoldings(currentHoldings, trade);

      const currency = trade.currency || 'CNY';
      const rate = rates[currency] || 1;
      const tradeAmountCNY = (Number(trade.price) || 0) * (Number(trade.quantity) || 0) * rate;
      const commissionCNY = (Number(trade.commission) || 0) * rate;

      if (trade.type === 'BUY') {
        cashCNY -= tradeAmountCNY + commissionCNY;
      } else if (trade.type === 'SELL') {
        cashCNY += tradeAmountCNY - commissionCNY;
      }
    }

    // 应用当天转账并同步更新现金与本金
    const dayTransfers = transfersByDate.get(dateStr) || [];
    let transferFlow = 0;
    for (const t of dayTransfers) {
      const currency = t.currency || 'CNY';
      const rate = rates[currency] || 1;
      const amountCNY = (Number(t.amount) || 0) * rate;

      if (t.type === 'IN') {
        cashCNY += amountCNY;
        principalCNY += amountCNY;
        transferFlow += amountCNY;
      } else if (t.type === 'OUT') {
        cashCNY -= amountCNY;
        principalCNY -= amountCNY;
        transferFlow -= amountCNY;
      }
    }

    const symbolsOnDate = Array.from(currentHoldings.keys());
    let holdingsMarketValue = 0;
    const missingQuoteSymbols = [];

    if (symbolsOnDate.length > 0) {
      const quotes = quoteMap.get(dateStr) || {};

      currentHoldings.forEach((holding) => {
        const symbol = normalizeSymbol(holding.symbol);
        const quote = quotes[symbol];
        const rate = rates[holding.currency] || 1;

        let price = quote?.close || quote?.preClose || null;

        // 历史行情缺失时，用持仓成本兜底，避免把缺失算成暴跌到 0
        if (price === null || price <= 0) {
          price = holding.avgCost || 0;
          missingQuoteSymbols.push(symbol);
        }

        holdingsMarketValue += (price * holding.quantity) * rate;
      });
    }

    holdingsMarketValue = round2(holdingsMarketValue);
    cashCNY = round2(cashCNY);
    principalCNY = round2(principalCNY);
    const totalAssets = round2(cashCNY + holdingsMarketValue);

    // 今日净资金流入需要从收益中剔除
    transferFlow = round2(transferFlow);
    const dailyProfitAmount = prevTotalAssets !== null
      ? round2(totalAssets - prevTotalAssets - transferFlow)
      : 0;
    const dailyReturn = prevTotalAssets !== null && prevTotalAssets > 0
      ? round2((dailyProfitAmount / prevTotalAssets) * 100)
      : 0;
    const cumulativeReturn = principalCNY > 0
      ? round2(((totalAssets - principalCNY) / principalCNY) * 100)
      : 0;
    const cumulativeProfitAmount = round2(totalAssets - principalCNY);

    const source = missingQuoteSymbols.length > 0 ? 'partial' : 'cached';

    dailyProfits.push({
      userId,
      date: dateStr,
      dailyReturn,
      cumulativeReturn,
      dailyProfitAmount,
      cumulativeProfitAmount,
      totalAssets,
      source,
      isDirty: false
    });

    dailyRevenues.push({
      userId,
      date: dateStr,
      revenue: dailyProfitAmount,
      returnRate: dailyReturn,
      cumulativeRevenue: cumulativeProfitAmount,
      cumulativeReturnRate: cumulativeReturn,
      totalAssets,
      cash: cashCNY,
      holdingsMarketValue,
      source,
      isDirty: false
    });

    prevTotalAssets = totalAssets;
  }

  if (dailyProfits.length > 0) {
    const profitOps = dailyProfits.map(item => ({
      updateOne: {
        filter: { userId, date: item.date },
        update: {
          $set: {
            dailyReturn: item.dailyReturn,
            cumulativeReturn: item.cumulativeReturn,
            dailyProfitAmount: item.dailyProfitAmount,
            cumulativeProfitAmount: item.cumulativeProfitAmount,
            totalAssets: item.totalAssets,
            source: item.source,
            isDirty: false
          }
        },
        upsert: true
      }
    }));

    const revenueOps = dailyRevenues.map(item => ({
      updateOne: {
        filter: { userId, date: item.date },
        update: {
          $set: {
            revenue: item.revenue,
            returnRate: item.returnRate,
            cumulativeRevenue: item.cumulativeRevenue,
            cumulativeReturnRate: item.cumulativeReturnRate,
            totalAssets: item.totalAssets,
            cash: item.cash,
            holdingsMarketValue: item.holdingsMarketValue,
            source: item.source,
            isDirty: false
          }
        },
        upsert: true
      }
    }));

    await DailyProfit.bulkWrite(profitOps, { ordered: false });
    await DailyRevenue.bulkWrite(revenueOps, { ordered: false });
  }

  return {
    success: true,
    updatedCount: dailyProfits.length,
    startDate: recomputeStartDate,
    endDate: todayStr
  };
};

/**
 * 更新今日 DailyProfit / DailyRevenue（基于当前资产快照）
 */
const upsertTodayDailyProfit = async (userId, offsetMinutes = DEFAULT_OFFSET_MINUTES) => {
  const dateStr = getDateStringInOffset(offsetMinutes);
  const asset = await Asset.findOne({ userId });
  if (!asset) return null;

  const totalAssets = Number(asset.totalAssets) || 0;
  const principal = Number(asset.currentPrincipal) || 0;
  const cash = Number(asset.cash) || 0;
  const holdingsMarketValue = Number(asset.holdingsMarketValue) || 0;

  const yesterdayStr = new Date(Date.parse(dateStr) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterdayProfit = await DailyProfit.findOne({ userId, date: yesterdayStr });
  const yesterdayTotalAssets = yesterdayProfit ? Number(yesterdayProfit.totalAssets) : principal;

  // 今日资金转入转出不属于投资收益，需要从当日盈亏中剔除
  const todayStart = parseDateInOffset(`${dateStr} 00:00:00`, offsetMinutes);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const todayTransfers = await Transfer.find({
    userId,
    date: { $gte: todayStart, $lt: tomorrowStart }
  });

  const rates = await getRates();
  const transferFlow = round2(todayTransfers.reduce((sum, t) => {
    const rate = rates[t.currency || 'CNY'] || 1;
    const amountCNY = (Number(t.amount) || 0) * rate;
    return sum + (t.type === 'IN' ? amountCNY : -amountCNY);
  }, 0));

  const dailyProfitAmount = yesterdayTotalAssets > 0 ? round2(totalAssets - yesterdayTotalAssets - transferFlow) : 0;
  const dailyReturn = yesterdayTotalAssets > 0 ? round2((dailyProfitAmount / yesterdayTotalAssets) * 100) : 0;
  const cumulativeReturn = principal > 0 ? round2(((totalAssets - principal) / principal) * 100) : 0;
  const cumulativeProfitAmount = round2(totalAssets - principal);

  await DailyProfit.updateOne(
    { userId, date: dateStr },
    {
      $set: {
        dailyReturn,
        cumulativeReturn,
        dailyProfitAmount,
        cumulativeProfitAmount,
        totalAssets,
        source: 'realtime',
        isDirty: false
      }
    },
    { upsert: true }
  );

  await DailyRevenue.updateOne(
    { userId, date: dateStr },
    {
      $set: {
        revenue: dailyProfitAmount,
        returnRate: dailyReturn,
        cumulativeRevenue: cumulativeProfitAmount,
        cumulativeReturnRate: cumulativeReturn,
        totalAssets,
        cash,
        holdingsMarketValue,
        source: 'realtime',
        isDirty: false
      }
    },
    { upsert: true }
  );

  return dateStr;
};

module.exports = {
  backfillDailyProfit,
  upsertTodayDailyProfit,
  getDateStringInOffset
};
