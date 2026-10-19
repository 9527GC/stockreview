// 仅显式标记的历史导入记录使用结算顺序；不修改真实成交时间。
const compareTradeSettlement = (a, b) => {
  const dateDiff = new Date(a.date) - new Date(b.date);
  if (dateDiff) return dateDiff;
  const order = (t) => Number.isFinite(t.settlementOrder) ? t.settlementOrder : 0;
  return order(a) - order(b) || String(a._id || '').localeCompare(String(b._id || ''));
};
module.exports = { compareTradeSettlement };
