import { describe, expect, it } from 'vitest';
import { offsetPolygon } from './structureTools';

describe('slab outlines', () => {
  it('grows a room outline out to the wall centres', () => {
    for (const square of [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      ],
    ]) {
      const out = offsetPolygon(square, 2);
      const xs = out.map((p) => p.x);
      expect(Math.min(...xs)).toBeCloseTo(-2);
      expect(Math.max(...xs)).toBeCloseTo(12);
    }
  });
});
