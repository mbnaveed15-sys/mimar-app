import { describe, expect, it } from 'vitest';
import { dimStyleOf, endMark } from './dimStyle';

describe('dimension style', () => {
  it('defaults to medium text and ticks', () => {
    expect(dimStyleOf({})).toEqual({ text: 'medium', ends: 'tick' });
    expect(dimStyleOf({ drawing: { dimText: 'large', dimEnds: 'dot' } })).toEqual({ text: 'large', ends: 'dot' });
  });

  it('draws a slash, an arrow pointing out at each end, or a dot', () => {
    const p = { x: 0, y: 0 };
    const u = { x: 1, y: 0 };
    const n = { x: 0, y: 1 };
    expect(endMark('tick', p, u, n, 1, 4)).toEqual({ kind: 'line', a: { x: -4, y: 4 }, b: { x: 4, y: -4 } });
    const start = endMark('arrow', p, u, n, 1, 4);
    const end = endMark('arrow', p, u, n, -1, 4);
    if (start.kind !== 'fill' || end.kind !== 'fill') throw new Error('arrows are filled');
    // The tip is at the point; the base lies inside the dimension line.
    expect(start.pts[0]).toEqual(p);
    expect(start.pts[1].x).toBeGreaterThan(0);
    expect(end.pts[1].x).toBeLessThan(0);
    expect(endMark('dot', p, u, n, 1, 4)).toMatchObject({ kind: 'dot', c: p });
  });
});
