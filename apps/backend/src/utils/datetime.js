const getDateStringInOffset = (offsetMinutes = 480, baseDate = new Date()) => {
  const offsetMs = Number(offsetMinutes) * 60 * 1000;
  const shifted = new Date((baseDate instanceof Date ? baseDate.getTime() : Date.now()) + offsetMs);
  return shifted.toISOString().slice(0, 10);
};

const getDayRangeInOffset = (offsetMinutes, baseDate = new Date()) => {
  const offsetMs = Number(offsetMinutes) * 60 * 1000;
  const baseMs = baseDate instanceof Date ? baseDate.getTime() : Date.now();
  const shifted = new Date(baseMs + offsetMs);
  shifted.setUTCHours(0, 0, 0, 0);
  const startMs = shifted.getTime() - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000;
  return { start: new Date(startMs), end: new Date(endMs) };
};

const parseDateInOffset = (input, offsetMinutes) => {
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);

  const str = String(input || '').trim();
  if (!str) return new Date(NaN);

  const hasExplicitZone = /z$/i.test(str) || /[+-]\d{2}:?\d{2}$/i.test(str);
  if (hasExplicitZone) return new Date(str);

  const m = str.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?\s*$/);
  if (!m) return new Date(str);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4] || 0);
  const minute = Number(m[5] || 0);
  const second = Number(m[6] || 0);

  const offsetMs = Number(offsetMinutes) * 60 * 1000;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMs;
  return new Date(utcMs);
};

module.exports = { getDateStringInOffset, getDayRangeInOffset, parseDateInOffset };

