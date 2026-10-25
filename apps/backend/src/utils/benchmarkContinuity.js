// 仅向前沿用已发生的有效收盘值，不使用未来数据填补历史日期。
const buildContinuousBenchmarkPoints = (series, startDate, endDate) => {
  const closes = new Map();
  for (const item of series) {
    const date = String(item.snapshotTime || '').slice(0, 10);
    const close = Number(item.index ?? item.price);
    if (date && date <= endDate && Number.isFinite(close) && close > 0) closes.set(date, close);
  }
  const ordered = [...closes].sort(([a], [b]) => a.localeCompare(b));
  const prior = ordered.filter(([date]) => date <= startDate).at(-1);
  const baseClose = (prior || ordered.find(([date]) => date >= startDate))?.[1];
  const points = new Map();
  if (!baseClose) return points;
  let cursor = 0;
  let latest = null;
  for (let day = new Date(`${startDate}T00:00:00Z`); day <= new Date(`${endDate}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    const date = day.toISOString().slice(0, 10);
    while (cursor < ordered.length && ordered[cursor][0] <= date) latest = ordered[cursor++][1];
    points.set(date, latest === null ? null : Number(((latest / baseClose - 1) * 100).toFixed(4)));
  }
  return points;
};

module.exports = { buildContinuousBenchmarkPoints };
