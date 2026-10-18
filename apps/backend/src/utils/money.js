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

const assertControlledCurrencyKeys = (input, label) => {
  Object.keys(input).forEach((currency) => {
    if (!CURRENCIES.includes(currency)) {
      throw new RangeError(`Unsupported ${label} currency: ${currency}`);
    }
  });
};

const normalizeCashBalances = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Cash balances must be an object');
  }

  assertControlledCurrencyKeys(input, 'cash balance');

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

  assertControlledCurrencyKeys(rates, 'exchange rate');

  const normalizedBalances = normalizeCashBalances(balances);
  return toMoney(Object.entries(normalizedBalances)
    .reduce((total, [currency, balance]) => {
      if (balance === 0) return total;
      if (!Object.prototype.hasOwnProperty.call(rates, currency)) {
        throw new RangeError(`Missing exchange rate for currency: ${currency}`);
      }

      const rate = toFiniteNumber(rates[currency], 'Exchange rate');
      if (rate <= 0) {
        throw new RangeError(`Exchange rate must be positive for currency: ${currency}`);
      }
      if (currency === 'CNY' && rate !== 1) {
        throw new RangeError('CNY exchange rate must be 1');
      }

      return total + toCNY(balance, rate);
    }, 0));
};

module.exports = { toMoney, toCNY, normalizeCashBalances, sumCashBalancesCNY };
