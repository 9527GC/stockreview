const cron = require('node-cron');
const DailyProfit = require('../models/DailyProfit');
const DailyBenchmark = require('../models/DailyBenchmark');
const DailyRevenue = require('../models/DailyRevenue');
const MonthlyStats = require('../models/MonthlyStats');
const Snapshot = require('../models/Snapshot');
const { Trade } = require('../models/Trade');
const Transfer = require('../models/Transfer');
const { Asset } = require('../models/Asset');
const User = require('../models/User');
const { getHistoricalIndexSeries } = require('../utils/marketData');
const { getRates } = require('../utils/currency');
const { parseDateInOffset } = require('../utils/datetime');
const moment = require('moment');

/**
 * 收益曲线计算服务
 * 负责每日凌晨计算并存储前一天的收益数据
 */
class ProfitCurveScheduler {
  constructor() {
    this.isRunning = false;
    this.jobs = [];
  }

  /**
   * 启动定时任务
   * 默认每天凌晨 2:00 执行
   */
  start() {
    console.log('[Scheduler] Starting profit curve scheduler...');
    
    // 每天凌晨 2:00 执行
    const job = cron.schedule('0 2 * * *', async () => {
      console.log('[Scheduler] Running daily profit curve calculation...');
      await this.calculateDailyProfit();
    }, {
      scheduled: true,
      timezone: 'Asia/Shanghai'
    });

    this.jobs.push(job);
    console.log('[Scheduler] Scheduled daily job at 02:00 CST');

    //  also run immediately on startup if needed
    // this.calculateDailyProfit();
  }

