const round2 = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return 0;
  return parseFloat(num.toFixed(2));
};

const calculateDailyProfitFromPosition = ({ posToday, quote, todayTrades }) => {
  if (!quote || !(quote.price > 0)) return 0;

  const closeToday = Number(quote.price) || 0;
  const changePercent = Number(quote.changePercent) || 0;
  const closeYesterday = (quote.preClose && quote.preClose > 0)
    ? Number(quote.preClose)
    : closeToday / (1 + changePercent / 100);

  let buyQty = 0;
  let sellQty = 0;
  let buyAmount = 0;
  let sellAmount = 0;
  let commission = 0;

  (todayTrades || []).forEach(t => {
    commission += Number(t.commission) || 0;
    const qty = Number(t.quantity) || 0;
    const price = Number(t.price) || 0;

    if (t.type === 'BUY') {
      buyQty += qty;
      buyAmount += price * qty;
    } else if (t.type === 'SELL') {
      sellQty += qty;
      sellAmount += price * qty;
    }
  });

  const posYest = (Number(posToday) || 0) - buyQty + sellQty;
  const valueToday = (Number(posToday) || 0) * closeToday;
  const valueYesterday = posYest * closeYesterday;
  const cashChange = sellAmount - buyAmount;

  return round2((valueToday - valueYesterday) + cashChange - commission);
};

module.exports = { round2, calculateDailyProfitFromPosition };

