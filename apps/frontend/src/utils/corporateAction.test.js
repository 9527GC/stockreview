import { describe, expect, it } from 'vitest';
import { currencyForSymbol, toStockOptions } from './corporateAction';

describe('公司行动证券选择工具', () => {
  it('按证券市场设置默认币种', () => {
    expect(currencyForSymbol('159516.SZ')).toBe('CNY');
    expect(currencyForSymbol('00700.HK')).toBe('HKD');
    expect(currencyForSymbol('MPNGY.US')).toBe('USD');
  });

  it('将证券搜索结果转换为可选择的下拉选项', () => {
    expect(toStockOptions([{ symbol: '159516.SZ', name: '半导体设备ETF国泰', market: 'SZ' }])).toEqual([
      { value: '159516.SZ', label: '159516.SZ 半导体设备ETF国泰', name: '半导体设备ETF国泰', currency: 'CNY' }
    ]);
  });
});
