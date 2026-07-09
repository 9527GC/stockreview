require('dotenv').config();
const mongoose = require('mongoose');
const { runProfitHistorySnapshotBatch } = require('../src/utils/profitHistorySnapshot');

const parseArgs = (argv) => {
  const args = {};

  argv.forEach((arg) => {
    if (arg === '--no-refresh-assets') {
      args.refreshAssets = false;
      return;
    }

    if (arg.startsWith('--userId=')) {
      args.userIds = [arg.slice('--userId='.length)];
      return;
    }

    if (arg.startsWith('--userIds=')) {
      args.userIds = arg.slice('--userIds='.length).split(',').map((item) => item.trim()).filter(Boolean);
      return;
    }

    if (arg.startsWith('--markets=')) {
      args.markets = arg.slice('--markets='.length).split(',').map((item) => item.trim()).filter(Boolean);
    }
  });

  return args;
};

const run = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  const args = parseArgs(process.argv.slice(2));
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const result = await runProfitHistorySnapshotBatch({
      userIds: args.userIds,
      markets: args.markets,
      refreshAssets: args.refreshAssets !== false
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
