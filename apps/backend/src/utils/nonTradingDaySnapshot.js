const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const { Trade, Holding } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const { CorporateAction } = require('../models/CorporateAction');
const CompanyAction = require('../models/CompanyAction');
const { getRates } = require('./currency');
const { round2 } = require('./pnl');
const { calculateModifiedDietzReturn } = require('./dailyPerformance');
const { getQuotes } = require('./marketData');
const { getQuoteDateKeyInOffset } = require('./dailyProfit');
const { getDayRangeInOffset } = require('./datetime');

// 没有当日报价和持仓事件时，沿用昨日估值并计入资金流，避免将估值口径差额记成今日收益。
async function carryInactiveDaySnapshot(userId, dateStr, offsetMinutes = 480) {
  const { start, end } = getDayRangeInOffset(offsetMinutes, new Date(dateStr + 'T12:00:00Z'));
  const eventQuery = { userId, date: { $gte: start, $lt: end } };
  const [trade, transfers, action, companyAction] = await Promise.all([
    Trade.exists(eventQuery), Transfer.find(eventQuery).lean(), CorporateAction.exists(eventQuery), CompanyAction.exists(eventQuery)
  ]);
  if (trade || action || companyAction) return false;

  const previousDate = new Date(Date.parse(dateStr) - 86400000).toISOString().slice(0, 10);
  const [profit, revenue, holdings] = await Promise.all([
    DailyProfit.findOne({ userId, date: previousDate }).lean(),
    DailyRevenue.findOne({ userId, date: previousDate }).lean(),
    Holding.find({ userId }).select('symbol').lean()
  ]);
  // 两份昨日快照必须齐全，才能保持资产、现金及累计指标一致。
  if (!profit || !revenue) return false;
  const symbols = holdings.map(h => h.symbol);
  const quotes = symbols.length ? await getQuotes(symbols) : {};
  if (symbols.some(symbol => {
    const quote = quotes[symbol] || Object.values(quotes).find(q => q?.symbol === symbol);
    return getQuoteDateKeyInOffset(quote, symbol, offsetMinutes) === dateStr;
  })) return false;

  const rates = transfers.length ? await getRates() : {};
  const flows = transfers.map(transfer => {
    const lockedAmount = Number(transfer.amountCNY);
    const rate = Number(transfer.fxRateToCNY) || rates[transfer.currency || 'CNY'] || 1;
    const amount = Number.isFinite(lockedAmount) && lockedAmount > 0 ? lockedAmount : Number(transfer.amount) * rate;
    return { amountCNY: (transfer.type === 'IN' ? 1 : -1) * amount, occurredAt: transfer.date };
  });
  const externalNetFlow = round2(flows.reduce((sum, flow) => sum + flow.amountCNY, 0));
  const totalAssets = round2(Number(profit.totalAssets) + externalNetFlow);
  const { weightedFlowCNY } = calculateModifiedDietzReturn({ openingAssetsCNY: profit.totalAssets,
    closingAssetsCNY: totalAssets, flows, dayStart: start, dayEnd: end });
  const quality = profit.valuationQuality === 'partial' || revenue.valuationQuality === 'partial' ? 'partial' : 'stale';
  const shared = { totalAssets, externalNetFlow, weightedFlowCNY,
    valuationQuality: quality, source: quality === 'partial' ? 'partial' : 'cached', isDirty: false };
  await DailyProfit.updateOne({ userId, date: dateStr }, { $set: { ...shared,
    dailyReturn: 0, dailyProfitAmount: 0, cumulativeReturn: profit.cumulativeReturn,
    cumulativeProfitAmount: profit.cumulativeProfitAmount } }, { upsert: true, strict: false });
  await DailyRevenue.updateOne({ userId, date: dateStr }, { $set: { ...shared,
    revenue: 0, returnRate: 0, cumulativeRevenue: revenue.cumulativeRevenue,
    cumulativeReturnRate: revenue.cumulativeReturnRate, cash: round2(Number(revenue.cash) + externalNetFlow),
    holdingsMarketValue: revenue.holdingsMarketValue } }, { upsert: true, strict: false });
  return true;
}

module.exports = { carryInactiveDaySnapshot };
