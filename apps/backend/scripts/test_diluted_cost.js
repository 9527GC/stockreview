/**
 * 摊薄持仓成本法单元测试
 * 验证截图中的场景和不同交易顺序下的结果。
 */
const { calculateDilutedPerformance, calculateDilutedProfits } = require('../src/utils/cost');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const assertClose = (actual, expected, epsilon = 0.01, message) => {
  if (Math.abs(actual - expected) > epsilon) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
};

const RATES = { CNY: 1, HKD: 0.91, USD: 7.23 };

// 测试 1：截图中的三笔交易（加权平均 vs 摊薄成本差异）
const testScreenshotScenario = () => {
  const trades = [
    { symbol: '600141.SH', name: '兴发集团', type: 'BUY', price: 45.77, quantity: 600, commission: 0, currency: 'CNY', date: new Date('2026-06-30T14:59:00') },
    { symbol: '600141.SH', name: '兴发集团', type: 'BUY', price: 24.60, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T23:32:00') },
    { symbol: '600141.SH', name: '兴发集团', type: 'SELL', price: 26.06, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T23:33:00') }
  ];

  const perfMap = calculateDilutedPerformance({ trades, rates: RATES });
  const perf = perfMap.get('600141.SH');

  assert(perf.quantity === 600, 'Quantity should be 600');
  // 摊薄成本 = (600*45.77 + 400*24.60 - 400*26.06) / 600 = (27462 + 9840 - 10424) / 600 = 26878 / 600 = 44.7967
  assertClose(perf.avgCost, 44.7967, 0.01, 'AvgCost should be 44.80');

  const profits = calculateDilutedProfits({
    currentPrice: 43.75,
    quantity: perf.quantity,
    avgCost: perf.avgCost,
    totalBuyCost: perf.totalBuyCost,
    totalSellProceed: perf.totalSellProceed,
    rate: 1
  });

  // 当前持仓盈亏 = (43.75 - 44.7967) * 600 = -628.00
  assertClose(profits.unrealizedProfit, -628, 0.1, 'Unrealized profit should be -628');
  assertClose(profits.cumulativeProfit, -628, 0.1, 'Cumulative profit should equal unrealized profit in diluted method');

  console.log('✓ Screenshot scenario passed');
};

// 测试 2：不同交易顺序下，最终成本不同
const testOrderDependency = () => {
  // 顺序 A：先买入 400，卖出 400，再买入 600
  const tradesA = [
    { symbol: '600141.SH', type: 'BUY', price: 24.60, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T10:00:00') },
    { symbol: '600141.SH', type: 'SELL', price: 26.06, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T11:00:00') },
    { symbol: '600141.SH', type: 'BUY', price: 45.77, quantity: 600, commission: 0, currency: 'CNY', date: new Date('2026-06-30T12:00:00') }
  ];

  const perfA = calculateDilutedPerformance({ trades: tradesA, rates: RATES }).get('600141.SH');
  assert(perfA.quantity === 600, 'Order A quantity should be 600');
  assertClose(perfA.avgCost, 45.77, 0.01, 'Order A avgCost should be 45.77 after clearing and rebuying');

  // 顺序 B：先买入 600，卖出 400，再买入 400
  const tradesB = [
    { symbol: '600141.SH', type: 'BUY', price: 45.77, quantity: 600, commission: 0, currency: 'CNY', date: new Date('2026-06-30T10:00:00') },
    { symbol: '600141.SH', type: 'SELL', price: 26.06, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T11:00:00') },
    { symbol: '600141.SH', type: 'BUY', price: 24.60, quantity: 400, commission: 0, currency: 'CNY', date: new Date('2026-06-30T12:00:00') }
  ];

  const perfB = calculateDilutedPerformance({ trades: tradesB, rates: RATES }).get('600141.SH');
  assert(perfB.quantity === 600, 'Order B quantity should be 600');
  // 摊薄成本 = (600*45.77 - 400*26.06 + 400*24.60) / 600 = (27462 - 10424 + 9840) / 600 = 26878 / 600 = 44.7967
  assertClose(perfB.avgCost, 44.7967, 0.01, 'Order B avgCost should be 44.80');

  console.log('✓ Order dependency test passed');
};

// 测试 3：包含手续费
const testWithCommission = () => {
  const trades = [
    { symbol: '000001.SZ', type: 'BUY', price: 100, quantity: 100, commission: 5, currency: 'CNY', date: new Date('2026-06-30T10:00:00') },
    { symbol: '000001.SZ', type: 'SELL', price: 110, quantity: 50, commission: 3, currency: 'CNY', date: new Date('2026-06-30T11:00:00') }
  ];

  const perf = calculateDilutedPerformance({ trades, rates: RATES }).get('000001.SZ');
  assert(perf.quantity === 50, 'Quantity should be 50');
  // 摊薄成本 = (100*100 + 5 - (50*110 - 3)) / 50 = (10005 - 5497) / 50 = 4508 / 50 = 90.16
  assertClose(perf.avgCost, 90.16, 0.01, 'AvgCost with commission should be 90.16');

  console.log('✓ Commission test passed');
};

// 测试 4：清仓后 realizedProfitCNY
const testRealizedProfitAfterClear = () => {
  const trades = [
    { symbol: '000001.SZ', type: 'BUY', price: 100, quantity: 100, commission: 5, currency: 'CNY', date: new Date('2026-06-30T10:00:00') },
    { symbol: '000001.SZ', type: 'SELL', price: 110, quantity: 100, commission: 3, currency: 'CNY', date: new Date('2026-06-30T11:00:00') }
  ];

  const perf = calculateDilutedPerformance({ trades, rates: RATES }).get('000001.SZ');
  assert(perf.quantity === 0, 'Quantity should be 0 after selling all');
  // 已实现盈亏 = 卖出回款 - 买入支出 = (110*100 - 3) - (100*100 + 5) = 10997 - 10005 = 992
  assertClose(perf.realizedProfitCNY, 992, 0.01, 'Realized profit after clear should be 992');

  console.log('✓ Realized profit after clear test passed');
};

// 运行所有测试
const runTests = () => {
  testScreenshotScenario();
  testOrderDependency();
  testWithCommission();
  testRealizedProfitAfterClear();
  console.log('\nAll diluted cost tests passed!');
};

runTests();
