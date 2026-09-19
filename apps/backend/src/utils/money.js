const CURRENCIES = ['CNY', 'HKD', 'USD'];

const toFiniteNumber = (value, label) => {
  const number = typeof value === 'string' && value.trim() === '' ? NaN : Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number`);
  }
  return number;
};

const toMoney = (value) => Math.round((toFiniteNumber(value, 'Money') + Number.EPSILON) * 100) / 100;

const toCNY = (amount, rate) => toMoney(
  toFiniteNumber(amount, 'Amount') * toFiniteNumber(rate, 'Exchange rate')
);

const normalizeCashBalances = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Cash balances must be an object');
  }

  return CURRENCIES.reduce((balances, currency) => {
    balances[currency] = Object.prototype.hasOwnProperty.call(input, currency)
      ? toMoney(input[currency])
      : 0;
    return balances;
  }, {});
};

const sumCashBalancesCNY = (balances, rates) => {
  if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
    throw new TypeError('Exchange rates must be an object');
  }

  return toMoney(Object.entries(normalizeCashBalances(balances))
    .reduce((total, [currency, balance]) => {
      if (balance === 0) return total;
      return total + toCNY(balance, rates[currency]);
    }, 0));
};

module.exports = { toMoney, toCNY, normalizeCashBalances, sumCashBalancesCNY };
