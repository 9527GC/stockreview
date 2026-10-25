const { buildContinuousBenchmarkPoints: build } = require('../src/utils/benchmarkContinuity');
const row = (date, index) => ({ snapshotTime: `${date}T15:00:00+08:00`, index });

test('周末沿用周五，恢复交易后使用新值', () => {
  const points = build([row('2026-10-23', 100), row('2026-10-26', 105)], '2026-10-23', '2026-10-26');
  expect([...points.values()]).toEqual([0, 0, 0, 5]);
});
test('长假起点使用区间前最近收盘值作为基线', () => {
  const points = build([row('2026-09-29', 90), row('2026-09-30', 100), row('2026-10-09', 110)], '2026-10-01', '2026-10-10');
  expect(points.size).toBe(10);
  expect(points.get('2026-10-01')).toBe(0);
  expect(points.get('2026-10-08')).toBe(0);
  expect(points.get('2026-10-09')).toBe(10);
  expect(points.get('2026-10-10')).toBe(10);
});
test('无历史基线时不反向使用未来价格', () => {
  const points = build([row('2026-10-23', 100)], '2026-10-21', '2026-10-25');
  expect([...points.values()]).toEqual([null, null, 0, 0, 0]);
});
test('忽略无效数据，按日期排序，跨月延续', () => {
  const points = build([row('2026-11-02', 110), row('2026-10-30', 100), row('2026-10-31', null), row('2026-11-01', -1)], '2026-10-30', '2026-11-02');
  expect([...points.values()]).toEqual([0, 0, 0, 10]);
  expect(build([], '2026-10-23', '2026-10-25').size).toBe(0);
});
