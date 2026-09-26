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
    // A bare metric number is millimetres, as in AutoCAD.
    expect(parseMeasure('-2000', 'metric', 'length')).toEqual({ kind: 'length', mm: -2000 });
    expect(parseMeasure('abc', 'metric', 'length')).toBeNull();
    // Zero is read (a square fillet); tools that can't use it say so.
    expect(parseMeasure('0', 'metric', 'length')).toEqual({ kind: 'length', mm: 0 });
    // Fractions of an inch.
    expect(parseMeasure(`12'6-1/2"`, 'imperial', 'length')).toEqual({
      kind: 'length',
      mm: 12 * MM_PER_FOOT + 6.5 * MM_PER_INCH,
    });
    expect(parseMeasure(`6 1/2"`, 'imperial', 'length')).toEqual({ kind: 'length', mm: 6.5 * MM_PER_INCH });
  });

  it('reads AutoCAD points: @x,y and length<angle (0° to the right, counter-clockwise)', () => {
    expect(parseMeasure(`@3',4'`, 'imperial', 'length')).toEqual({
      kind: 'vector',
      dx: 3 * MM_PER_FOOT,
      dy: 4 * MM_PER_FOOT,
    });
    const polar = parseMeasure(`10'<90`, 'imperial', 'length')!;
    expect(polar.kind).toBe('vector');
    if (polar.kind === 'vector') {
      expect(polar.dx).toBeCloseTo(0);
      expect(polar.dy).toBeCloseTo(10 * MM_PER_FOOT);
    }
    expect(parseMeasure('@2000<45', 'metric', 'move')?.kind).toBe('vector');
    expect(parseMeasure(`@12',10'`, 'imperial', 'pair')).toEqual({
      kind: 'pair',
      a: 12 * MM_PER_FOOT,
      b: 10 * MM_PER_FOOT,
    });
    expect(isMeasureKey('@', '')).toBe(true);
    expect(isMeasureKey('<', '10')).toBe(true);
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
    expect(parseMeasure('5 m', 'metric', 'move')).toEqual({ kind: 'length', mm: 5000 });
  });

  it('lets letters switch tools until typing has started', () => {
    expect(isMeasureKey('1', '')).toBe(true);
    expect(isMeasureKey('m', '')).toBe(false);
    expect(isMeasureKey('m', '3.8')).toBe(true);
    expect(isMeasureKey('Enter', '3')).toBe(false);
  });
});