  /**
   * 停止定时任务
   */
  stop() {
    console.log('[Scheduler] Stopping profit curve scheduler...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }

  /**
   * 计算每日收益数据
   * 计算前一天的收益数据并存储
   */
  async calculateDailyProfit() {
    if (this.isRunning) {
      console.log('[Scheduler] Previous job still running, skipping...');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 获取前一天日期
      const yesterday = moment().subtract(1, 'days').format('YYYY-MM-DD');
      console.log(`[Scheduler] Calculating profit for ${yesterday}`);

      // 1. 获取上证指数数据
      await this.updateBenchmarkData(yesterday);

      // 2. 获取所有用户
      const users = await User.find({}).select('_id');
      console.log(`[Scheduler] Processing ${users.length} users`);

      // 3. 为每个用户计算收益数据
      for (const user of users) {
        try {
          await this.calculateUserDailyProfit(user._id, yesterday);
        } catch (error) {
          console.error(`[Scheduler] Error calculating profit for user ${user._id}:`, error.message);
        }
      }

      // 4. 更新月度统计
      await this.updateMonthlyStats(yesterday);

      // 5. 检查是否需要创建月度快照
      await this.checkAndCreateMonthlySnapshot(yesterday);

      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Daily calculation completed in ${duration}ms`);

    } catch (error) {
      console.error('[Scheduler] Error in daily calculation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 更新上证指数数据
   */
  async updateBenchmarkData(date) {
    try {
      console.log(`[Scheduler] Updating benchmark data for ${date}`);
      
      // 检查是否已存在
      const existing = await DailyBenchmark.findOne({ date });
      if (existing && existing.source !== 'missing') {
        console.log(`[Scheduler] Benchmark data already exists for ${date}`);
        return;
      }

      // 获取历史数据
      const startDate = moment(date).subtract(5, 'days').format('YYYY-MM-DD');
      const benchmarkData = await getHistoricalIndexSeries('000001.SH', startDate, date);

      if (benchmarkData && benchmarkData.length > 0) {
        // 找到对应日期的数据
        const dayData = benchmarkData.find(d => d.date === date);
        
        if (dayData) {
          // 计算累计涨跌幅（相对于年初或指定基准）
          const yearStart = moment(date).startOf('year').format('YYYY-MM-DD');
          const yearStartData = await DailyBenchmark.findOne({ date: yearStart });
          const baseValue = yearStartData ? yearStartData.close : dayData.close;
          
          const cumulativeChangePercent = ((dayData.close - baseValue) / baseValue) * 100;

          await DailyBenchmark.findOneAndUpdate(
            { date },
            {
              date,
              symbol: '000001.SH',
              name: '上证指数',
              open: dayData.open || dayData.close,
              close: dayData.close,
              high: dayData.high || dayData.close,
              low: dayData.low || dayData.close,
              changePercent: dayData.changePercent || 0,
              cumulativeChangePercent,
              volume: dayData.volume || 0,
              source: 'tencent',
              isTradingDay: true
            },
            { upsert: true, new: true }
          );

          console.log(`[Scheduler] Benchmark data updated for ${date}: ${dayData.close}`);
        } else {
          // 标记为缺失
          await this.markBenchmarkMissing(date);
        }
      } else {
        // 标记为缺失
        await this.markBenchmarkMissing(date);
      }
    } catch (error) {
      console.error(`[Scheduler] Error updating benchmark data:`, error);
      await this.markBenchmarkMissing(date);
    }
  }

  /**
   * 标记上证指数数据缺失
   */
  async markBenchmarkMissing(date) {
    await DailyBenchmark.findOneAndUpdate(
      { date },
      {
        date,
        symbol: '000001.SH',
        name: '上证指数',
        source: 'missing',
        isTradingDay: false
      },
      { upsert: true, new: true }
    );
    console.log(`[Scheduler] Benchmark data marked as missing for ${date}`);
  }

  /**
   * 计算用户每日收益
   */
  async calculateUserDailyProfit(userId, date) {
    console.log(`[Scheduler] Calculating profit for user ${userId} on ${date}`);

    // 获取用户资产数据
    const asset = await Asset.findOne({ userId });
    if (!asset) {
      console.log(`[Scheduler] No asset found for user ${userId}`);
      return;
    }

    // 获取前一天的收益数据（用于计算累计值）
    const prevDate = moment(date).subtract(1, 'days').format('YYYY-MM-DD');
    const prevProfit = await DailyProfit.findOne({ userId, date: prevDate });
    const prevRevenue = await DailyRevenue.findOne({ userId, date: prevDate });

    // 计算当日收益率
    // 如果有前一天数据，计算日收益率；否则从资产创建开始计算
    let dailyReturn;
    let dailyProfitAmount;

    const principal = asset.currentPrincipal || 1;
    const prevTotalAssets = prevProfit ? (prevProfit.totalAssets || principal) : principal;
    const currentTotalAssets = asset.totalAssets || prevTotalAssets;

    // 当日资金转入转出不属于投资收益，需要从当日盈亏中剔除
    const dayStart = parseDateInOffset(`${date} 00:00:00`, 480);
    const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const dayTransfers = await Transfer.find({
      userId,
      date: { $gte: dayStart, $lt: nextDayStart }
    });
    const rates = await getRates();
    const transferFlow = dayTransfers.reduce((sum, t) => {
      const rate = rates[t.currency || 'CNY'] || 1;
      const amountCNY = (Number(t.amount) || 0) * rate;
      return sum + (t.type === 'IN' ? amountCNY : -amountCNY);
    }, 0);

    dailyProfitAmount = currentTotalAssets - prevTotalAssets - transferFlow;
    dailyReturn = prevTotalAssets > 0
      ? (dailyProfitAmount / prevTotalAssets) * 100
      : 0;

    // 累计指标统一采用本金口径
    const cumulativeReturn = principal > 0
      ? ((currentTotalAssets - principal) / principal) * 100
      : 0;
    const cumulativeProfitAmount = currentTotalAssets - principal;

    // 保存收益曲线数据
    await DailyProfit.findOneAndUpdate(
      { userId, date },
      {
        userId,
        date,
        dailyReturn: parseFloat(dailyReturn.toFixed(4)),
        cumulativeReturn: parseFloat(cumulativeReturn.toFixed(4)),
        dailyProfitAmount: parseFloat(dailyProfitAmount.toFixed(2)),
        cumulativeProfitAmount: parseFloat(cumulativeProfitAmount.toFixed(2)),
        totalAssets: asset.totalAssets || 0,
        isDirty: false,
        source: 'cached'
      },
      { upsert: true, new: true }
    );

    // 保存营收金额数据
    await DailyRevenue.findOneAndUpdate(
      { userId, date },
      {
        userId,
        date,
        revenue: parseFloat(dailyProfitAmount.toFixed(2)),
        returnRate: parseFloat(dailyReturn.toFixed(4)),
        cumulativeRevenue: parseFloat(cumulativeProfitAmount.toFixed(2)),
        cumulativeReturnRate: parseFloat(cumulativeReturn.toFixed(4)),
        totalAssets: asset.totalAssets || 0,
        cash: asset.cash || 0,
        holdingsMarketValue: asset.holdingsMarketValue || 0,
        isDirty: false
      },
      { upsert: true, new: true }
    );

    console.log(`[Scheduler] Profit calculated for user ${userId}: return=${dailyReturn.toFixed(2)}%, amount=${dailyProfitAmount.toFixed(2)}`);
  }

  /**
   * 更新月度统计
   */
  async updateMonthlyStats(date) {
    const yearMonth = moment(date).format('YYYY-MM');
    const year = moment(date).year();
    const month = moment(date).month() + 1;

    console.log(`[Scheduler] Updating monthly stats for ${yearMonth}`);

    // 获取所有用户
    const users = await User.find({}).select('_id');

    for (const user of users) {
      try {
        // 获取该月所有日收益数据
        const startOfMonth = moment(date).startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment(date).endOf('month').format('YYYY-MM-DD');
        
        const dailyProfits = await DailyProfit.find({
          userId: user._id,
          date: { $gte: startOfMonth, $lte: endOfMonth }
        }).sort({ date: 1 });

        if (dailyProfits.length === 0) {
          continue;
        }

        // 计算统计
        let profitDays = 0;
        let lossDays = 0;
        let breakEvenDays = 0;
        let totalProfitAmount = 0;
        let maxDailyProfit = 0;
        let maxDailyLoss = 0;

        dailyProfits.forEach(day => {
          if (day.dailyProfitAmount > 0) {
            profitDays++;
            maxDailyProfit = Math.max(maxDailyProfit, day.dailyProfitAmount);
          } else if (day.dailyProfitAmount < 0) {
            lossDays++;
            maxDailyLoss = Math.min(maxDailyLoss, day.dailyProfitAmount);
          } else {
            breakEvenDays++;
          }
          totalProfitAmount += day.dailyProfitAmount;
        });

        const totalTradingDays = dailyProfits.length;
        const winRate = totalTradingDays > 0 ? (profitDays / totalTradingDays) * 100 : 0;
        const avgDailyProfit = totalTradingDays > 0 ? totalProfitAmount / totalTradingDays : 0;

        // 计算月度收益率
        const startAssets = dailyProfits[0].totalAssets || 0;
        const endAssets = dailyProfits[dailyProfits.length - 1].totalAssets || startAssets;
        const totalReturnRate = startAssets > 0 ? ((endAssets - startAssets) / startAssets) * 100 : 0;

        await MonthlyStats.findOneAndUpdate(
          { userId: user._id, yearMonth },
          {
            userId: user._id,
            yearMonth,
            year,
            month,
            totalTradingDays,
            profitDays,
            lossDays,
            breakEvenDays,
            winRate: parseFloat(winRate.toFixed(2)),
            totalProfitAmount: parseFloat(totalProfitAmount.toFixed(2)),
            totalReturnRate: parseFloat(totalReturnRate.toFixed(4)),
            maxDailyProfit: parseFloat(maxDailyProfit.toFixed(2)),
            maxDailyLoss: parseFloat(maxDailyLoss.toFixed(2)),
            avgDailyProfit: parseFloat(avgDailyProfit.toFixed(2)),
            startAssets: parseFloat(startAssets.toFixed(2)),
            endAssets: parseFloat(endAssets.toFixed(2)),
            isDirty: false
          },
          { upsert: true, new: true }
        );

        console.log(`[Scheduler] Monthly stats updated for user ${user._id}: ${yearMonth}`);
      } catch (error) {
        console.error(`[Scheduler] Error updating monthly stats for user ${user._id}:`, error.message);
      }
    }
  }

  /**
   * 检查并创建月度快照
   */
  async checkAndCreateMonthlySnapshot(date) {
    // 如果是月初第一天，创建上月快照
    const dayOfMonth = moment(date).date();
    if (dayOfMonth !== 1) {
      return; // 不是月初，不创建快照
    }

    const lastMonth = moment(date).subtract(1, 'month');
    const snapshotPeriod = lastMonth.format('YYYY-MM');
    const snapshotDate = lastMonth.endOf('month').format('YYYY-MM-DD');

    console.log(`[Scheduler] Creating monthly snapshot for ${snapshotPeriod}`);

    const users = await User.find({}).select('_id');

    for (const user of users) {
      try {
        // 获取月末资产数据
        const asset = await Asset.findOne({ userId: user._id });
        const dailyProfit = await DailyProfit.findOne({
          userId: user._id,
          date: snapshotDate
        });

        if (!asset) continue;

        // 获取持仓详情
        const trades = await Trade.find({ userId: user._id });
        const holdings = [];
        
        // 简化处理：从交易记录构建持仓快照
        // 实际应该从 Holding 模型获取
        const holdingMap = new Map();
        trades.forEach(trade => {
          if (trade.type === 'BUY') {
            const key = trade.symbol;
            const existing = holdingMap.get(key) || { quantity: 0, totalCost: 0 };
            existing.quantity += trade.quantity;
            existing.totalCost += trade.price * trade.quantity;
            holdingMap.set(key, existing);
          } else if (trade.type === 'SELL') {
            const key = trade.symbol;
            const existing = holdingMap.get(key);
            if (existing) {
              existing.quantity -= trade.quantity;
              if (existing.quantity <= 0) {
                holdingMap.delete(key);
              }
            }
          }
        });

        holdingMap.forEach((value, symbol) => {
          const trade = trades.find(t => t.symbol === symbol);
          if (trade && value.quantity > 0) {
            holdings.push({
              symbol,
              name: trade.name,
              quantity: value.quantity,
              avgCost: value.totalCost / value.quantity,
              marketValue: value.quantity * (trade.price || value.avgCost),
              currency: trade.currency || 'CNY'
            });
          }
        });

        await Snapshot.findOneAndUpdate(
          { userId: user._id, type: 'monthly', period: snapshotPeriod },
          {
            userId: user._id,
            type: 'monthly',
            date: snapshotDate,
            period: snapshotPeriod,
            totalAssets: asset.totalAssets || 0,
            cash: asset.cash || 0,
            holdingsMarketValue: asset.holdingsMarketValue || 0,
            cumulativeProfit: asset.totalProfit || 0,
            cumulativeReturnRate: dailyProfit ? dailyProfit.cumulativeReturn : 0,
            holdings
          },
          { upsert: true, new: true }
        );

        console.log(`[Scheduler] Monthly snapshot created for user ${user._id}: ${snapshotPeriod}`);
      } catch (error) {
        console.error(`[Scheduler] Error creating snapshot for user ${user._id}:`, error.message);
      }
    }
  }

  /**
   * 手动触发计算（用于测试或补偿）
   */
  async manualCalculate(date) {
    console.log(`[Scheduler] Manual calculation triggered for ${date}`);
    await this.calculateDailyProfitForDate(date);
  }

  /**
   * 计算指定日期的收益（用于手动补偿）
   */
  async calculateDailyProfitForDate(date) {
    this.isRunning = true;
    
    try {
      // 更新上证指数
      await this.updateBenchmarkData(date);

      // 计算所有用户收益
      const users = await User.find({}).select('_id');
      for (const user of users) {
        await this.calculateUserDailyProfit(user._id, date);
      }

      // 更新月度统计
      await this.updateMonthlyStats(date);

      console.log(`[Scheduler] Manual calculation completed for ${date}`);
    } catch (error) {
      console.error(`[Scheduler] Error in manual calculation:`, error);
    } finally {
      this.isRunning = false;
    }
  }
}

// 导出单例
const scheduler = new ProfitCurveScheduler();

module.exports = scheduler;
