import { describe, expect, it } from 'vitest';
import { getHistoryCycleKey, selectHistoryCycleGroups } from './historyCycles';

describe('history cycle helpers', () => {
  it('uses cycleId as the stable key so same-symbol cycles do not share expanded state', () => {
    expect(getHistoryCycleKey({ cycleId: '600519.SH:1', symbol: '600519.SH' })).toBe('600519.SH:1');
    expect(getHistoryCycleKey({ cycleId: '600519.SH:2', symbol: '600519.SH' })).toBe('600519.SH:2');
  });

  it('selects details for only the expanded cycle', () => {
    const groups = [
      { groupId: '600519.SH:1', realizedProfit: 100 },
      { groupId: '600519.SH:2', realizedProfit: 200 }
    ];

    expect(selectHistoryCycleGroups(groups, '600519.SH:2')).toEqual([
      { groupId: '600519.SH:2', realizedProfit: 200 }
    ]);
  });
});
