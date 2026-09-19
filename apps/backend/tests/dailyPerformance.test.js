const { calculateModifiedDietzReturn } = require('../src/utils/dailyPerformance');

describe('calculateModifiedDietzReturn', () => {
  const dayStart = new Date('2026-09-18T16:00:00.000Z'); // 2026-09-19 00:00 Beijing
  const dayEnd = new Date('2026-09-19T16:00:00.000Z');

  test('无外部资金流时按期初资产计算日收益', () => {
    const result = calculateModifiedDietzReturn({ openingAssetsCNY: 10000, closingAssetsCNY: 10100, flows: [], dayStart, dayEnd });
    expect(result).toEqual({ dailyProfitAmount: 100, dailyReturn: 1, externalNetFlow: 0, weightedFlowCNY: 0 });
  });

  test('日内入金只按当天剩余时间加权进入收益率分母', () => {
    const result = calculateModifiedDietzReturn({
      openingAssetsCNY: 10000,
      closingAssetsCNY: 20100,
      flows: [{ amountCNY: 10000, occurredAt: new Date('2026-09-18T17:00:00.000Z') }],
      dayStart,
      dayEnd
    });
    expect(result.dailyProfitAmount).toBe(100);
    expect(result.externalNetFlow).toBe(10000);
    expect(result.weightedFlowCNY).toBe(9583.33);
    expect(result.dailyReturn).toBeCloseTo(0.5106, 4);
  });

  test('同日入金出金均从投资盈亏中剔除，并保留各自的日内权重', () => {
    const result = calculateModifiedDietzReturn({
      openingAssetsCNY: 10000,
      closingAssetsCNY: 10600,
      flows: [
        { amountCNY: 1000, occurredAt: new Date('2026-09-18T16:00:00.000Z') },
        { amountCNY: -500, occurredAt: new Date('2026-09-19T04:00:00.000Z') }
      ], dayStart, dayEnd
    });
    expect(result.dailyProfitAmount).toBe(100);
    expect(result.externalNetFlow).toBe(500);
    expect(result.weightedFlowCNY).toBe(750);
    expect(result.dailyReturn).toBeCloseTo(0.9302, 4);
  });

  test('北京时间日界之外的资金流不进入当天计算', () => {
    const result = calculateModifiedDietzReturn({
      openingAssetsCNY: 10000, closingAssetsCNY: 10100,
      flows: [
        { amountCNY: 1000, occurredAt: new Date('2026-09-18T15:59:59.999Z') },
        { amountCNY: 1000, occurredAt: new Date('2026-09-19T16:00:00.000Z') }
      ], dayStart, dayEnd
    });
    expect(result).toEqual({ dailyProfitAmount: 100, dailyReturn: 1, externalNetFlow: 0, weightedFlowCNY: 0 });
  });

  test('收益率分母为零时返回 0，仍保留金额和资金流', () => {
    const result = calculateModifiedDietzReturn({
      openingAssetsCNY: 0, closingAssetsCNY: -1000,
      flows: [{ amountCNY: -1000, occurredAt: dayStart }], dayStart, dayEnd
    });
    expect(result).toEqual({ dailyProfitAmount: 0, dailyReturn: 0, externalNetFlow: -1000, weightedFlowCNY: -1000 });
  });
});
