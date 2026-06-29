const DailyProfit = require('../models/DailyProfit');
const DailyRevenue = require('../models/DailyRevenue');
const MonthlyStats = require('../models/MonthlyStats');
const Snapshot = require('../models/Snapshot');
const moment = require('moment');
const { backfillDailyProfit } = require('../utils/dailyProfitBackfill');

/**
 * 脏数据管理器
 * 负责标记和清理脏数据
 */
class DirtyDataManager {
  
  /**
   * 标记脏数据
   * 当交易发生变更时，从交易日期开始标记之后所有数据为脏数据
   * @param {string} userId - 用户ID
   * @param {string} tradeDate - 交易日期（YYYY-MM-DD）
   */
  async markDirtyFromDate(userId, tradeDate) {
    console.log(`[DirtyData] Marking data as dirty from ${tradeDate} for user ${userId}`);
    
    try {
      // 1. 标记收益曲线数据为脏数据
      const profitResult = await DailyProfit.updateMany(
        { 
          userId, 
          date: { $gte: tradeDate }
        },
        { 
          $set: { isDirty: true } 
        }
      );
      console.log(`[DirtyData] Marked ${profitResult.modifiedCount} profit records as dirty`);

      // 2. 标记营收数据为脏数据
      const revenueResult = await DailyRevenue.updateMany(
        { 
          userId, 
          date: { $gte: tradeDate }
        },
        { 
          $set: { isDirty: true } 
        }
      );
      console.log(`[DirtyData] Marked ${revenueResult.modifiedCount} revenue records as dirty`);

      // 3. 标记月度统计为脏数据
      const tradeMonth = moment(tradeDate).format('YYYY-MM');
      const monthResult = await MonthlyStats.updateMany(
        { 
          userId, 
          yearMonth: { $gte: tradeMonth }
        },
        { 
          $set: { isDirty: true } 
        }
      );
      console.log(`[DirtyData] Marked ${monthResult.modifiedCount} monthly stats as dirty`);

      // 4. 标记快照为脏数据（可选）
      const snapshotResult = await Snapshot.updateMany(
        { 
          userId, 
          type: 'monthly',
          period: { $gte: tradeMonth }
        },
        { 
          $set: { isDirty: true } 
        }
      );
      console.log(`[DirtyData] Marked ${snapshotResult.modifiedCount} snapshots as dirty`);

      return {
        profitCount: profitResult.modifiedCount,
        revenueCount: revenueResult.modifiedCount,
        monthCount: monthResult.modifiedCount,
        snapshotCount: snapshotResult.modifiedCount
      };
    } catch (error) {
      console.error('[DirtyData] Error marking dirty data:', error);
      throw error;
    }
  }

  /**
   * 获取脏数据列表
   * @param {string} userId - 用户ID
   * @returns {Object} 脏数据统计
   */
  async getDirtyDataStats(userId) {
    const [profitDirty, revenueDirty, monthDirty] = await Promise.all([
      DailyProfit.countDocuments({ userId, isDirty: true }),
      DailyRevenue.countDocuments({ userId, isDirty: true }),
      MonthlyStats.countDocuments({ userId, isDirty: true })
    ]);

    return {
      profitDirty,
      revenueDirty,
      monthDirty,
      totalDirty: profitDirty + revenueDirty + monthDirty
    };
  }

  /**
   * 清理脏数据（重新计算）
   * @param {string} userId - 用户ID
   * @param {string} fromDate - 开始日期（可选，默认从最早的脏数据开始）
   */
  async cleanDirtyData(userId, fromDate = null) {
    console.log(`[DirtyData] Cleaning dirty data for user ${userId}`);

    try {
      // 如果没有指定日期，找到最早的脏数据日期
      if (!fromDate) {
        const earliestDirty = await DailyProfit.findOne(
          { userId, isDirty: true },
          { date: 1 }
        ).sort({ date: 1 });

        if (!earliestDirty) {
          console.log('[DirtyData] No dirty data found');
          return { cleaned: 0 };
        }

        fromDate = earliestDirty.date;
      }

      const fromDateStr = String(fromDate).slice(0, 10);
      console.log(`[DirtyData] Cleaning from ${fromDateStr}`);

      // 调用收益回溯重算，从 fromDate 到今日
      const result = await backfillDailyProfit(userId, fromDateStr);

      // 月度统计暂标记为已清理（月度统计由定时任务或请求时按需重算）
      const monthResult = await MonthlyStats.updateMany(
        { userId, yearMonth: { $gte: moment(fromDateStr).format('YYYY-MM') } },
        { $set: { isDirty: false } }
      );

      // 快照标记为已清理
      const snapshotResult = await Snapshot.updateMany(
        { userId, type: 'monthly', period: { $gte: moment(fromDateStr).format('YYYY-MM') } },
        { $set: { isDirty: false } }
      );

      console.log(`[DirtyData] Cleaned ${result.updatedCount} records`);
      return {
        cleaned: result.updatedCount,
        startDate: result.startDate,
        endDate: result.endDate,
        monthCount: monthResult.modifiedCount,
        snapshotCount: snapshotResult.modifiedCount
      };
    } catch (error) {
      console.error('[DirtyData] Error cleaning dirty data:', error);
      throw error;
    }
  }

  /**
   * 异步重新计算脏数据
   * @param {string} userId - 用户ID
   */
  async asyncRecalculate(userId) {
    // 使用 setImmediate 或 process.nextTick 实现异步处理
    setImmediate(async () => {
      try {
        console.log(`[DirtyData] Starting async recalculation for user ${userId}`);
        await this.cleanDirtyData(userId);
        console.log(`[DirtyData] Async recalculation completed for user ${userId}`);
      } catch (error) {
        console.error(`[DirtyData] Async recalculation failed for user ${userId}:`, error);
      }
    });
  }
}

// 导出单例
const dirtyDataManager = new DirtyDataManager();

module.exports = dirtyDataManager;
