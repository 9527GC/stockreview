const { valuatePortfolio } = require('../src/utils/portfolioValuation');

describe('valuatePortfolio', () => {
  test('使用当前有效实时价完成估值，而不是持仓成本', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      cashBalances: { CNY: 100 },
      holdings: [{ symbol: '600519.SH', quantity: 10, currency: 'CNY', avgCost: 1 }],
      quotes: { '600519.SH': { symbol: '600519.SH', price: 130, quoteDate: '2026-09-20' } },
      rates: { CNY: 1 },
      fallbackPrices: { '600519.SH': { price: 120, date: '2026-09-18' } }
    });

    expect(result).toMatchObject({
      cashByCurrency: { CNY: 100, HKD: 0, USD: 0 },
      cashCNY: 100,
      holdingsMarketValueCNY: 1300,
      totalAssetsCNY: 1400,
      quality: 'complete'
    });
    expect(result.valuations).toEqual([{
      symbol: '600519.SH',
      price: 130,
      priceDate: '2026-09-20',
      source: 'realtime',
      isStale: false
    }]);
  });

  test('行情缺失时使用最近有效收盘价而不是持仓成本', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      cashBalances: { CNY: 0 },
      holdings: [{
        symbol: '600519.SH',
        quantity: 10,
        currency: 'CNY',
        avgCost: 100,
        lastPrice: 110,
        lastPriceDate: '2026-09-17'
      }],
      quotes: {},
      fallbackPrices: { '600519.SH': { price: 120, date: '2026-09-18' } },
      rates: { CNY: 1 }
    });

    expect(result.holdingsMarketValueCNY).toBe(1200);
    expect(result.quality).toBe('stale');
    expect(result.valuations[0]).toEqual({
      symbol: '600519.SH',
      price: 120,
      priceDate: '2026-09-18',
      source: 'last-close',
      isStale: true
    });
  });

  test('无任何行情时标记 partial，而不以成本估值', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      cashBalances: { CNY: 0 },
      holdings: [{ symbol: '600519.SH', quantity: 10, currency: 'CNY', avgCost: 100 }],
      quotes: {},
      fallbackPrices: {},
      rates: { CNY: 1 }
    });

    expect(result.holdingsMarketValueCNY).toBe(0);
    expect(result.totalAssetsCNY).toBe(0);
    expect(result.quality).toBe('partial');
    expect(result.valuations[0]).toEqual({
      symbol: '600519.SH',
      price: null,
      priceDate: null,
      source: 'missing',
      isStale: false
    });
  });

  test('持仓或现金的汇率缺失时标记 partial 且不按一比一折算', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      cashBalances: { USD: 10 },
      holdings: [{ symbol: 'AAPL.US', quantity: 2, currency: 'USD', avgCost: 99 }],
      quotes: { 'AAPL.US': { symbol: 'AAPL.US', price: 5, quoteDate: '2026-09-20' } },
      fallbackPrices: {},
      rates: { CNY: 1 }
    });

    expect(result.cashCNY).toBe(0);
    expect(result.holdingsMarketValueCNY).toBe(0);
    expect(result.totalAssetsCNY).toBe(0);
    expect(result.quality).toBe('partial');
    expect(result.valuations[0]).toMatchObject({
      price: 5,
      source: 'realtime',
      isStale: false
    });
  });

  test('缺少报价日期的价格不得被视为完整估值', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      holdings: [{ symbol: '600519.SH', quantity: 2, currency: 'CNY', avgCost: 1 }],
      quotes: { '600519.SH': { symbol: '600519.SH', price: 50 } },
      rates: { CNY: 1 }
    });

    expect(result).toMatchObject({ holdingsMarketValueCNY: 0, quality: 'partial' });
    expect(result.valuations[0]).toMatchObject({ source: 'missing', price: null });
  });

  test('过期报价仅作为陈旧估值，不能输出 complete', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      holdings: [{ symbol: '600519.SH', quantity: 2, currency: 'CNY' }],
      quotes: { '600519.SH': { symbol: '600519.SH', price: 50, quoteDate: '2026-09-18' } },
      rates: { CNY: 1 }
    });

    expect(result).toMatchObject({ holdingsMarketValueCNY: 100, quality: 'stale' });
    expect(result.valuations[0]).toMatchObject({
      price: 50,
      priceDate: '2026-09-18',
      source: 'last-close',
      isStale: true
    });
  });

  test('不使用 lastPriceAt 推断最近收盘日期，避免 UTC 跨日误判', () => {
    const result = valuatePortfolio({
      asOfDate: '2026-09-20',
      holdings: [{
        symbol: '600519.SH',
        quantity: 2,
        currency: 'CNY',
        lastPrice: 50,
        lastPriceAt: new Date('2026-09-19T20:00:00.000Z')
      }],
      rates: { CNY: 1 }
    });

    expect(result).toMatchObject({ holdingsMarketValueCNY: 0, quality: 'partial' });
    expect(result.valuations[0]).toMatchObject({ source: 'missing', price: null, priceDate: null });
  });
});