const { round2 } = require('./pnl');
const { normalizeSymbol } = require('./symbol');

const sortTrades = (trades) => [...(trades || [])].sort((a, b) => {
  const byDate = new Date(a.date) - new Date(b.date);
  return byDate || String(a._id || '').localeCompare(String(b._id || ''));
});

const settlement = (trade) => {
  const gross = (Number(trade.price) || 0) * (Number(trade.quantity) || 0);
  return trade.type === 'BUY' ? gross + (Number(trade.commission) || 0) : gross - (Number(trade.commission) || 0);
};

const fxRate = (trade, rates = {}) => Number(trade.fxRateToCNY) || Number(rates[trade.currency || 'CNY']) || 1;

const ensurePosition = (positions, trade) => {
  const symbol = normalizeSymbol(trade.symbol);
  if (!positions.has(symbol)) {
    positions.set(symbol, {
      symbol,
      name: trade.name || symbol,
      currency: trade.currency || 'CNY',
      quantity: 0,
      avgCost: 0,
      avgCostCNY: 0,
      realizedProfit: 0,
      realizedProfitCNY: 0,
      totalBuyCost: 0,
      totalBuyCostCNY: 0,
      tradesCount: 0,
      lastTradeDate: null
    });
  }
  return positions.get(symbol);
};

const calculateWeightedAveragePerformance = ({ trades, rates = {} }) => {
  const positions = new Map();
  sortTrades(trades).forEach((trade) => {
    const position = ensurePosition(positions, trade);
    const quantity = Number(trade.quantity) || 0;
    const amount = settlement(trade);
    if (trade.name) position.name = trade.name;
    position.currency = trade.currency || position.currency;
    position.lastTradeDate = trade.date;
    position.tradesCount += 1;
    if (trade.type === 'BUY') {
      const nextQuantity = position.quantity + quantity;
      position.avgCost = ((position.avgCost * position.quantity) + amount) / nextQuantity;
      position.avgCostCNY = ((position.avgCostCNY * position.quantity) + (amount * fxRate(trade, rates))) / nextQuantity;
      position.quantity = nextQuantity;
      position.totalBuyCost += amount;
      position.totalBuyCostCNY += amount * fxRate(trade, rates);
      return;
    }
    if (trade.type !== 'SELL') return;
    if (quantity > position.quantity) throw new Error('Sell quantity exceeds holding quantity');
    position.realizedProfit += amount - (position.avgCost * quantity);
    position.realizedProfitCNY += (amount * fxRate(trade, rates)) - (position.avgCostCNY * quantity);
    position.quantity -= quantity;
    if (position.quantity === 0) {
      position.avgCost = 0;
      position.avgCostCNY = 0;
    }
  });
  positions.forEach((position) => {
    position.avgCost = round2(position.avgCost);
    position.avgCostCNY = round2(position.avgCostCNY);
    position.realizedProfit = round2(position.realizedProfit);
    position.realizedProfitCNY = round2(position.realizedProfitCNY);
    position.totalBuyCostCNY = round2(position.totalBuyCostCNY);
  });
  return positions;
};

