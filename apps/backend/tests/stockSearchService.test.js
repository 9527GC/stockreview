jest.mock('../src/utils/marketData', () => ({ requestText: jest.fn(), fetchJson: jest.fn() }));
const { requestText, fetchJson } = require('../src/utils/marketData');
const { searchStock } = require('../src/services/stockSearchService');
test('全拼先召回首字母，再用同一匹配器过滤错误候选', async () => {
  requestText.mockImplementation(async url => url.includes('q=hnfz')
    ? 'v_hint="2;002163~海南发展~hnfz~sz~stock;000001~平安银行~payh~sz~stock"'
    : 'v_hint="0;"');
  fetchJson.mockResolvedValue({});
  const result = await searchStock('hai nan fa zhan');
  expect(result.suggestions).toEqual([{ symbol: '002163.SZ', name: '海南发展', market: 'SZ' }]);
  const calls = requestText.mock.calls.length;
  expect((await searchStock('HAINANFAZHAN')).suggestions).toEqual(result.suggestions);
  expect(requestText).toHaveBeenCalledTimes(calls);
});
test('当前用户候选按代码统一市场，且不查询其他用户交易', async () => {
  const { Trade } = require('../src/models/Trade');
  const find = jest.spyOn(Trade, 'find').mockReturnValue({ select: () => ({ lean: async () => [{ symbol: '002163.SZ', name: '海南发展', market: 'CN' }] }) });
  const result = await searchStock('海南', { userId: 'own-user' });
  expect(find).toHaveBeenCalledWith({ userId: 'own-user' });
  expect(result.suggestions).toEqual([{ symbol: '002163.SZ', name: '海南发展', market: 'SZ' }]);
  find.mockRestore();
});
