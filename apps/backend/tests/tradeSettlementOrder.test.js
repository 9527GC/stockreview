const { compareTradeSettlement } = require('../src/utils/tradeSettlementOrder');


test('显式历史顺序让同日买入先于卖出且不修改成交日期', () => {
  const date = '2025-07-11T00:00:00Z';
  const sell = { _id: '1', symbol: 'INKT.US', date, type: 'SELL', quantity: 3, price: 55, commission: 2, settlementOrder: 1 };
  const buy = { _id: '2', symbol: 'INKT.US', date, type: 'BUY', quantity: 3, price: 45, commission: 2, settlementOrder: 0 };
  expect([sell, buy].sort(compareTradeSettlement)).toEqual([buy, sell]);
  expect(buy.date).toBe(date);
});

test('未标记交易保留原有成交时间和ID顺序', () => {
  const a = { _id: '1', date: '2025-07-11T00:00:00Z', type: 'SELL' };
  const b = { _id: '2', date: a.date, type: 'BUY' };
  expect([b, a].sort(compareTradeSettlement)).toEqual([a, b]);
  expect(compareTradeSettlement({ ...b, date: '2025-07-10T00:00:00Z', settlementOrder: 1 }, { ...a, settlementOrder: 0 })).toBeLessThan(0);
});
