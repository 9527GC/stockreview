#!/usr/bin/env node
const path = require('path');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { Trade, Holding } = require('../src/models/Trade');
const Transfer = require('../src/models/Transfer');
const { Asset } = require('../src/models/Asset');
const DailyProfit = require('../src/models/DailyProfit');
const DailyRevenue = require('../src/models/DailyRevenue');
const MonthlyStats = require('../src/models/MonthlyStats');
const Snapshot = require('../src/models/Snapshot');
const WechatBindSession = require('../src/models/WechatBindSession');
const WechatLoginSession = require('../src/models/WechatLoginSession');

const DEFAULT_COMMISSION_PREFERENCE = {
  CN: { mode: 'rate', rate: 5, amount: 0 },
  HK: { mode: 'rate', rate: 5, amount: 0 },
  US: { mode: 'rate', rate: 5, amount: 0 }
};

const defaultModels = {
  User,
  Trade,
  Holding,
  Transfer,
  Asset,
  DailyProfit,
  DailyRevenue,
  MonthlyStats,
  Snapshot,
  WechatBindSession,
  WechatLoginSession
};

const BUSINESS_MODEL_NAMES = [
  'Trade',
  'Holding',
  'Transfer',
  'Asset',
  'DailyProfit',
  'DailyRevenue',
  'MonthlyStats',
  'Snapshot',
  'WechatBindSession',
  'WechatLoginSession'
];

const deleteOptions = (session) => (session ? { session } : undefined);

const deleteBusinessData = async ({ userId, models, session }) => {
  const deleted = {};
  for (const modelName of BUSINESS_MODEL_NAMES) {
    const result = await models[modelName].deleteMany({ userId }, deleteOptions(session));
    deleted[modelName] = result.deletedCount;
  }
  return deleted;
};

const resetWithinSession = async ({ userId, models, session }) => {
  const user = await models.User.findById(userId, null, deleteOptions(session));
  if (!user) throw new Error(`User not found: ${userId}`);

  const deleted = await deleteBusinessData({ userId, models, session });
  const reset = await models.User.updateOne(
    { _id: userId },
    { $set: { commissionPreference: DEFAULT_COMMISSION_PREFERENCE } },
    deleteOptions(session)
  );

  return { deleted, resetUsers: reset.modifiedCount };
};

const isTransactionUnsupported = (error) => /Transaction numbers are only allowed|replica set|Transaction support/i.test(error?.message || '');

const resetUserBusinessData = async ({ userId, confirm, models = defaultModels, connection = mongoose.connection }) => {
  if (!confirm) throw new Error('Refusing to reset business data without --confirm');
  if (!userId) throw new Error('userId is required');

  let result;
  let session;
  try {
    session = await connection.startSession();
    await session.withTransaction(async () => {
      result = await resetWithinSession({ userId, models, session });
    });
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    result = await resetWithinSession({ userId, models });
  } finally {
    await session?.endSession();
  }

  return {
    userId: String(userId),
    ...result,
    executedAt: new Date().toISOString()
  };
};

const resetAllUserBusinessData = async ({ confirmAllUsers, models = defaultModels, connection = mongoose.connection }) => {
  if (!confirmAllUsers) throw new Error('Refusing to reset all users without --confirm-all-users');
  const users = await models.User.find({}, { _id: 1 }).lean();
  const results = [];
  for (const user of users) {
    results.push(await resetUserBusinessData({ userId: user._id, confirm: true, models, connection }));
  }
  return { users: results, resetUsers: results.length, executedAt: new Date().toISOString() };
};

const parseArgs = (argv) => {
  const args = new Set(argv);
  const userIdIndex = argv.indexOf('--userId');
  return {
    userId: userIdIndex >= 0 ? argv[userIdIndex + 1] : null,
    confirm: args.has('--confirm'),
    confirmAllUsers: args.has('--confirm-all-users')
  };
};

const runCli = async (argv = process.argv.slice(2)) => {
  const { userId, confirm, confirmAllUsers } = parseArgs(argv);
  if (userId && confirmAllUsers) throw new Error('Use either --userId ... --confirm or --confirm-all-users, not both');
  if (userId && !confirm) throw new Error('Refusing to reset business data without --confirm');
  if (!userId && !confirmAllUsers) throw new Error('Refusing to reset all users without --confirm-all-users');

  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const result = userId
      ? await resetUserBusinessData({ userId, confirm })
      : await resetAllUserBusinessData({ confirmAllUsers });
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  runCli().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}

module.exports = {
  BUSINESS_MODEL_NAMES,
  DEFAULT_COMMISSION_PREFERENCE,
  resetUserBusinessData,
  resetAllUserBusinessData,
  runCli
};

