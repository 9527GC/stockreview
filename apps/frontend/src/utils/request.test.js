import { describe, it, expect } from 'vitest';
import { safeStringify, extractErrorText, clampToastText } from './request';

describe('safeStringify', () => {
  it('stringifies normal objects', () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('handles circular references gracefully', () => {
    const obj = { a: 1 };
    obj.self = obj;
    expect(safeStringify(obj)).toBe('[object Object]');
  });

  it('stringifies primitives', () => {
    expect(safeStringify(123)).toBe('123');
    expect(safeStringify('hello')).toBe('"hello"');
    expect(safeStringify(null)).toBe('null');
  });
});

describe('extractErrorText', () => {
  it('handles null/undefined', () => {
    expect(extractErrorText(null)).toBe('');
    expect(extractErrorText(undefined)).toBe('');
  });

  it('returns strings directly', () => {
    expect(extractErrorText('error message')).toBe('error message');
  });

  it('extracts message/msg/error/detail', () => {
    expect(extractErrorText({ message: 'oops' })).toBe('oops');
    expect(extractErrorText({ msg: 'oops' })).toBe('oops');
    expect(extractErrorText({ error: 'oops' })).toBe('oops');
    expect(extractErrorText({ detail: 'oops' })).toBe('oops');
  });

  it('extracts nested error object', () => {
    expect(extractErrorText({ error: { message: 'nested' } })).toBe('nested');
    expect(extractErrorText({ error: { msg: 'nested' } })).toBe('nested');
  });

  it('extracts first item from errors array', () => {
    expect(extractErrorText({ errors: ['first', 'second'] })).toBe('first');
    expect(extractErrorText({ errors: [{ message: 'first' }] })).toBe('first');
  });

  it('extracts nested data.message', () => {
    expect(extractErrorText({ data: { message: 'wrapped' } })).toBe('wrapped');
    expect(extractErrorText({ data: { msg: 'wrapped' } })).toBe('wrapped');
    expect(extractErrorText({ data: { error: 'wrapped' } })).toBe('wrapped');
  });
});

describe('clampToastText', () => {
  it('trims and normalizes whitespace', () => {
    expect(clampToastText('  hello   world  ')).toBe('hello world');
  });

  it('returns empty string for empty input', () => {
    expect(clampToastText('')).toBe('');
    expect(clampToastText(null)).toBe('');
    expect(clampToastText(undefined)).toBe('');
  });

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(200);
    const result = clampToastText(long, 140);
    expect(result.length).toBe(140);
    expect(result.endsWith('…')).toBe(true);
  });

  it('keeps short text unchanged', () => {
    expect(clampToastText('short', 140)).toBe('short');
  });
});
