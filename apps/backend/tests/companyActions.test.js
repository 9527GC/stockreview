const { addActionsToHoldingGroups, getImpactingActions } = require('../src/utils/companyActions');

const trade = (id, type, date, quantity) => ({
  _id: id,
  symbol: '600519.SH',
  name: '贵州茅台',
  type,
  date,
  quantity,
  price: 100,
  commission: 0,
  currency: 'CNY'
});

const action = (id, date) => ({
  _id: id,
  symbol: '600519.SH',
  name: '贵州茅台',
  type: 'DIVIDEND',
  date,
  description: '10股派5元',
  quantityChange: 0,
  cashAmount: 50,
  currency: 'CNY'
});

describe('公司行动持仓匹配', () => {
  test('只匹配行动发生时处于持仓状态的行动', () => {
    const trades = [
      trade('1', 'BUY', '2026-01-01T01:00:00.000Z', 100),
      trade('2', 'SELL', '2026-01-10T01:00:00.000Z', 100),
      trade('3', 'BUY', '2026-02-01T01:00:00.000Z', 100)
    ];
    const actions = [
      action('before', '2025-12-31T01:00:00.000Z'),
      action('held', '2026-01-05T01:00:00.000Z'),
      action('flat', '2026-01-15T01:00:00.000Z'),
      action('current', '2026-02-05T01:00:00.000Z')
    ];

    expect(getImpactingActions({ trades, actions }).map(item => item.id)).toEqual(['held', 'current']);
  });

  test('按时间将匹配的行动插入对应历史分仓', () => {
    const trades = [
      trade('1', 'BUY', '2026-01-01T01:00:00.000Z', 100),
      trade('2', 'SELL', '2026-01-10T01:00:00.000Z', 100)
    ];
    const groups = [{
      groupId: '1',
      startDate: trades[0].date,
      endDate: trades[1].date,
      trades: [trades[0], trades[1]]
    }];

    const result = addActionsToHoldingGroups({
      groups,
      trades,
      actions: [action('action', '2026-01-05T01:00:00.000Z')]
    });

    expect(result[0].trades.map(item => String(item._id || item.id))).toEqual(['2', 'action', '1']);
    expect(result[0].actionsCount).toBe(1);
  });
});


describe('公司行动和历史分组排序', () => {
  test('没有公司行动的分组也按组内和组间时间倒序', () => {
    const trades = [
      trade('1', 'BUY', '2026-01-01T01:00:00.000Z', 100),
      trade('2', 'SELL', '2026-01-10T01:00:00.000Z', 100),
      trade('3', 'BUY', '2026-02-01T01:00:00.000Z', 100),
      trade('4', 'SELL', '2026-02-10T01:00:00.000Z', 100)
    ];
    const result = addActionsToHoldingGroups({
      groups: [
        { groupId: '1', startDate: trades[0].date, endDate: trades[1].date, trades: trades.slice(0, 2) },
        { groupId: '2', startDate: trades[2].date, endDate: trades[3].date, trades: trades.slice(2) }
      ],
      trades, actions: []
    });
    expect(result.map(g => g.groupId)).toEqual(['2', '1']);
    expect(result[0].trades.map(item => item._id)).toEqual(['4', '3']);
    expect(result[1].trades.map(item => item._id)).toEqual(['2', '1']);
  });
});
