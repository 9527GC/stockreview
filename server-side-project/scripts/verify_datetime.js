const { getDayRangeInOffset, parseDateInOffset } = require('../src/utils/datetime');

const assert = (cond, msg) => {
  if (!cond) {
    console.error(msg);
    process.exit(1);
  }
};

const d1 = parseDateInOffset('2026-03-20', 480);
assert(d1.toISOString() === '2026-03-19T16:00:00.000Z', 'date-only parse failed');

const d2 = parseDateInOffset('2026-03-20 23:00:00', 480);
assert(d2.toISOString() === '2026-03-20T15:00:00.000Z', 'datetime parse failed');

const d3 = parseDateInOffset('2026-03-20T23:00:00.000Z', 480);
assert(d3.toISOString() === '2026-03-20T23:00:00.000Z', 'explicit zone parse failed');

const base = new Date('2026-03-21T01:00:00.000Z');
const { start, end } = getDayRangeInOffset(480, base);
assert(start.toISOString() === '2026-03-20T16:00:00.000Z', 'range start failed');
assert(end.toISOString() === '2026-03-21T16:00:00.000Z', 'range end failed');

console.log('verify_datetime ok');

