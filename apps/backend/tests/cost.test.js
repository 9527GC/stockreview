const { calculateDilutedPerformance, calculatePositionZeroGroups } = require('../src/utils/cost');
const trade = (type, price, quantity, date) => ({ symbol: '600519.SH', type, price, quantity, date, currency: 'CNY', commission: 0 });
test('生产摊薄成本包含部分卖出回款', () => {
  const trades = [trade('BUY', 100, 100, '2026-09-18'), trade('SELL', 120, 50, '2026-09-19')];
  expect(calculateDilutedPerformance({ trades }).get('600519.SH')).toMatchObject({ quantity: 50, avgCost: 80, realizedProfitCNY: 0 });
});
test('清仓周期分别保留收益与成本', () => {
  const trades = [trade('BUY', 100, 100, '2026-09-18'), trade('SELL', 110, 100, '2026-09-19'), trade('BUY', 10, 100, '2026-09-20'), trade('SELL', 11, 100, '2026-09-21')];
  const groups = calculatePositionZeroGroups({ trades });
  expect(groups.map(g => g.realizedProfit)).toEqual([1000, 100]);
  expect(groups.map(g => g.profitRate)).toEqual([0.1, 0.1]);
});
test('严格校验拒绝历史超卖', () => {
  expect(() => calculateDilutedPerformance({ trades: [trade('SELL', 100, 1, '2026-09-18')], strict: true })).toThrow('Sell quantity exceeds holding quantity');
});
