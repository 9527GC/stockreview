import { describe, expect, it } from 'vitest';
import { matchesStock, pinyinInitialQueries } from '@stock-review/stock-search';
const stock = { symbol: '002163.SZ', name: '海南发展' };
describe('统一股票搜索', () => {
  it.each(['海南', '002163', 'SZ002163', 'hnfz', 'HNFZ', 'hainanfazhan', 'hai nan fa zhan', 'hǎi nán fā zhǎn', 'fazhan'])('支持 %s', query => expect(matchesStock(stock, query)).toBe(true));
  it.each(['腾讯', 'txkg', 'tengxunkonggu', '000001'])('排除 %s', query => expect(matchesStock(stock, query)).toBe(false));
  it('支持英文代码、英文名称与空查询', () => {
    expect(matchesStock({ symbol: 'AAPL.US', name: 'Apple Inc.' }, 'aapl')).toBe(true);
    expect(matchesStock({ name: 'Apple Inc.' }, 'apple')).toBe(true);
    expect(matchesStock(stock, '')).toBe(true);
  });
  it('支持多音字股票名称', () => {
    expect(matchesStock({ name: '重庆银行' }, 'cqyh')).toBe(true);
    expect(matchesStock({ name: '重庆银行' }, 'chongqingyinhang')).toBe(true);
  });
  it('全拼生成首字母召回候选', () => {
    expect(pinyinInitialQueries('hainanfazhan')).toContain('hnfz');
    expect(pinyinInitialQueries('chongqingyinhang')).toContain('cqyh');
    expect(pinyinInitialQueries('002163')).toEqual([]);
  });
});