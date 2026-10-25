const { round2 } = require('./pnl');

const calculateCashAndPrincipalCNY = ({ transfers, trades, rates, actions = [] }) => {
  const r = rates || {};

  let cash = 0;
  let principal = 0;

  (transfers || []).forEach(t => {
    const currency = t.currency || 'CNY';
    const rate = r[currency] || 1;
    const amountCNY = (Number(t.amount) || 0) * rate;

    if (t.type === 'IN') {
      cash += amountCNY;
      principal += amountCNY;
    } else if (t.type === 'OUT') {
      cash -= amountCNY;
      principal -= amountCNY;
    }
  });

  (trades || []).forEach(t => {
    const currency = t.currency || 'CNY';
    const rate = r[currency] || 1;
    const tradeAmountCNY = (Number(t.price) || 0) * (Number(t.quantity) || 0) * rate;
    const commissionCNY = (Number(t.commission) || 0) * rate;

    if (t.type === 'BUY') {
      cash -= tradeAmountCNY + commissionCNY;
    } else if (t.type === 'SELL') {
      cash += tradeAmountCNY - commissionCNY;
    }
  });

  actions.forEach(action => {
    const amount = (Number(action.cashAmount) || 0) * (r[action.currency || 'CNY'] || 1);
    if (action.type === 'CASH_DIVIDEND') cash += amount;
    if (action.type === 'RIGHTS_ISSUE') cash -= amount;
  });
  return { cashCNY: round2(cash), principalCNY: round2(principal) };
};

module.exports = { calculateCashAndPrincipalCNY };
