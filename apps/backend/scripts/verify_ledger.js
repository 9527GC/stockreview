const { calculateCashAndPrincipalCNY } = require('../src/utils/ledger');

const assertClose = (actual, expected, label) => {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || Math.abs(a - e) > 0.01) {
    console.error(`${label} failed: expected ${e}, got ${a}`);
    process.exit(1);
  }
};

const rates = { CNY: 1 };
const transfers = [{ type: 'IN', amount: 10000, currency: 'CNY' }];
const trades = [
  { type: 'BUY', price: 1000, quantity: 1, commission: 2, currency: 'CNY' },
  { type: 'SELL', price: 1100, quantity: 1, commission: 3, currency: 'CNY' }
];

const { cashCNY, principalCNY } = calculateCashAndPrincipalCNY({ transfers, trades, rates });

assertClose(principalCNY, 10000, 'principal');
assertClose(cashCNY, 10000 - 1000 - 2 + 1100 - 3, 'cash');

console.log('verify_ledger ok');

