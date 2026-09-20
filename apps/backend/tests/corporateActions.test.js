const { applyCorporateActions } = require('../src/utils/corporateActions');

describe('公司行动重算工具', () => {
  const base = { symbol: '159516.SZ', name: '半导体设备ETF国泰', currency: 'CNY', quantity: 4000, avgCost: 1, totalBuyCost: 4000, totalSellProceed: 0 };
  test('基金一拆二仅翻倍份额并将单位成本减半，总成本不变', () => {
    const result = applyCorporateActions(new Map([[base.symbol, { ...base }]]), [{ type: 'SPLIT', symbol: base.symbol, ratioNumerator: 2, ratioDenominator: 1 }]);
    const holding = result.get(base.symbol);
    expect(holding.quantity).toBe(8000); expect(holding.avgCost).toBe(0.5); expect(holding.totalBuyCost).toBe(4000);
  });
  test('现金分红计入已实现收益而不改变持仓数量和成本', () => {
    const result = applyCorporateActions(new Map([[base.symbol, { ...base }]]), [{ type: 'CASH_DIVIDEND', symbol: base.symbol, cashAmount: 120, currency: 'CNY' }]);
    const holding = result.get(base.symbol);
    expect(holding.quantity).toBe(4000); expect(holding.avgCost).toBe(1); expect(holding.realizedProfitCNY).toBe(120);
  });
  test('配股增加份额和成本，不能伪造为零元买入', () => {
    const result = applyCorporateActions(new Map([[base.symbol, { ...base }]]), [{ type: 'RIGHTS_ISSUE', symbol: base.symbol, quantityChange: 1000, cashAmount: 800, currency: 'CNY' }]);
    const holding = result.get(base.symbol);
    expect(holding.quantity).toBe(5000); expect(holding.totalBuyCost).toBe(4800); expect(holding.avgCost).toBe(0.96);
  });
});

test('拆分与后续卖出按生效顺序计算成本和已实现收益', () => {
  const { calculateDilutedPerformance } = require('../src/utils/cost');
  const performance = calculateDilutedPerformance({
    rates: { CNY: 1 },
    trades: [
      { _id: 'buy', symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'BUY', quantity: 4000, price: 1, commission: 0, currency: 'CNY', date: new Date('2026-04-09T01:30:00.000Z') },
      { _id: 'sell', symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'SELL', quantity: 4000, price: 0.6, commission: 0, currency: 'CNY', date: new Date('2026-04-11T01:30:00.000Z') }
    ],
    actions: [
      { symbol: '159516.SZ', name: '半导体设备ETF国泰', type: 'SPLIT', ratioNumerator: 2, ratioDenominator: 1, currency: 'CNY', date: new Date('2026-04-10T00:00:00.000Z') }
    ]
  });
  const result = performance.get('159516.SZ');
  expect(result.quantity).toBe(4000);
  expect(result.avgCost).toBe(0.4);
  expect(result.realizedProfitCNY).toBe(0);
});

