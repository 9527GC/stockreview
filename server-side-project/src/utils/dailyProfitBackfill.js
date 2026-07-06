const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const { Asset } = require('../models/Asset');
const { Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const { getRates } = require('./currency');
const { getStockHistoricalQuotesMap } = require('./historicalQuotes');
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

const getNextDateStr = (dateStr) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
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

/**
 * 统一回填 DailyProfit / DailyRevenue
 * 计算口径：
 * - 每日盈亏只反映投资组合的市值变化，不包含资金转入转出（Transfer）
 * - dailyProfitAmount = 今日总资产 - 昨日总资产 - 今日净资金流入
 * - dailyReturn = dailyProfitAmount / 昨日总资产 * 100
 * - cumulativeReturn = (今日总资产 - 本金) / 本金 * 100
 * - cumulativeProfitAmount = 今日总资产 - 本金
 */
const backfillDailyProfit = async (userId, startDateStr, offsetMinutes = DEFAULT_OFFSET_MINUTES) => {
  const todayStr = getDateStringInOffset(offsetMinutes);

  if (!startDateStr || startDateStr > todayStr) {
    return { success: true, updatedCount: 0, skippedCount: 0 };
  }

  const [rates, transfers, tradesAsc] = await Promise.all([
    getRates(),
    Transfer.find({ userId }).sort({ date: 1 }),
    Trade.find({ userId }).sort({ date: 1, _id: 1 })
  ]);

  const dateStrOf = (date) => getDateStringInOffset(offsetMinutes, date);

  const firstTradeDate = tradesAsc.length > 0 ? dateStrOf(tradesAsc[0].date) : null;
  const firstTransferDate = transfers.length > 0 ? dateStrOf(transfers[0].date) : null;
  const earliestDate = [firstTradeDate, firstTransferDate, startDateStr].filter(Boolean).sort()[0];

  // P2 增量回填：
  // 若已有缓存数据比 earliestDate 新（含相等），说明从 earliestDate 到 lastExisting.date
  // 的历史收益可能已经过时（例如补录了更早的交易），需要从 earliestDate 开始重新计算，
  // 并取 earliestDate 前一天的缓存作为 prevTotalAssets；
  // 若 lastExisting 早于 earliestDate，则其 totalAssets 可作为 prevTotalAssets。
  const lastExisting = await DailyProfit.findOne({ userId }).sort({ date: -1 }).lean();
  let prevTotalAssets = null;
  let recomputeStartDate = earliestDate;
  if (lastExisting && lastExisting.date >= earliestDate) {
    const prevDateStr = getPreviousDateStr(earliestDate);
    const prevRecord = await DailyProfit.findOne({ userId, date: prevDateStr }).lean();
    prevTotalAssets = prevRecord ? Number(prevRecord.totalAssets) || null : null;
    recomputeStartDate = earliestDate;
  } else if (lastExisting) {
    prevTotalAssets = Number(lastExisting.totalAssets) || null;
  }

  // 只生成需要回填的日期
  const dates = getDatesBetween(recomputeStartDate, todayStr);
  if (dates.length === 0) {
    return { success: true, updatedCount: 0, skippedCount: 0 };
  }

  const netTransferFlowOnDate = (dateStr) => {
    let net = 0;
    transfers.forEach((t) => {
      if (dateStrOf(t.date) !== dateStr) return;
      const currency = t.currency || 'CNY';
      const rate = rates[currency] || 1;
      const amountCNY = (Number(t.amount) || 0) * rate;
      net += t.type === 'IN' ? amountCNY : -amountCNY;
    });
    return net;
  };

  const currentHoldings = new Map();
  const dailyProfits = [];
  const dailyRevenues = [];
  let tradeIndex = 0;

  for (const dateStr of dates) {
    // 应用截至当前交易日（含）的所有交易
    while (tradeIndex < tradesAsc.length && dateStrOf(tradesAsc[tradeIndex].date) <= dateStr) {
      applyTradeToHoldings(currentHoldings, tradesAsc[tradeIndex]);
      tradeIndex++;
    }

    const dayStart = parseDateInOffset(`${dateStr} 00:00:00`, offsetMinutes);
    const dayTransfers = transfers.filter(t => dateStrOf(t.date) <= dateStr);
    const dayTrades = tradesAsc.slice(0, tradeIndex);

    const { cashCNY, principalCNY } = calculateCashAndPrincipalCNY({
      transfers: dayTransfers,
      trades: dayTrades,
      rates
    });

    const symbolsOnDate = Array.from(currentHoldings.keys());
    let holdingsMarketValue = 0;
    const missingQuoteSymbols = [];

    if (symbolsOnDate.length > 0) {
      const quotes = await getStockHistoricalQuotesMap(symbolsOnDate, dateStr);

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
    const totalAssets = round2(cashCNY + holdingsMarketValue);

    // 今日净资金流入需要从收益中剔除
    const transferFlow = round2(netTransferFlowOnDate(dateStr));
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
      cash: round2(cashCNY),
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
    startDate: earliestDate,
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
