const {
  BEIJING_OFFSET_MINUTES,
  getDateStringInOffset,
  getPreviousDateStringInOffset
} = require('../src/utils/datetime');
const { getCurrencyForMarket } = require('../src/utils/marketCurrency');

test('北京时间凌晨仍返回北京时间业务日', () => {
  expect(getDateStringInOffset(BEIJING_OFFSET_MINUTES, new Date('2026-09-19T16:30:00.000Z')))
    .toBe('2026-09-20');
  expect(getPreviousDateStringInOffset(BEIJING_OFFSET_MINUTES, new Date('2026-09-19T16:30:00.000Z')))
    .toBe('2026-09-19');
});

test.each([
  [{ symbol: '600519.SH' }, 'CNY'],
  [{ symbol: '00700.HK' }, 'HKD'],
  [{ symbol: 'AAPL.US' }, 'USD']
])('按市场推导唯一币种', (input, expected) => {
  expect(getCurrencyForMarket(input)).toBe(expected);
});
