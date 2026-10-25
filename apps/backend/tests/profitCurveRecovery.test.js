jest.mock('node-cron', () => ({ schedule: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../src/utils/dailyProfitBackfill', () => ({ backfillDailyProfit: jest.fn(async () => ({})) }));
jest.mock('../src/utils/datetime', () => ({ getDateStringInOffset: () => '2026-10-25' }));
jest.mock('../src/utils/historicalQuotes', () => ({ getStockHistoricalQuotes: jest.fn() }));
const cron = require('node-cron');
const scheduler = require('../src/services/profitCurveScheduler');
const DailyProfit = require('../src/models/DailyProfit');
const User = require('../src/models/User');
const DailyBenchmark = require('../src/models/DailyBenchmark');
const { getStockHistoricalQuotes } = require('../src/utils/historicalQuotes');
const { backfillDailyProfit } = require('../src/utils/dailyProfitBackfill');

afterEach(() => { scheduler.stop(); jest.restoreAllMocks(); jest.clearAllMocks(); });

test('启动立即恢复，并在北京时间凌晨和美股收盘后各执行一次', () => {
  const calculate = jest.spyOn(scheduler, 'calculateDailyProfit').mockResolvedValue();
  scheduler.start();
  expect(calculate).toHaveBeenCalledTimes(1);
  expect(cron.schedule).toHaveBeenCalledWith('0 2,8 * * *', expect.any(Function), expect.objectContaining({ timezone: 'Asia/Shanghai' }));
});

test('基准更新使用现有行情接口的日期及收盘价字段', async () => {
  jest.spyOn(DailyBenchmark, 'findOne').mockResolvedValue(null);
  const update = jest.spyOn(DailyBenchmark, 'findOneAndUpdate').mockResolvedValue({});
  getStockHistoricalQuotes.mockResolvedValue([{ date: '2026-10-23', close: 3707.48 }]);
  await scheduler.updateBenchmarkData('2026-10-23');
  expect(getStockHistoricalQuotes).toHaveBeenCalledWith('000001.SH', '2026-10-18', '2026-10-23');
  expect(update).toHaveBeenCalledWith({ date: '2026-10-23' }, expect.objectContaining({ close: 3707.48, source: 'tencent', isTradingDay: true }), expect.any(Object));
});

test.each([
  ['2026-10-24', '2026-10-11'],
  ['2026-10-01', '2026-10-01'],
  [null, '2026-10-11']
])('最近快照 %s 自动选择补算起点 %s', async (latest, expected) => {
  jest.spyOn(User, 'find').mockReturnValue({ select: async () => [{ _id: 'user' }] });
  jest.spyOn(DailyProfit, 'findOne').mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => latest ? { date: latest } : null }) }) });
  jest.spyOn(scheduler, 'updateBenchmarkData').mockResolvedValue();
  jest.spyOn(scheduler, 'updateMonthlyStats').mockResolvedValue();
  jest.spyOn(scheduler, 'checkAndCreateMonthlySnapshot').mockResolvedValue();
  await scheduler.calculateDailyProfit();
  expect(backfillDailyProfit).toHaveBeenCalledWith('user', expected);
  expect(scheduler.isRunning).toBe(false);
});
