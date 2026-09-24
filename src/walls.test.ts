import { describe, expect, it } from 'vitest';
import type { Wall } from './types';
import { DEFAULT_WALL_THICKNESS, thicknessOf, wallPolygon } from './walls';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thickness = 20): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
  thickness,
});

describe('wall outlines', () => {
  it('uses the default 9 inch thickness for older walls', () => {
    expect(thicknessOf({ id: 'a', type: 'wall', x1: 0, y1: 0, x2: 1, y2: 0 })).toBe(DEFAULT_WALL_THICKNESS);
    expect(DEFAULT_WALL_THICKNESS).toBeCloseTo(22.86);
  });

  it('keeps free ends flush and extends joined ends by half the thickness', () => {
    const a = wall('a', 0, 0, 100, 0);
    const b = wall('b', 100, 0, 100, 100);
    const [p1, p2, p3, p4] = wallPolygon(a, [a, b]);
    // Free start stays at x = 0; the joined end reaches the outer face of b at x = 110.
    expect([p1.x, p2.x, p3.x, p4.x]).toEqual([0, 110, 110, 0]);
    expect([p1.y, p3.y]).toEqual([10, -10]);
  });

  it('treats a wall ending on the middle of another (T-junction) as joined', () => {
    const top = wall('top', 0, 0, 200, 0);
    const divider = wall('d', 100, 0, 100, 80);
    const ys = wallPolygon(divider, [top, divider]).map((p) => p.y);
    expect(Math.min(...ys)).toBe(-10);
    expect(Math.max(...ys)).toBe(80);
  });
});
