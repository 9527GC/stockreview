const { buildLedger } = require('../src/utils/ledger');
const Transfer = require('../src/models/Transfer');
const { Trade } = require('../src/models/Trade');
const { Asset } = require('../src/models/Asset');

describe('ledger model fields', () => {
  test('流水模型保留锁定汇率与原始币种清算金额，资产保留分币种现金', () => {
    const transfer = new Transfer({
      userId: '507f1f77bcf86cd799439011',
      type: 'IN',
      amount: 100,
      currency: 'USD',
      fxRateToCNY: 7.2,
      amountCNY: 720
    });
    const trade = new Trade({
      userId: '507f1f77bcf86cd799439011',
      symbol: 'AAPL.US',
      name: 'Apple',
      type: 'BUY',
      price: 30,
      quantity: 1,
      date: new Date(),
      currency: 'USD',
      fxRateToCNY: 7.2,
      grossAmount: 30,
      netSettlementAmount: 31
    });
    const asset = new Asset({
      userId: '507f1f77bcf86cd799439011',
      cashBalances: { CNY: 1, HKD: 2, USD: 3 },
      cash: 24.4
    });

    expect(transfer.toObject()).toMatchObject({ fxRateToCNY: 7.2, amountCNY: 720 });
    expect(trade.toObject()).toMatchObject({
      fxRateToCNY: 7.2,
      grossAmount: 30,
      netSettlementAmount: 31
    });
    expect(asset.cashBalances.get('USD')).toBe(3);
    expect(asset.cash).toBe(24.4);
  });
});

describe('buildLedger', () => {
  test('账本保持原始币种现金，并使用转账锁定 CNY 本金', () => {
    const ledger = buildLedger({
      transfers: [{
        type: 'IN',
        amount: 100,
        currency: 'USD',
        fxRateToCNY: 7.2,
        amountCNY: 720,
        date: new Date('2026-09-19T01:00:00.000Z')
      }],
      trades: [{
        type: 'BUY',
        currency: 'USD',
        fxRateToCNY: 7.2,
        grossAmount: 30,
        commission: 1,
        netSettlementAmount: 31,
        date: new Date('2026-09-19T02:00:00.000Z')
      }]
    });

    expect(ledger.cashBalances).toEqual({ CNY: 0, HKD: 0, USD: 69 });
    expect(ledger.principalCNY).toBe(720);
  });

  test('账本读取 Mongoose 流水文档中的锁定字段', () => {
    const transfer = new Transfer({
      userId: '507f1f77bcf86cd799439011',
      type: 'IN',
      amount: 100,
      currency: 'USD',
      fxRateToCNY: 7.2,
      amountCNY: 720,
      date: new Date('2026-09-19T01:00:00.000Z')
    });
    const trade = new Trade({
      userId: '507f1f77bcf86cd799439011',
      symbol: 'AAPL.US',
      name: 'Apple',
      type: 'BUY',
      price: 30,
      quantity: 1,
      commission: 1,
      date: new Date('2026-09-19T02:00:00.000Z'),
      currency: 'USD',
      fxRateToCNY: 7.2,
      grossAmount: 30,
      netSettlementAmount: 31
    });

    expect(buildLedger({ transfers: [transfer], trades: [trade] }).cashBalances)
      .toEqual({ CNY: 0, HKD: 0, USD: 69 });
  });
  test('账本不读取当前汇率重估既有转账', () => {
    const ledger = buildLedger({
      transfers: [{
        type: 'IN',
        amount: 100,
        currency: 'USD',
        fxRateToCNY: 7,
        amountCNY: 700,
        date: new Date('2026-09-19T01:00:00.000Z')
      }],
      trades: []
    });

    expect(ledger.principalCNY).toBe(700);
  });

  test('卖出仅增加原始交易币种现金，并按北京时间归集带符号的外部资金流', () => {
    const occurredAt = new Date('2026-09-19T16:30:00.000Z');
    const ledger = buildLedger({
      transfers: [{
        type: 'OUT',
        amount: 10,
        currency: 'HKD',
        fxRateToCNY: 0.9,
        amountCNY: 9,
        date: occurredAt
      }],
      trades: [{
        type: 'SELL',
        currency: 'USD',
        fxRateToCNY: 7.2,
        grossAmount: 50,
        commission: 2,
        netSettlementAmount: 48,
        date: new Date('2026-09-19T17:00:00.000Z')
      }]
    });

    expect(ledger.cashBalances).toEqual({ CNY: 0, HKD: -10, USD: 48 });
    expect(ledger.principalCNY).toBe(-9);
    expect(ledger.transferFlowsByDate.get('2026-09-20')).toEqual([
      { amountCNY: -9, occurredAt }
    ]);
  });

  test.each([
    ['转账缺少锁定汇率', {
      transfers: [{ type: 'IN', amount: 100, currency: 'USD', amountCNY: 720, date: new Date() }],
      trades: []
    }, /Transfer.*fxRateToCNY/i],
    ['转账缺少锁定 CNY 金额', {
      transfers: [{ type: 'IN', amount: 100, currency: 'USD', fxRateToCNY: 7.2, date: new Date() }],
      trades: []
    }, /Transfer.*amountCNY/i],
    ['交易缺少锁定清算金额', {
      transfers: [],
      trades: [{ type: 'BUY', currency: 'USD', fxRateToCNY: 7.2, grossAmount: 100, commission: 1, date: new Date() }]
    }, /Trade.*netSettlementAmount/i]
  ])('%s 时清晰拒绝旧流水', (_name, input, expectedError) => {
    expect(() => buildLedger(input)).toThrow(expectedError);
  });
});
describe('locked ledger regression protection', () => {
  test('Mongoose 文档缺少锁定字段时不允许默认伪造数据，并被账本拒绝', () => {
    const transfer = new Transfer({
      userId: '507f1f77bcf86cd799439011',
      type: 'IN',
      amount: 100,
      currency: 'USD',
      date: new Date('2026-09-19T01:00:00.000Z')
    });
    const trade = new Trade({
      userId: '507f1f77bcf86cd799439011',
      symbol: 'AAPL.US',
      name: 'Apple',
      type: 'BUY',
      price: 30,
      quantity: 1,
      commission: 1,
      date: new Date('2026-09-19T02:00:00.000Z'),
      currency: 'USD'
    });

    expect(transfer.validateSync()?.errors).toMatchObject({
      fxRateToCNY: expect.anything(),
      amountCNY: expect.anything()
    });
    expect(trade.validateSync()?.errors).toMatchObject({
      fxRateToCNY: expect.anything(),
      grossAmount: expect.anything(),
      netSettlementAmount: expect.anything()
    });
    expect(() => buildLedger({ transfers: [transfer], trades: [trade] }))
      .toThrow(/Transfer.*fxRateToCNY/i);
  });
});
