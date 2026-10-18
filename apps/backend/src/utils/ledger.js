const { BEIJING_OFFSET_MINUTES, getDateStringInOffset } = require('./datetime');
const { normalizeCashBalances, sumCashBalancesCNY, toCNY, toMoney } = require('./money');

const CASH_CURRENCIES = ['CNY', 'HKD', 'USD'];

const readLockedNumber = (record, recordType, field, { positive = false, nonNegative = false } = {}) => {
  if (record?.[field] === null || record?.[field] === undefined) {
    throw new Error(`${recordType} is missing locked ${field}`);
  }

  const value = Number(record[field]);
  if (!Number.isFinite(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    throw new Error(`${recordType} has invalid locked ${field}`);
  }
  return toMoney(value);
};

const readCurrency = (record, recordType) => {
  const currency = String(record?.currency || '').toUpperCase();
  if (!CASH_CURRENCIES.includes(currency)) {
    throw new Error(`${recordType} has unsupported currency: ${record?.currency ?? ''}`);
  }
  return currency;
};

const readOccurredAt = (transfer) => {
  const occurredAt = transfer?.date instanceof Date ? transfer.date : new Date(transfer?.date);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error('Transfer has invalid date');
  }
  return occurredAt;
};

const addCash = (cashBalances, currency, amount) => {
  cashBalances[currency] = toMoney(cashBalances[currency] + amount);
};

const buildLedger = ({ transfers = [], trades = [] } = {}) => {
  const cashBalances = normalizeCashBalances();
  let principalCNY = 0;
  const transferFlowsByDate = new Map();

  transfers.forEach((transfer) => {
    const currency = readCurrency(transfer, 'Transfer');
    const fxRateToCNY = readLockedNumber(transfer, 'Transfer', 'fxRateToCNY', { positive: true });
    const amountCNY = readLockedNumber(transfer, 'Transfer', 'amountCNY', { positive: true });
    const amount = readLockedNumber(transfer, 'Transfer', 'amount', { positive: true });
    if (amountCNY !== toCNY(amount, fxRateToCNY)) {
      throw new Error('Transfer has incoherent locked amountCNY');
    }
    const occurredAt = readOccurredAt(transfer);
    const sign = transfer.type === 'IN' ? 1 : transfer.type === 'OUT' ? -1 : null;

    if (sign === null) {
      throw new Error(`Transfer has unsupported type: ${transfer?.type ?? ''}`);
    }

    const signedAmount = toMoney(sign * amount);
    const signedAmountCNY = toMoney(sign * amountCNY);
    addCash(cashBalances, currency, signedAmount);
    principalCNY = toMoney(principalCNY + signedAmountCNY);

    const businessDate = getDateStringInOffset(BEIJING_OFFSET_MINUTES, occurredAt);
    const flows = transferFlowsByDate.get(businessDate) || [];
    flows.push({ amountCNY: signedAmountCNY, occurredAt });
    transferFlowsByDate.set(businessDate, flows);
  });

  trades.forEach((trade) => {
    const currency = readCurrency(trade, 'Trade');
    readLockedNumber(trade, 'Trade', 'fxRateToCNY', { positive: true });
    readLockedNumber(trade, 'Trade', 'grossAmount', { positive: true });
    const netSettlementAmount = readLockedNumber(trade, 'Trade', 'netSettlementAmount', { nonNegative: true });
    const sign = trade.type === 'BUY' ? -1 : trade.type === 'SELL' ? 1 : null;

    if (sign === null) {
      throw new Error(`Trade has unsupported type: ${trade?.type ?? ''}`);
    }

    addCash(cashBalances, currency, toMoney(sign * netSettlementAmount));
  });

  return { cashBalances, principalCNY, transferFlowsByDate };
};

const calculateCashAndPrincipalCNY = ({ transfers, trades, rates }) => {
  const ledger = buildLedger({ transfers, trades });
  return {
    cashCNY: sumCashBalancesCNY(ledger.cashBalances, rates),
    principalCNY: ledger.principalCNY
  };
};

module.exports = { buildLedger, calculateCashAndPrincipalCNY };
