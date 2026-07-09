const { runProfitHistorySnapshotBatch } = require('../utils/profitHistorySnapshot');

const DEFAULT_SLOTS = [
  {
    name: 'cn-hk-close',
    markets: ['CN', 'HK'],
    weekdays: [1, 2, 3, 4, 5],
    hour: 16,
    minute: 10
  },
  {
    name: 'us-close',
    markets: ['US'],
    weekdays: [2, 3, 4, 5, 6],
    hour: 5,
    minute: 10
  }
];

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

const startProfitHistoryScheduler = () => {
  if (process.env.ENABLE_PROFIT_HISTORY_SCHEDULER !== 'true') {
    return null;
  }

  const intervalMs = Number(process.env.PROFIT_HISTORY_SCHEDULER_INTERVAL_MS) || 5 * 60 * 1000;
  const windowMinutes = Number(process.env.PROFIT_HISTORY_SCHEDULER_WINDOW_MINUTES) || 20;
  const executedSlots = new Set();
  let running = false;

  const tick = async () => {
    if (running) return;

    const dueSlots = DEFAULT_SLOTS
      .map((slot) => ({ slot, runKey: isSlotDue(slot, windowMinutes) }))
      .filter((item) => item.runKey && !executedSlots.has(item.runKey));

    if (dueSlots.length === 0) return;

    running = true;
    try {
      for (const due of dueSlots) {
        console.log(`[profit-history] scheduler slot=${due.slot.name} started`);
        const result = await runProfitHistorySnapshotBatch({
          markets: due.slot.markets,
          logger: console
        });
        executedSlots.add(due.runKey);
        console.log(`[profit-history] scheduler slot=${due.slot.name} finished ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error('[profit-history] scheduler failed:', error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    tick().catch((error) => {
      console.error('[profit-history] scheduler tick failed:', error);
    });
  }, intervalMs);
  timer.unref?.();

  tick().catch((error) => {
    console.error('[profit-history] scheduler bootstrap failed:', error);
  });

  console.log('[profit-history] scheduler enabled');
  return { stop: () => clearInterval(timer) };
};

module.exports = { startProfitHistoryScheduler };
