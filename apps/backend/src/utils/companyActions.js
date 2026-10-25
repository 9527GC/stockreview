const compareByDateAndId = (a, b) => {
  const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  return String(a._id || a.id || '').localeCompare(String(b._id || b.id || ''));
};

const isActionImpactingAccount = (trades, action) => {
  const actionTime = new Date(action.date).getTime();
  if (!Number.isFinite(actionTime)) return false;

  let quantity = 0;
  for (const trade of [...(trades || [])].sort(compareByDateAndId)) {
    if (new Date(trade.date).getTime() > actionTime) break;
    const tradeQuantity = Number(trade.quantity) || 0;
    if (trade.type === 'BUY') quantity += tradeQuantity;
    if (trade.type === 'SELL') quantity = Math.max(0, quantity - tradeQuantity);
  }
  return quantity > 0;
};

const toCompanyActionOperation = (action) => ({
  id: String(action._id || action.id),
  symbol: action.symbol,
  name: action.name,
  stockName: action.name,
  date: action.date,
  type: 'COMPANY_ACTION',
  actionType: action.type,
  description: action.description,
  quantityChange: Number(action.quantityChange) || 0,
  cashAmount: Number(action.cashAmount) || 0,
  currency: action.currency || 'CNY',
  price: null,
  quantity: Number(action.quantityChange) || 0,
  commission: 0,
  logic: action.description
});

const getImpactingActions = ({ trades, actions }) => (
  (actions || [])
    .filter(action => isActionImpactingAccount(trades, action))
    .map(toCompanyActionOperation)
);

const addActionsToHoldingGroups = ({ groups, trades, actions }) => {
  const impactingActions = getImpactingActions({ trades, actions });
  return (groups || [])
    .map((group) => {
      const start = new Date(group.startDate).getTime();
      const end = new Date(group.endDate).getTime();
      const groupActions = impactingActions.filter((action) => {
        const time = new Date(action.date).getTime();
        return time >= start && time <= end;
      });

      return {
        ...group,
        actionsCount: groupActions.length,
        // Always sort the complete group, including groups without actions.
        // The API contract is newest-first for both history and holding details.
        trades: [...(group.trades || []), ...groupActions]
          .sort((a, b) => compareByDateAndId(b, a))
      };
    })
    // The newest closed position group is displayed first.
    .sort((a, b) => compareByDateAndId(
      { date: b.endDate, id: b.groupId },
      { date: a.endDate, id: a.groupId }
    ));
};

module.exports = {
  compareByDateAndId,
  getImpactingActions,
  addActionsToHoldingGroups
};
