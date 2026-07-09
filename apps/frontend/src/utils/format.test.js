import { describe, it, expect } from 'vitest';
import { toFiniteNumber, getTrendColor, formatDate, getCurrencySymbol, getCurrencyCode } from './format';

describe('toFiniteNumber', () => {
  it('returns number for valid numeric values', () => {
    expect(toFiniteNumber(42)).toBe(42);
    expect(toFiniteNumber('3.14')).toBe(3.14);
    expect(toFiniteNumber('0')).toBe(0);
    expect(toFiniteNumber('-5')).toBe(-5);
  });

  it('returns null for invalid values', () => {
    expect(toFiniteNumber('abc')).toBeNull();
    expect(toFiniteNumber(NaN)).toBeNull();
    expect(toFiniteNumber(Infinity)).toBeNull();
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber('')).toBeNull();
  });
});

describe('getTrendColor', () => {
  it('returns red for zero and positive values', () => {
    expect(getTrendColor(1)).toBe('#cf1322');
    expect(getTrendColor(0)).toBe('#cf1322');
    expect(getTrendColor('0.01')).toBe('#cf1322');
  });

  it('returns green for negative values', () => {
    expect(getTrendColor(-1)).toBe('#3f8600');
    expect(getTrendColor('-0.5')).toBe('#3f8600');
  });

  it('returns gray for null/undefined', () => {
    expect(getTrendColor(null)).toBe('#8c8c8c');
    expect(getTrendColor(undefined)).toBe('#8c8c8c');
  });
});

describe('formatDate', () => {
  it('formats valid date strings', () => {
    expect(formatDate('2024-01-15T10:30:00')).toBe('2024-01-15 10:30');
  });

  it('uses custom template', () => {
    expect(formatDate('2024-01-15T10:30:00', 'YYYY-MM-DD')).toBe('2024-01-15');
  });

  it('returns placeholder for invalid dates', () => {
    expect(formatDate(null)).toBe('--');
    expect(formatDate(undefined)).toBe('--');
    expect(formatDate('')).toBe('--');
  });
});

describe('getCurrencySymbol', () => {
  it('returns correct symbols', () => {
    expect(getCurrencySymbol('CNY')).toBe('¥');
    expect(getCurrencySymbol('HKD')).toBe('HK$');
    expect(getCurrencySymbol('USD')).toBe('$');
  });

  it('defaults to CNY symbol for unknown currency', () => {
    expect(getCurrencySymbol('EUR')).toBe('¥');
    expect(getCurrencySymbol(null)).toBe('¥');
  });
});

describe('getCurrencyCode', () => {
  it('returns correct codes for markets', () => {
    expect(getCurrencyCode('CN')).toBe('CNY');
    expect(getCurrencyCode('SH')).toBe('CNY');
    expect(getCurrencyCode('SZ')).toBe('CNY');
    expect(getCurrencyCode('HK')).toBe('HKD');
    expect(getCurrencyCode('US')).toBe('USD');
  });

  it('defaults to CNY for unknown market', () => {
    expect(getCurrencyCode('JP')).toBe('CNY');
    expect(getCurrencyCode(null)).toBe('CNY');
  });
});
