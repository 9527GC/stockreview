/**
 * A 股交易日历工具
 * 内置中国法定节假日及调休补班数据，用于判断某天是否为 A 股交易日。
 *
 * 规则：
 * 1. 调休补班日（周末但上班）→ 开市
 * 2. 普通周六、周日 → 休市
 * 3. 法定节假日 → 休市
 * 4. 其余工作日 → 开市
 *
 * 当前数据覆盖 2023-2025 年，2026 年及以后按普通周末规则回退处理
 *（A 股节假日安排通常在每年 11-12 月公布，届时可补充）。
 */

const HOLIDAYS = [
  // 2023 年
  { name: '元旦', start: '2022-12-31', end: '2023-01-02', type: 'holiday' },
  { name: '春节', start: '2023-01-21', end: '2023-01-27', type: 'holiday' },
  { name: '春节调休补班', start: '2023-01-28', end: '2023-01-28', type: 'workday' },
  { name: '春节调休补班', start: '2023-01-29', end: '2023-01-29', type: 'workday' },
  { name: '清明节', start: '2023-04-05', end: '2023-04-05', type: 'holiday' },
  { name: '劳动节', start: '2023-04-29', end: '2023-05-03', type: 'holiday' },
  { name: '劳动节调休补班', start: '2023-04-23', end: '2023-04-23', type: 'workday' },
  { name: '劳动节调休补班', start: '2023-05-06', end: '2023-05-06', type: 'workday' },
  { name: '端午节', start: '2023-06-22', end: '2023-06-24', type: 'holiday' },
  { name: '端午节调休补班', start: '2023-06-25', end: '2023-06-25', type: 'workday' },
  { name: '中秋节、国庆节', start: '2023-09-29', end: '2023-10-06', type: 'holiday' },
  { name: '中秋节国庆节调休补班', start: '2023-10-07', end: '2023-10-07', type: 'workday' },
  { name: '中秋节国庆节调休补班', start: '2023-10-08', end: '2023-10-08', type: 'workday' },

  // 2024 年
  { name: '元旦', start: '2023-12-30', end: '2024-01-01', type: 'holiday' },
  { name: '春节', start: '2024-02-10', end: '2024-02-17', type: 'holiday' },
  { name: '春节调休补班', start: '2024-02-04', end: '2024-02-04', type: 'workday' },
  { name: '春节调休补班', start: '2024-02-18', end: '2024-02-18', type: 'workday' },
  { name: '清明节', start: '2024-04-04', end: '2024-04-06', type: 'holiday' },
  { name: '清明节调休补班', start: '2024-04-07', end: '2024-04-07', type: 'workday' },
  { name: '劳动节', start: '2024-05-01', end: '2024-05-05', type: 'holiday' },
  { name: '劳动节调休补班', start: '2024-04-28', end: '2024-04-28', type: 'workday' },
  { name: '劳动节调休补班', start: '2024-05-11', end: '2024-05-11', type: 'workday' },
  { name: '端午节', start: '2024-06-08', end: '2024-06-10', type: 'holiday' },
  { name: '中秋节', start: '2024-09-15', end: '2024-09-17', type: 'holiday' },
  { name: '中秋节调休补班', start: '2024-09-14', end: '2024-09-14', type: 'workday' },
  { name: '国庆节', start: '2024-10-01', end: '2024-10-07', type: 'holiday' },
  { name: '国庆节调休补班', start: '2024-09-29', end: '2024-09-29', type: 'workday' },
  { name: '国庆节调休补班', start: '2024-10-12', end: '2024-10-12', type: 'workday' },

  // 2025 年
  { name: '元旦', start: '2025-01-01', end: '2025-01-01', type: 'holiday' },
  { name: '春节', start: '2025-01-28', end: '2025-02-04', type: 'holiday' },
  { name: '春节调休补班', start: '2025-01-26', end: '2025-01-26', type: 'workday' },
  { name: '春节调休补班', start: '2025-02-08', end: '2025-02-08', type: 'workday' },
  { name: '清明节', start: '2025-04-04', end: '2025-04-06', type: 'holiday' },
  { name: '劳动节', start: '2025-05-01', end: '2025-05-05', type: 'holiday' },
  { name: '劳动节调休补班', start: '2025-04-27', end: '2025-04-27', type: 'workday' },
  { name: '端午节', start: '2025-05-31', end: '2025-06-02', type: 'holiday' },
  { name: '国庆节、中秋节', start: '2025-10-01', end: '2025-10-08', type: 'holiday' },
  { name: '国庆节中秋节调休补班', start: '2025-09-28', end: '2025-09-28', type: 'workday' },
  { name: '国庆节中秋节调休补班', start: '2025-10-11', end: '2025-10-11', type: 'workday' }
];

