const {
  calculateWeightedAveragePerformance,
  calculateClosedPositionCycles,
  calculateDilutedPerformance
} = require('../src/utils/cost');

const trade = (type, price, quantity, date, overrides = {}) => ({
  _id: `${date}-${type}-${price}-${quantity}`,
  symbol: '600519.SH',
  name: '贵州茅台',
  type,
  price,
  quantity,
  commission: 0,
  currency: 'CNY',
  fxRateToCNY: 1,
  date,
  ...overrides
});

describe('standard and diluted cost calculations', () => {
  test('同一标的两轮清仓生成两条独立周期及独立收益率', () => {
    const trades = [
      trade('BUY', 100, 100, '2026-09-18T09:30:00+08:00'),
      trade('SELL', 110, 100, '2026-09-18T14:30:00+08:00'),
      trade('BUY', 10, 100, '2026-09-19T09:30:00+08:00'),
      trade('SELL', 11, 100, '2026-09-19T14:30:00+08:00')
    ];

    const cycles = calculateClosedPositionCycles({ trades });

    expect(cycles).toHaveLength(2);
    expect(cycles.map((cycle) => cycle.profitRate)).toEqual([0.1, 0.1]);
    expect(cycles.map((cycle) => cycle.realizedProfit)).toEqual([1000, 100]);
    expect(cycles.map((cycle) => cycle.cycleId)).toEqual(['600519.SH:1', '600519.SH:2']);
  });

  test('标准加权平均成本与摊薄成本隔离，已实现盈亏不受摊薄成本影响', () => {
    const trades = [
      trade('BUY', 100, 100, '2026-09-18T09:30:00+08:00'),
      trade('SELL', 120, 50, '2026-09-18T14:30:00+08:00')
    ];

    const standard = calculateWeightedAveragePerformance({ trades }).get('600519.SH');
    const diluted = calculateDilutedPerformance({ trades, rates: { CNY: 1 } }).get('600519.SH');

    expect(standard).toMatchObject({ quantity: 50, avgCost: 100, realizedProfit: 1000, realizedProfitCNY: 1000 });
    expect(diluted).toMatchObject({ dilutedAvgCost: 80 });
    expect(diluted).not.toHaveProperty('realizedProfitCNY');
  });

  test('超卖不生成伪造的清仓周期，并由标准成本计算拒绝', () => {
    const trades = [trade('SELL', 100, 1, '2026-09-18T09:30:00+08:00')];

    expect(() => calculateWeightedAveragePerformance({ trades })).toThrow('Sell quantity exceeds holding quantity');
    expect(() => calculateClosedPositionCycles({ trades })).toThrow('Sell quantity exceeds holding quantity');
  });
});
