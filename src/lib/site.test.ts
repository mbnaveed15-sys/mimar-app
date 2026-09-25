import { describe, expect, it } from 'vitest';
import type { Plot } from '../types';
import { boundaryWallLines, buildableArea, buildingGuide, plotRect, stairLayout } from './site';

describe('plot and setbacks', () => {
  // 25' × 45' plot (5 marla), plan units of 10 mm; front (road) along the bottom edge.
  const plot: Plot = {
    id: 'p',
    type: 'plot',
    points: plotRect({ x: 0, y: 0 }, { x: 762, y: 1371.6 }),
    front: 2,
    setbacks: { front: 1524, rear: 609.6, sides: 0 },
  };

  it('takes the front, rear and side setbacks off the plot', () => {
    const b = buildableArea(plot);
    const ys = b.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(60.96); // 2' at the rear (top)
    expect(Math.max(...ys)).toBeCloseTo(1371.6 - 152.4); // 5' at the front (bottom)
    expect(Math.min(...b.map((p) => p.x))).toBeCloseTo(0);
  });

  it('sets the building line in by half an item, per side, for snapping', () => {
    // A 9" wall: its centre line runs 4½" inside the building line all round.
    const wall = buildingGuide(plot, () => 11.43);
    expect(Math.min(...wall.map((p) => p.y))).toBeCloseTo(60.96 + 11.43);
    expect(Math.max(...wall.map((p) => p.y))).toBeCloseTo(1371.6 - 152.4 - 11.43);
    expect(Math.min(...wall.map((p) => p.x))).toBeCloseTo(11.43);
    // A 9" × 12" column: 4½" in from the sides, 6" in from the front and rear.
    const column = buildingGuide(plot, (d) => (Math.abs(d.y) * 22.86 + Math.abs(d.x) * 30.48) / 2);
    expect(Math.min(...column.map((p) => p.x))).toBeCloseTo(11.43);
    expect(Math.min(...column.map((p) => p.y))).toBeCloseTo(60.96 + 15.24);
  });

  it('puts boundary walls just inside the plot line', () => {
    const lines = boundaryWallLines(plot, 22.86);
    expect(lines).toHaveLength(4);
    expect(lines[0][0].x).toBeCloseTo(11.43);
    expect(lines[0][0].y).toBeCloseTo(11.43);
  });
});

describe('stairs maker', () => {
  const base = { width: 91.44, treadMm: 254 }; // 3' wide, 10" treads

  it('works out risers no steeper than 7", and the length of a straight flight', () => {
    const s = stairLayout({ ...base, shape: 'straight', riseMm: 3200 });
    expect(s.risers).toBe(18); // 3200 / 18 = 177.8 mm, just within 7"
    expect(s.riserMm).toBeCloseTo(3200 / 18);
    expect(s.parts).toHaveLength(17);
    expect(s.h).toBeCloseTo(17 * 25.4);
    expect(s.parts[16].topMm).toBeCloseTo(17 * (3200 / 18));
  });

  it('turns L and U stairs round a landing', () => {
    const L = stairLayout({ ...base, shape: 'L', riseMm: 3200 });
    expect(L.parts.filter((p) => p.kind === 'landing')).toHaveLength(1);
    expect(L.parts.filter((p) => p.kind === 'tread')).toHaveLength(16);
    const U = stairLayout({ ...base, shape: 'U', riseMm: 3200 });
    expect(U.w).toBeCloseTo(2 * 91.44 + 10);
    expect(U.parts.at(-1)!.topMm).toBeCloseTo(17 * (3200 / 18));
  });

  it('makes ramps 1 in 12', () => {
    const r = stairLayout({ ...base, shape: 'ramp', riseMm: 457.2 });
    expect(r.h).toBeCloseTo(548.64);
  });
});