const HOLIDAY_RANGES = HOLIDAYS.map(item => ({
  ...item,
  startTs: parseBeijingDate(item.start).getTime(),
  endTs: parseBeijingDate(item.end).getTime()
}));

const DATA_START = HOLIDAY_RANGES[0].startTs;
const DATA_END = HOLIDAY_RANGES[HOLIDAY_RANGES.length - 1].endTs;

/**
 * 解析北京时间日期字符串（避免本地时区差异）
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {Date}
 */
function parseBeijingDate(dateStr) {
  return new Date(`${dateStr}T00:00:00+08:00`);
}

/**
 * 判断是否为法定节假日/连休假日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
function isHoliday(dateStr) {
  const ts = parseBeijingDate(dateStr).getTime();
  return HOLIDAY_RANGES.some(item =>
    item.type === 'holiday' && ts >= item.startTs && ts <= item.endTs
  );
}

/**
 * 判断是否为调休补班日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
function isWorkday(dateStr) {
  const ts = parseBeijingDate(dateStr).getTime();
  return HOLIDAY_RANGES.some(item =>
    item.type === 'workday' && ts >= item.startTs && ts <= item.endTs
  );
}

/**
 * 判断是否为 A 股交易日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {boolean}
 */
function isTradingDay(dateStr) {
  const date = parseBeijingDate(dateStr);
  const ts = date.getTime();
  const day = date.getDay();

  // 1. 调休补班日（周末也要上班）→ 开市
  if (isWorkday(dateStr)) {
    return true;
  }

  // 2. 普通周末 → 休市
  if (day === 0 || day === 6) {
    return false;
  }

  // 3. 法定节假日 → 休市
  if (isHoliday(dateStr)) {
    return false;
  }

  // 4. 数据未覆盖的日期仅按周末回退，避免误判法定节假日
  if (ts < DATA_START || ts > DATA_END) {
    // A 股周末休市是确定规则；非法定节假日的工作日默认开市
    return true;
  }

  // 5. 其余工作日 → 开市
  return true;
}

/**
 * 获取指定日期的下一个交易日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string | null}
 */
function getNextTradingDay(dateStr) {
  let date = parseBeijingDate(dateStr);
  for (let i = 0; i < 365; i++) {
    date = new Date(date.getTime() + 24 * 60 * 60 * 1000);
    const nextStr = date.toISOString().slice(0, 10);
    if (isTradingDay(nextStr)) {
      return nextStr;
    }
  }
  return null;
}

/**
 * 获取指定日期的上一个交易日
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {string | null}
 */
function getPreviousTradingDay(dateStr) {
  let date = parseBeijingDate(dateStr);
  for (let i = 0; i < 365; i++) {
    date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    const prevStr = date.toISOString().slice(0, 10);
    if (isTradingDay(prevStr)) {
      return prevStr;
    }
  }
  return null;
}

module.exports = {
  isHoliday,
  isWorkday,
  isTradingDay,
  getNextTradingDay,
  getPreviousTradingDay
};
