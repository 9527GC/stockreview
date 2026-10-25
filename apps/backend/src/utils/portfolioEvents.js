const { compareTradeSettlement } = require('./tradeSettlementOrder');

// A corporate action at a given instant takes effect before trades at that instant.
const portfolioEvents = (trades = [], actions = []) => [
  ...trades.map(record => ({ record, kind: 'trade' })),
  ...actions.map(record => ({ record, kind: 'action' }))
].sort((a, b) => new Date(a.record.date) - new Date(b.record.date)
  || (a.kind === b.kind ? compareTradeSettlement(a.record, b.record) : a.kind === 'action' ? -1 : 1));

module.exports = { portfolioEvents };
