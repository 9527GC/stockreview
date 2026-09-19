const {
  toMoney,
  toCNY,
  normalizeCashBalances,
  sumCashBalancesCNY
} = require('../src/utils/money');

test('金额和人民币换算统一保留两位小数', () => {
  expect(toMoney(12.345)).toBe(12.35);
  expect(toCNY(100.123, 0.9234)).toBe(92.45);
});

test('现金余额标准化为三种市场币种', () => {
  expect(normalizeCashBalances({ CNY: 1.239, HKD: '2.345', USD: 3, JPY: 4 }))
    .toEqual({ CNY: 1.24, HKD: 2.35, USD: 3 });
});

test('现金余额按照当前汇率汇总为人民币', () => {
  expect(sumCashBalancesCNY(
    { CNY: 100, HKD: 200, USD: 10 },
    { CNY: 1, HKD: 0.92, USD: 7.2 }
  )).toBe(356);
});

test.each([
  ['金额', () => toMoney(Infinity)],
  ['汇率', () => toCNY(1, NaN)],
  ['余额', () => normalizeCashBalances({ CNY: 'invalid' })],
  ['汇率表', () => sumCashBalancesCNY({ CNY: 1 }, { CNY: NaN })]
])('拒绝非有限数值的%s输入', (_label, operation) => {
  expect(operation).toThrow(TypeError);
});
