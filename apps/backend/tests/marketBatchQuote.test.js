jest.mock('../src/utils/marketData', () => ({ getQuotes: jest.fn(), getMarketOverview: jest.fn() }));
const { getQuotes } = require('../src/utils/marketData');
const { getQuote } = require('../src/controllers/marketController');
const response = () => { const res = { json: jest.fn(), status: jest.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => jest.clearAllMocks());
test('多只证券仅发起一次行情请求并去重', async () => {
  const quotes = { '600000.SH': { price: 10 }, '01810.HK': { price: 20 } };
  getQuotes.mockResolvedValue(quotes);
  const res = response();
  await getQuote({ query: { symbols: '600000.SH,01810.HK,600000.SH' } }, res);
  expect(getQuotes).toHaveBeenCalledWith(['600000.SH', '01810.HK']);
  expect(getQuotes).toHaveBeenCalledTimes(1);
  expect(res.json).toHaveBeenCalledWith(quotes);
});
test.each([[], '', Array.from({ length: 101 }, (_, i) => `${i}.US`).join(',')])('拒绝无效或超量批量查询', async symbols => {
  const res = response();
  await getQuote({ query: { symbols } }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(getQuotes).not.toHaveBeenCalled();
});
test('保留单只证券查询兼容性', async () => {
  getQuotes.mockResolvedValue({ '600000.SH': { price: 10 } });
  const res = response();
  await getQuote({ query: { symbol: '600000.SH' } }, res);
  expect(res.json).toHaveBeenCalledWith({ price: 10 });
});