const calculateClosedPositionCycles = ({ trades, rates = {} }) => {
  const cycles = [];
  const positions = new Map();
  const cycleNumber = new Map();
  sortTrades(trades).forEach((trade) => {
    const key = normalizeSymbol(trade.symbol);
    let position = positions.get(key);
    if (!position) {
      position = { quantity: 0, avgCost: 0, avgCostCNY: 0, buyCost: 0, sellProceeds: 0, openedAt: null, tradesCount: 0, trades: [], currency: trade.currency || 'CNY', name: trade.name || key };
      positions.set(key, position);
    }
    const quantity = Number(trade.quantity) || 0;
    const amount = settlement(trade);
    if (trade.type === 'BUY') {
      const nextQuantity = position.quantity + quantity;
      position.avgCost = ((position.avgCost * position.quantity) + amount) / nextQuantity;
      position.avgCostCNY = ((position.avgCostCNY * position.quantity) + (amount * fxRate(trade, rates))) / nextQuantity;
      position.quantity = nextQuantity;
      position.buyCost += amount * fxRate(trade, rates);
      position.openedAt ||= trade.date;
      position.tradesCount += 1;
      position.trades.push(trade);
      return;
    }
    if (trade.type !== 'SELL') return;
    if (quantity > position.quantity) throw new Error('Sell quantity exceeds holding quantity');
    position.quantity -= quantity;
    position.sellProceeds += amount * fxRate(trade, rates);
    position.tradesCount += 1;
    position.trades.push(trade);
    if (position.quantity !== 0) return;
    const number = (cycleNumber.get(key) || 0) + 1;
    cycleNumber.set(key, number);
    const realizedProfit = round2(position.sellProceeds - position.buyCost);
    cycles.push({
      cycleId: `${key}:${number}`,
      symbol: key,
      name: position.name,
      openedAt: position.openedAt,
      closedAt: trade.date,
      buyCost: round2(position.buyCost),
      sellProceeds: round2(position.sellProceeds),
      realizedProfit,
      profitRate: position.buyCost > 0 ? Number((realizedProfit / position.buyCost).toFixed(4)) : 0,
      currency: position.currency,
      tradesCount: position.tradesCount,
      trades: position.trades
    });
    positions.delete(key);
  });
  return cycles;
};

const calculateDilutedPerformance = ({ trades }) => {
  const bySymbol = new Map();
  sortTrades(trades).forEach((trade) => {
    const key = normalizeSymbol(trade.symbol);
    const current = bySymbol.get(key) || { symbol: key, name: trade.name || key, currency: trade.currency || 'CNY', quantity: 0, netCost: 0 };
    const quantity = Number(trade.quantity) || 0;
    const amount = settlement(trade);
    if (trade.type === 'BUY') { current.quantity += quantity; current.netCost += amount; }
    else if (trade.type === 'SELL') { if (quantity > current.quantity) throw new Error('Sell quantity exceeds holding quantity'); current.quantity -= quantity; current.netCost -= amount; }
    if (current.quantity > 0) bySymbol.set(key, { ...current, dilutedAvgCost: round2(current.netCost / current.quantity) });
    else bySymbol.delete(key);
  });
  return bySymbol;
};

const calculateDilutedProfits = ({ currentPrice, quantity, avgCost, rate = 1 }) => {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || quantity <= 0) return { unrealizedProfit: 0, cumulativeProfit: 0, realizedProfit: 0 };
  const unrealizedProfit = round2((currentPrice - avgCost) * quantity * rate);
  return { unrealizedProfit, cumulativeProfit: unrealizedProfit, realizedProfit: 0 };
};

const calculatePositionZeroGroups = ({ trades, rates = {} }) => calculateClosedPositionCycles({ trades, rates }).map((cycle) => ({
  groupId: cycle.cycleId,
  startDate: cycle.openedAt,
  endDate: cycle.closedAt,
  currency: cycle.currency,
  realizedProfit: cycle.realizedProfit,
  totalBuyCost: cycle.buyCost,
  profitRate: cycle.profitRate,
  tradesCount: cycle.tradesCount,
  hasAnomaly: false,
  trades: cycle.trades.map((trade) => ({
    id: trade._id,
    symbol: trade.symbol,
    name: trade.name,
    stockName: trade.name,
    date: trade.date,
    type: trade.type,
    price: trade.price,
    quantity: trade.quantity,
    commission: trade.commission,
    currency: trade.currency,
    market: trade.market,
    mood: trade.mood,
    logic: trade.logic ?? null,
    isSystemCompliant: trade.isSystemCompliant ?? null,
    cognitiveBias: trade.cognitiveBias ?? null,
    improvementMeasures: trade.improvementMeasures ?? null
  }))
}));

module.exports = { calculateWeightedAveragePerformance, calculateClosedPositionCycles, calculateDilutedPerformance, calculateDilutedProfits, calculatePositionZeroGroups };
