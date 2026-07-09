const path = require('path');
const fs = require('fs');

const nodeEnv = process.env.NODE_ENV || 'development';
const envFile = nodeEnv === 'production' ? '.env.production' : '.env.development';
let envPath = path.resolve(__dirname, '..', envFile);

if (!fs.existsSync(envPath)) {
  envPath = path.resolve(__dirname, '..', '.env');
}

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) process.env[key] = value;
    }
  });
  console.log(`[env] Loaded ${path.basename(envPath)}`);
} else {
  console.log('[env] Warning: No .env file found');
}

const mongoose = require('mongoose');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');
const MonthlyStats = require('../src/models/MonthlyStats');
const Snapshot = require('../src/models/Snapshot');
const { Asset } = require('../src/models/Asset');
const User = require('../src/models/User');
const { backfillDailyProfit } = require('../src/utils/dailyProfitBackfill');

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  console.log('[migrate] Cleaning old profit data...');
  await DailyProfit.deleteMany({});
  await DailyRevenue.deleteMany({});
  await MonthlyStats.deleteMany({});
  await Snapshot.deleteMany({});

  // ProfitHistory collection might still exist from old schema; drop it if present
  try {
    const collections = await mongoose.connection.db.listCollections({ name: 'profithistories' }).toArray();
    if (collections.length > 0) {
      await mongoose.connection.db.dropCollection('profithistories');
      console.log('[migrate] Dropped profithistories collection');
    }
  } catch (error) {
    console.error('[migrate] Error dropping profithistories:', error.message);
  }

  const users = await User.find({}).select('_id');
  console.log(`[migrate] Rebuilding daily profit for ${users.length} users...`);

  for (const user of users) {
    try {
      const asset = await Asset.findOne({ userId: user._id });
      if (!asset) {
        console.log(`[migrate] Skip user ${user._id}: no asset record`);
        continue;
      }

      // Find earliest trade/transfer date for this user
      const Trade = require('../src/models/Trade').Trade;
      const Transfer = require('../src/models/Transfer');
      const [firstTrade, firstTransfer] = await Promise.all([
        Trade.findOne({ userId: user._id }).sort({ date: 1 }),
        Transfer.findOne({ userId: user._id }).sort({ date: 1 })
      ]);

      const dates = [firstTrade?.date, firstTransfer?.date].filter(Boolean);
      if (dates.length === 0) {
        console.log(`[migrate] Skip user ${user._id}: no trades or transfers`);
        continue;
      }

      const earliestDate = dates.sort()[0].toISOString().slice(0, 10);
      const result = await backfillDailyProfit(user._id, earliestDate);
      console.log(`[migrate] User ${user._id}: backfilled ${result.updatedCount} days from ${result.startDate} to ${result.endDate}`);
    } catch (error) {
      console.error(`[migrate] Error backfilling user ${user._id}:`, error.message);
    }
  }

  console.log('[migrate] Done');
  await mongoose.disconnect();
  process.exit(0);
};

run().catch(error => {
  console.error('[migrate] Fatal error:', error);
  process.exit(1);
});
