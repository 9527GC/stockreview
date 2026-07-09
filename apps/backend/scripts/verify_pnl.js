const { calculateDailyProfitFromPosition } = require('../src/utils/pnl');

const assertClose = (actual, expected, label) => {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || Math.abs(a - e) > 0.01) {
    console.error(`${label} failed: expected ${e}, got ${a}`);
    process.exit(1);
  }
};

const quote = { price: 1850, preClose: 1800, changePercent: 2.78 };

const roundTripProfit = calculateDailyProfitFromPosition({
  posToday: 0,
  quote,
  todayTrades: [
    { type: 'BUY', price: 1800, quantity: 10, commission: 1 },
    { type: 'SELL', price: 1820, quantity: 10, commission: 1 }
  ]
});

assertClose(roundTripProfit, 198, 'round-trip daily profit');

const sellOldHoldingProfit = calculateDailyProfitFromPosition({
  posToday: 0,
  quote,
  todayTrades: [
    { type: 'SELL', price: 1850, quantity: 100, commission: 0 }
  ]
});

assertClose(sellOldHoldingProfit, 5000, 'sell-old-holding daily profit');

console.log('verify_pnl ok');

