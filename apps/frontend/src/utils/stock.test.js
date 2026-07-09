import { describe, it, expect } from 'vitest';
import { normalizeSymbol, inferMarketFromSymbol, buildSymbolAliases } from './stock';

describe('normalizeSymbol', () => {
  it('returns null/undefined as-is for invalid inputs', () => {
    expect(normalizeSymbol(null)).toBeNull();
    expect(normalizeSymbol(undefined)).toBeUndefined();
    expect(normalizeSymbol('')).toBe('');
  });

  it('normalizes already-standard A-share symbols', () => {
    expect(normalizeSymbol('600519.SH')).toBe('600519.SH');
    expect(normalizeSymbol('000001.SZ')).toBe('000001.SZ');
    expect(normalizeSymbol('000001.sz')).toBe('000001.SZ');
  });

  it('normalizes SH/SZ/BJ prefixed codes', () => {
    expect(normalizeSymbol('SH600519')).toBe('600519.SH');
    expect(normalizeSymbol('SZ000001')).toBe('000001.SZ');
    expect(normalizeSymbol('BJ430047')).toBe('430047.BJ');
  });

  it('infers market for 6-digit codes', () => {
    expect(normalizeSymbol('600519')).toBe('600519.SH');
    expect(normalizeSymbol('000001')).toBe('000001.SZ');
    expect(normalizeSymbol('300750')).toBe('300750.SZ');
    expect(normalizeSymbol('688981')).toBe('688981.SH');
    expect(normalizeSymbol('830946')).toBe('830946.BJ');
  });

  it('normalizes HK codes', () => {
    expect(normalizeSymbol('00700')).toBe('00700.HK');
    expect(normalizeSymbol('00700.HK')).toBe('00700.HK');
    expect(normalizeSymbol('700')).toBe('00700.HK');
  });

  it('normalizes US ticker codes', () => {
    expect(normalizeSymbol('AAPL')).toBe('AAPL.US');
    expect(normalizeSymbol('AAPL.US')).toBe('AAPL.US');
    expect(normalizeSymbol('TSLA')).toBe('TSLA.US');
  });

  it('trims whitespace and uppercases input', () => {
    expect(normalizeSymbol('  sh600519  ')).toBe('600519.SH');
  });
});

describe('inferMarketFromSymbol', () => {
  it('infers CN market for A-share suffixes', () => {
    expect(inferMarketFromSymbol('600519.SH')).toBe('CN');
    expect(inferMarketFromSymbol('000001.SZ')).toBe('CN');
    expect(inferMarketFromSymbol('430047.BJ')).toBe('CN');
  });

  it('infers HK and US markets', () => {
    expect(inferMarketFromSymbol('00700.HK')).toBe('HK');
    expect(inferMarketFromSymbol('AAPL.US')).toBe('US');
  });

  it('defaults to CN for unrecognized symbols', () => {
    expect(inferMarketFromSymbol('UNKNOWN')).toBe('CN');
    expect(inferMarketFromSymbol(null)).toBe('CN');
  });
});

describe('buildSymbolAliases', () => {
  it('returns aliases for normalized A-share symbol', () => {
    const aliases = buildSymbolAliases('600519.SH');
    expect(aliases).toContain('600519.SH');
    expect(aliases).toContain('SH600519');
    expect(aliases).toContain('600519');
  });

  it('returns aliases for HK symbol', () => {
    const aliases = buildSymbolAliases('00700.HK');
    expect(aliases).toContain('00700.HK');
    expect(aliases).toContain('HK00700');
    expect(aliases).toContain('00700');
  });

  it('returns empty array for invalid input', () => {
    expect(buildSymbolAliases(null)).toEqual([]);
    expect(buildSymbolAliases('')).toEqual([]);
  });
});
