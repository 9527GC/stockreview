require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { rebuildAssetFromLedger } = require('../src/controllers/tradeController');
const { backfillDailyProfit } = require('../src/utils/dailyProfitBackfill');

/**
 * 将持仓成本从加权平均法迁移为摊薄持仓成本法。
 *
 * 执行逻辑：
 *   1. 遍历所有用户；
 *   2. 对每个用户调用 rebuildAssetFromLedger，按全量交易重新计算摊薄成本；
 *   3. 从该用户最早交易日期开始重新回填 DailyProfit / DailyRevenue。
 */
const migrateDilutedCost = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is required');
    }

    await mongoose.connect(mongoUri);
    console.log('[migrate] Connected to MongoDB');

    const users = await User.find({}, { _id: 1 }).lean();
    console.log(`[migrate] Found ${users.length} users`);

    for (let i = 0; i < users.length; i++) {
      const userId = users[i]._id;
      console.log(`[migrate] Processing user ${i + 1}/${users.length}: ${userId}`);

      try {
        // 重建持仓与资产（内部使用摊薄成本法）
        await rebuildAssetFromLedger(userId);

        // 找到最早交易日期，用于回填收益数据
        const { Trade } = require('../src/models/Trade');
        const earliestTrade = await Trade.findOne({ userId }).sort({ date: 1 });
        if (earliestTrade?.date) {
          const earliestDateStr = earliestTrade.date.toISOString().slice(0, 10);
          await backfillDailyProfit(userId, earliestDateStr);
        }
      } catch (err) {
        console.error(`[migrate] Failed to process user ${userId}:`, err.message);
      }
    }

    console.log('[migrate] Migration completed');
  } catch (error) {
    console.error('[migrate] Migration failed:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('[migrate] Disconnected from MongoDB');
  }
};

migrateDilutedCost();
