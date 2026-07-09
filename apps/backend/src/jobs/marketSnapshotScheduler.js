const { getMarketOverview } = require('../utils/marketData');

const DEFAULT_SLOT = {
  name: 'cn-market-close',
  weekdays: [1, 2, 3, 4, 5], // 周一到周五
  hour: 16,
  minute: 10
};

const getBeijingParts = (date = new Date()) => {
  const offsetMinutes = 480;
  const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000);
  const iso = shifted.toISOString();

  return {
    date: iso.slice(0, 10),
    hour: Number(iso.slice(11, 13)),
    minute: Number(iso.slice(14, 16)),
    weekday: shifted.getUTCDay()
  };
};

const isSlotDue = (slot, windowMinutes, now = new Date()) => {
  const parts = getBeijingParts(now);
  if (!slot.weekdays.includes(parts.weekday)) return null;
  if (parts.hour !== slot.hour) return null;
  if (parts.minute < slot.minute || parts.minute >= slot.minute + windowMinutes) return null;

  return `${parts.date}:${slot.name}`;
};

const startMarketSnapshotScheduler = () => {
  if (process.env.ENABLE_MARKET_SNAPSHOT_SCHEDULER !== 'true') {
    return null;
  }

  const intervalMs = Number(process.env.MARKET_SNAPSHOT_SCHEDULER_INTERVAL_MS) || 60 * 1000;
  const windowMinutes = Number(process.env.MARKET_SNAPSHOT_SCHEDULER_WINDOW_MINUTES) || 20;
  const executedSlots = new Set();
  let running = false;

  const tick = async () => {
    if (running) return;

    const runKey = isSlotDue(DEFAULT_SLOT, windowMinutes);
    if (!runKey || executedSlots.has(runKey)) return;

    running = true;
    try {
      console.log('[market-snapshot] scheduler started');
      // 拉取实时全市场数据并保存到 MarketDailySnapshot（强制绕过缓存，确保收盘数据最新）
      await getMarketOverview({ forceRefresh: true });
      executedSlots.add(runKey);
      console.log('[market-snapshot] scheduler finished');
    } catch (error) {
      console.error('[market-snapshot] scheduler failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('[market-snapshot] scheduler tick failed:', error);
    });
  }, intervalMs);
  timer.unref?.();

  tick().catch((error) => {
    console.error('[market-snapshot] scheduler bootstrap failed:', error);
  });

  console.log('[market-snapshot] scheduler enabled');
  return { stop: () => clearInterval(timer) };
};

module.exports = { startMarketSnapshotScheduler };
