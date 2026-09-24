import { describe, expect, it } from 'vitest';
import { formatLength, parseLength } from './units';

describe('formatLength', () => {
  it('formats feet and inches, rounding to the nearest inch', () => {
    expect(formatLength(3810, 'imperial')).toBe(`12' 6"`);
    expect(formatLength(3048, 'imperial')).toBe(`10' 0"`);
    expect(formatLength(152.4, 'imperial')).toBe(`6"`);
    expect(formatLength(3657.6 - 5, 'imperial')).toBe(`12' 0"`); // 11' 11.8" rounds up
  });

  it('formats metric as metres or millimetres', () => {
    expect(formatLength(3500, 'metric')).toBe('3.50 m');
    expect(formatLength(850, 'metric')).toBe('850 mm');
  });
});

describe('parseLength', () => {
  const ft = (f: number, i = 0) => f * 304.8 + i * 25.4;

  it.each([
    [`12' 6"`, ft(12, 6)],
    [`12'6"`, ft(12, 6)],
    [`12'6`, ft(12, 6)],
    [`12 ft 6 in`, ft(12, 6)],
    [`12ft`, ft(12)],
    [`12.5'`, ft(12.5)],
    [`6"`, ft(0, 6)],
    [`6 in`, ft(0, 6)],
    [`12`, ft(12)],
  ])('reads imperial %s', (text, mm) => {
    expect(parseLength(text, 'imperial')).toBeCloseTo(mm);
  });

  it.each([
    ['3.5 m', 3500],
    ['350cm', 3500],
    ['3500 mm', 3500],
    ['3.5', 3500],
  ])('reads metric %s', (text, mm) => {
    expect(parseLength(text, 'metric')).toBeCloseTo(mm);
  });

  it('accepts the other unit system when a unit is typed', () => {
    expect(parseLength('3 m', 'imperial')).toBe(3000);
    expect(parseLength(`10'`, 'metric')).toBeCloseTo(3048);
  });

  it.each(['', 'abc', '12 apples', `'`, '-'])('rejects %j', (text) => {
    expect(parseLength(text, 'imperial')).toBeNull();
  });
});
