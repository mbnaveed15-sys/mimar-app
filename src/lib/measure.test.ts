import { describe, expect, it } from 'vitest';
import { isMeasureKey, parseMeasure } from './measure';
import { MM_PER_FOOT, MM_PER_INCH } from './units';

describe('Measurements box', () => {
  it('reads lengths in either unit system', () => {
    expect(parseMeasure(`12'6`, 'imperial', 'length')).toEqual({
      kind: 'length',
      mm: 12 * MM_PER_FOOT + 6 * MM_PER_INCH,
    });
    expect(parseMeasure('3.8m', 'imperial', 'length')).toEqual({ kind: 'length', mm: 3800 });
    expect(parseMeasure('12.5', 'imperial', 'length')).toEqual({ kind: 'length', mm: 12.5 * MM_PER_FOOT });
    expect(parseMeasure('-2', 'metric', 'length')).toEqual({ kind: 'length', mm: -2000 });
    expect(parseMeasure('abc', 'metric', 'length')).toBeNull();
    expect(parseMeasure('0', 'metric', 'length')).toBeNull();
  });

  it('reads a rectangle size as width, depth', () => {
    expect(parseMeasure(`12',10'`, 'imperial', 'pair')).toEqual({
      kind: 'pair',
      a: 12 * MM_PER_FOOT,
      b: 10 * MM_PER_FOOT,
    });
    expect(parseMeasure('4m; 3m', 'imperial', 'pair')).toEqual({ kind: 'pair', a: 4000, b: 3000 });
  });

  it('reads angles and copy counts', () => {
    expect(parseMeasure('90', 'imperial', 'angle')).toEqual({ kind: 'angle', deg: 90 });
    expect(parseMeasure('-45°', 'imperial', 'angle')).toEqual({ kind: 'angle', deg: -45 });
    expect(parseMeasure('3x', 'imperial', 'move')).toEqual({ kind: 'copies', n: 3, spread: false });
    expect(parseMeasure('*4', 'imperial', 'move')).toEqual({ kind: 'copies', n: 4, spread: false });
    expect(parseMeasure('/3', 'imperial', 'move')).toEqual({ kind: 'copies', n: 3, spread: true });
    expect(parseMeasure('5', 'metric', 'move')).toEqual({ kind: 'length', mm: 5000 });
  });

  it('lets letters switch tools until typing has started', () => {
    expect(isMeasureKey('1', '')).toBe(true);
    expect(isMeasureKey('m', '')).toBe(false);
    expect(isMeasureKey('m', '3.8')).toBe(true);
    expect(isMeasureKey('Enter', '3')).toBe(false);
  });
});
