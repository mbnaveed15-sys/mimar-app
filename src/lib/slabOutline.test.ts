import { describe, expect, it } from 'vitest';
import { polygonArea } from '../rooms';
import type { Point, Wall } from '../types';
import { joinOutlines, roomsSlab, wallsOutlineAt } from './slabOutline';

const box = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
  thickness: 22.86,
});

describe('slab outlines that follow the plan', () => {
  it('joins rooms sharing a side, even one that meets two smaller rooms', () => {
    // An L: a long room, and two rooms side by side along its bottom (one of them past its end).
    const joined = joinOutlines([box(0, 0, 600, 300), box(0, 300, 300, 500), box(300, 300, 900, 500)]);
    expect(joined).toHaveLength(1);
    expect(joined[0].holes).toEqual([]);
    expect(polygonArea(joined[0].outline)).toBeCloseTo(600 * 300 + 900 * 200);
    // The corners of an L-shape and no more.
    expect(joined[0].outline).toHaveLength(6);
  });

  it('keeps rooms apart when they only meet at a corner, and leaves a courtyard open', () => {
    expect(joinOutlines([box(0, 0, 100, 100), box(100, 100, 200, 200)])).toHaveLength(2);
    // Eight rooms round a middle one that isn't picked.
    const ring = [
      [0, 0],
      [100, 0],
      [200, 0],
      [0, 100],
      [200, 100],
      [0, 200],
      [100, 200],
      [200, 200],
    ].map(([x, y]) => box(x, y, x + 100, y + 100));
    const [one] = joinOutlines(ring);
    expect(one.holes).toHaveLength(1);
    expect(polygonArea(one.holes[0])).toBeCloseTo(100 * 100);
  });

  it('covers picked rooms out to the outside walls, stopping halfway over a wall shared with a room left out', () => {
    const walls = [
      wall('a', 0, 0, 1000, 0),
      wall('b', 1000, 0, 1000, 400),
      wall('c', 1000, 400, 0, 400),
      wall('d', 0, 400, 0, 0),
      wall('e', 500, 0, 500, 400),
    ];
    const [slab] = roomsSlab([box(0, 0, 500, 400)], walls);
    const xs = slab.outline.map((p) => p.x);
    const ys = slab.outline.map((p) => p.y);
    const t = 22.86 / 2;
    expect(Math.min(...xs)).toBeCloseTo(-t);
    expect(Math.max(...xs)).toBeCloseTo(500);
    expect(Math.min(...ys)).toBeCloseTo(-t);
    expect(Math.max(...ys)).toBeCloseTo(400 + t);
    // Both rooms: one slab over the whole house, out to its outside faces.
    const [both] = roomsSlab([box(0, 0, 500, 400), box(500, 0, 1000, 400)], walls);
    expect(polygonArea(both.outline)).toBeCloseTo((1000 + 2 * t) * (400 + 2 * t));
    // Follow the walls gives the same.
    expect(polygonArea(wallsOutlineAt(walls, { x: 100, y: 100 })!)).toBeCloseTo((1000 + 2 * t) * (400 + 2 * t));
  });
});
