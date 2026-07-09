const { Asset } = require('../models/Asset');
const { Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const { getRates } = require('../utils/currency');
const { buildBenchmarkCurvePoints } = require('../utils/marketData');
const { calculateCashAndPrincipalCNY } = require('../utils/ledger');
const { round2 } = require('../utils/pnl');
const { calculateTotalDailyProfitCNY } = require('../utils/dailyProfit');
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
    const totalDailyProfit = await calculateTotalDailyProfitCNY(userId);
    const dailyProfitDate = await upsertTodayDailyProfit(userId);
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
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    let effectiveStart = null;
    let effectiveEnd = todayStr;

    if (startDate && endDate) {
      effectiveStart = startDate;
      effectiveEnd = endDate;
    } else if (range) {
      if (range === 'month') {
        effectiveStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      } else if (range === 'quarter') {
        effectiveStart = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
      } else if (range === 'year') {
        effectiveStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      } else if (range === 'all') {
        effectiveStart = null;
      }
    }

    let query = { userId: req.user._id };
    if (effectiveStart) {
      query.date = { $gte: effectiveStart, $lte: effectiveEnd };
    } else if (effectiveEnd) {
      query.date = { $lte: effectiveEnd };
    }

    const data = await DailyProfit.find(query).sort({ date: 1 });
    const curveDates = data.map((item) => item.date).filter(Boolean);
    const firstDataDate = curveDates[0];
    const lastDataDate = curveDates[curveDates.length - 1];

    // 以所选范围起点前一日的总资产为归一化基准；若起点就是第一条数据日，
    // 没有前一日记录，则用本金（总资产 - 累计盈亏）作为基准。
    const baselineDate = effectiveStart || firstDataDate || effectiveEnd;
    let rangeStartTotalAssets = null;
    if (baselineDate) {
      const prevDateStr = new Date(Date.parse(baselineDate) - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const startRecord = await DailyProfit.findOne({
        userId: req.user._id,
        date: { $lte: prevDateStr }
      }).sort({ date: -1 });

      if (startRecord) {
        rangeStartTotalAssets = startRecord.totalAssets;
      } else if (firstDataDate) {
        const firstRecord = data[0];
        rangeStartTotalAssets = (firstRecord?.totalAssets ?? 0) - (firstRecord?.cumulativeProfitAmount ?? 0);
      }
    }

    // 上证指数同样以所选范围起点为基准
    const benchmarkStart = effectiveStart || firstDataDate || effectiveEnd;
    const benchmarkEnd = effectiveEnd || lastDataDate || todayStr;

    let benchmarkCurve;
    try {
      benchmarkCurve = (benchmarkStart && benchmarkEnd)
        ? await buildBenchmarkCurvePoints({ startDate: benchmarkStart, endDate: benchmarkEnd, market: 'SH' })
        : { benchmarkName: '上证指数', benchmarkSymbol: '000001.SH', pointsByDate: new Map() };
    } catch (e) {
      console.error('Failed to build benchmark curve:', e.message);
      benchmarkCurve = { benchmarkName: '上证指数', benchmarkSymbol: '000001.SH', pointsByDate: new Map() };
    }

    res.json({
      benchmarkName: benchmarkCurve.benchmarkName,
      benchmarkSymbol: benchmarkCurve.benchmarkSymbol,
      data: data.map(d => {
        const normalizedValue = (rangeStartTotalAssets > 0)
          ? Number(((((d.totalAssets || 0) / rangeStartTotalAssets) - 1) * 100).toFixed(4))
          : null;
        return {
          date: d.date,
          value: normalizedValue,
          benchmark: benchmarkCurve.pointsByDate.has(d.date)
            ? benchmarkCurve.pointsByDate.get(d.date)
            : null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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
