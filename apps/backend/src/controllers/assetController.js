const { Asset } = require('../models/Asset');
const { Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const { getRates } = require('../utils/currency');
const { buildBenchmarkCurvePoints } = require('../utils/marketData');
const { calculateCashAndPrincipalCNY } = require('../utils/ledger');
const { round2 } = require('../utils/pnl');
const { upsertTodayDailyProfit, getDateStringInOffset } = require('../utils/dailyProfitBackfill');
const { getMonthStartBaseline } = require('../utils/monthlyBaseline');
const { parseDateInOffset } = require('../utils/datetime');
const { refreshAssetMarketValue } = require('../utils/assetSnapshot');

exports.getSummary = async (req, res) => {
  try {
    res.set('X-Assets-Summary-Logic', process.env.ASSETS_SUMMARY_LOGIC || 'computed-v2');
    const userId = req.user._id;
    const asset = await Asset.findOne({ userId });
    if (!asset) {
      return res.json({
        totalAssets: 0,
        totalProfit: 0,
        totalDailyProfit: 0,
        cash: 0,
        holdingsMarketValue: 0,
        currentPrincipal: 0,
        totalHoldingsCount: 0
      });
    }

    await refreshAssetMarketValue(userId);
    const refreshedAsset = await Asset.findOne({ userId });
    if (!refreshedAsset) {
      return res.json({
        totalAssets: 0,
        totalProfit: 0,
        totalDailyProfit: 0,
        cash: 0,
        holdingsMarketValue: 0,
        currentPrincipal: 0,
        totalHoldingsCount: 0
      });
    }

    const totalProfit = round2((refreshedAsset.totalAssets || 0) - (refreshedAsset.currentPrincipal || 0));

    const dailyProfitDate = await upsertTodayDailyProfit(userId);
    const todaySnapshot = dailyProfitDate ? await DailyProfit.findOne({ userId, date: dailyProfitDate }).lean() : null;
    const totalDailyProfit = Number(todaySnapshot?.dailyProfitAmount) || 0;
    if (dailyProfitDate) res.set('X-ProfitHistory-Date', dailyProfitDate);
    res.json({
      totalAssets: refreshedAsset.totalAssets,
      totalProfit,
      totalDailyProfit,
      cash: refreshedAsset.cash,
      holdingsMarketValue: refreshedAsset.holdingsMarketValue,
      currentPrincipal: refreshedAsset.currentPrincipal,
      totalHoldingsCount: refreshedAsset.totalHoldingsCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getProfitCurve = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    const todayStr = getDateStringInOffset(480);
    let effectiveStart = startDate || null;
    const effectiveEnd = endDate || todayStr;
    if (!effectiveStart && range === 'month') effectiveStart = `${todayStr.slice(0, 7)}-01`;
    if (!effectiveStart && range === 'quarter') {
      const [year, month] = todayStr.split('-').map(Number);
      const startMonthIndex = (year * 12) + (month - 1) - 3;
      const startYear = Math.floor(startMonthIndex / 12);
      const startMonth = (startMonthIndex % 12) + 1;
      effectiveStart = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;
    }
    if (!effectiveStart && range === 'year') effectiveStart = `${todayStr.slice(0, 4)}-01-01`;

    const query = { userId: req.user._id, date: { $lte: effectiveEnd } };
    if (effectiveStart) query.date.$gte = effectiveStart;
    const data = await DailyProfit.find(query).sort({ date: 1 }).lean();
    const firstDate = data[0]?.date;
    const benchmarkStart = effectiveStart || firstDate || effectiveEnd;
    let benchmarkCurve = { benchmarkName: '上证指数', benchmarkSymbol: '000001.SH', pointsByDate: new Map() };
    if (benchmarkStart && effectiveEnd) {
      try { benchmarkCurve = await buildBenchmarkCurvePoints({ startDate: benchmarkStart, endDate: effectiveEnd, market: 'SH' }); } catch (error) { console.error('Failed to build benchmark curve:', error.message); }
    }

    // When a range begins with no prior snapshot, its first plotted point is the zero baseline.
    // Otherwise each stored dailyReturn belongs to that business date and is compounded from the prior snapshot.
    let hasPriorSnapshot = false;
    if (effectiveStart) {
      hasPriorSnapshot = Boolean(await DailyProfit.exists({ userId: req.user._id, date: { $lt: effectiveStart } }));
    }
    let growth = 1;
    const points = data.map((item, index) => {
      if (hasPriorSnapshot || index > 0 || !effectiveStart) growth *= 1 + (Number(item.dailyReturn) || 0) / 100;
      return {
        date: item.date,
        value: Number(((growth - 1) * 100).toFixed(4)),
        benchmark: benchmarkCurve.pointsByDate?.has(item.date) ? benchmarkCurve.pointsByDate.get(item.date) : null,
        valuationQuality: item.valuationQuality || 'partial'
      };
    });
    res.json({ benchmarkName: benchmarkCurve.benchmarkName, benchmarkSymbol: benchmarkCurve.benchmarkSymbol, data: points });
  } catch (error) { res.status(500).json({ message: error.message }); }
};
exports.getProfitCalendar = async (req, res) => {
  try {
    let { year, month } = req.query;
    
    // 如果没有传入参数，默认使用当前年月
    const todayStr = getDateStringInOffset(480);
    const [todayY, todayM, todayD] = todayStr.split('-').map(n => parseInt(n, 10));

    year = parseInt(year || todayY, 10);
    month = parseInt(month || todayM, 10);

    const mm = String(month).padStart(2, '0');
    const startStr = `${year}-${mm}-01`;

    const endStr = (year === todayY && month === todayM)
      ? todayStr
      : new Date(year, month, 0).toISOString().slice(0, 10);

    const [dailyData, baseline] = await Promise.all([
      DailyRevenue.find({
        userId: req.user._id,
        date: { $gte: startStr, $lte: endStr }
      }),
      getMonthStartBaseline(req.user._id, startStr, 480)
    ]);

    const profitByDate = new Map(dailyData.map(d => [d.date, d.revenue]));

    const dailyProfits = {};
    const dailyReturns = Object.fromEntries(dailyData.map(d => [d.date, d.returnRate]));
    const valuationQualityByDate = Object.fromEntries(dailyData.map(d => [d.date, d.valuationQuality]));
    let upDays = 0, downDays = 0, totalProfit = 0;

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = (year === todayY && month === todayM)
      ? new Date(Date.UTC(todayY, todayM - 1, todayD))
      : new Date(Date.UTC(year, month - 1, new Date(year, month, 0).getDate()));

    for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
      const dateStr = d.toISOString().slice(0, 10);
      const profitAmount = Number(profitByDate.get(dateStr) ?? 0);
      dailyProfits[dateStr] = profitAmount;
      if (profitAmount > 0) upDays++;
      else if (profitAmount < 0) downDays++;
      totalProfit += profitAmount;
    }

    const totalDays = upDays + downDays;
    const winRate = totalDays > 0 ? (upDays / totalDays) * 100 : 0;

    const roundedTotalProfit = round2(totalProfit);
    const yieldRate = baseline.monthStartPrincipal > 0
      ? round2((roundedTotalProfit / baseline.monthStartPrincipal) * 100)
      : 0;

    res.json({
      dailyProfits,
      dailyReturns,
      valuationQualityByDate,
      stats: {
        upDays,
        downDays,
        winRate,
        totalProfit: roundedTotalProfit,
        yieldRate,
        monthStartAssets: baseline.monthStartAssets,
        monthStartPrincipal: baseline.monthStartPrincipal
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
