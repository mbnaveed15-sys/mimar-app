import { describe, expect, it } from 'vitest';
import { groundAt, mergeLines, project, rightOf, type Line2, type Prism, type ViewFrame } from './hiddenLines';

/** A box in scene metres: x0..x0+w, z0..z0+d, y0..y0+h. */
const box = (x0: number, z0: number, w: number, d: number, y0 = 0, h = 1): Prism => ({
  rings: [
    [
      [x0, y0, z0],
      [x0 + w, y0, z0],
      [x0 + w, y0, z0 + d],
      [x0, y0, z0 + d],
    ],
  ],
  extrude: [0, h, 0],
});

/** Looking up the page (towards -z) from z = 10: u is x, v is height. */
const ELEVATION: ViewFrame = { origin: { x: 0, z: 10 }, look: { x: 0, z: -1 }, cut: false };

const round = (l: Line2) => ({
  a: l.a.map((n) => Math.round(n * 1000) / 1000),
  b: l.b.map((n) => Math.round(n * 1000) / 1000),
  heavy: !!l.heavy,
});
const has = (lines: Line2[], a: [number, number], b: [number, number]) =>
  lines
    .map(round)
    .some(
      (l) =>
        (l.a[0] === a[0] && l.a[1] === a[1] && l.b[0] === b[0] && l.b[1] === b[1]) ||
        (l.a[0] === b[0] && l.a[1] === b[1] && l.b[0] === a[0] && l.b[1] === a[1]),
    );

describe('hidden lines', () => {
  it('looks to the right of the way it faces', () => {
    const r = rightOf({ x: 0, z: -1 });
    expect([r.x, r.z + 0]).toEqual([1, 0]);
    const s = rightOf({ x: 1, z: 0 });
    expect([s.x + 0, s.z]).toEqual([0, 1]);
  });

  it('draws a lone box as its heavy outline', () => {
    const p = project([box(0, 0, 1, 1)], ELEVATION);
    expect(p.cut).toEqual([]);
    expect(p.lines).toHaveLength(4);
    expect(p.lines.every((l) => l.heavy)).toBe(true);
    expect(p.bounds).toEqual({ minU: 0, maxU: 1, minV: 0, maxV: 1 });
  });

  it('hides what is behind', () => {
    const p = project([box(0, 1, 2, 1, 0, 2), box(0.5, 0, 0.5, 0.5)], ELEVATION);
    expect(p.lines).toHaveLength(4);
    expect(has(p.lines, [0, 2], [2, 2])).toBe(true);
  });

  it('draws what is in front in thin lines over the wall behind', () => {
    const p = project([box(0, 1, 2, 1, 0, 2), box(0.5, 3, 0.5, 1)], ELEVATION);
    // The small box's sides and top stand against the wall: thin.
    expect(has(p.lines, [0.5, 0], [0.5, 1])).toBe(true);
    expect(p.lines.find((l) => round(l).a[0] === 0.5 && round(l).b[0] === 0.5)?.heavy).toBeFalsy();
    expect(has(p.lines, [0, 2], [2, 2])).toBe(true);
  });

  it('leaves out the joint between two flush boxes and joins their edges', () => {
    const p = project([box(0, 0, 1, 1), box(1, 0, 1, 1)], ELEVATION);
    expect(has(p.lines, [0, 1], [2, 1])).toBe(true);
    expect(has(p.lines, [1, 0], [1, 1])).toBe(false);
    expect(p.lines).toHaveLength(4);
  });

  it('cuts a section: fills what the plane passes through and draws only what is beyond', () => {
    const frame: ViewFrame = { origin: { x: 0, z: 0.5 }, look: { x: 0, z: -1 }, cut: true };
    const p = project([box(0, 0, 1, 1), box(0, 2, 1, 1), box(2, -2, 1, 1)], frame);
    expect(p.cut).toHaveLength(1);
    const ring = p.cut[0][0];
    const us = ring.map((q) => q[0]);
    const vs = ring.map((q) => q[1]);
    expect([Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]).toEqual([0, 1, 0, 1]);
    // The box behind the viewer isn't there; the one beyond is drawn in lines.
    expect(has(p.lines, [2, 1], [3, 1])).toBe(true);
    expect(p.bounds).toEqual({ minU: 0, maxU: 3, minV: 0, maxV: 1 });
  });

  it('leaves out what is below the ground in an elevation', () => {
    const p = project([box(0, 0, 1, 1, -1, 2)], { ...ELEVATION, minV: 0 });
    expect(p.bounds?.minV).toBe(0);
    expect(p.lines.every((l) => l.a[1] >= 0 && l.b[1] >= 0)).toBe(true);
  });

  it('merges lines laid end to end, whichever way they point', () => {
    const merged = mergeLines([
      { a: [0, 0], b: [1, 0] },
      { a: [2, 0], b: [1, 0] },
      { a: [0.5, 0], b: [1.5, 0] },
      { a: [5, 0], b: [6, 0] },
      { a: [0, 0], b: [0, 1], heavy: true },
      { a: [0, 1], b: [0, 0] },
    ]);
    expect(merged.map(round)).toHaveLength(4);
    expect(has(merged, [0, 0], [2, 0])).toBe(true);
    expect(has(merged, [5, 0], [6, 0])).toBe(true);
  });
});

describe('ground on an elevation', () => {
  it('leaves out what is below a sloping ground line, and keeps what is above it', () => {
    // A 4 m wide, 3 m tall box, with the ground rising from 0 at its left to 2 m at its right.
    const ground: [number, number][] = [
      [-1, 0],
      [0, 0],
      [4, 2],
      [5, 2],
    ];
    const p = project([box(0, 0, 4, 1, 0, 3)], { ...ELEVATION, ground });
    expect(p.lines.length).toBeGreaterThan(0);
    for (const l of p.lines)
      for (const [u, v] of [l.a, l.b]) expect(v).toBeGreaterThanOrEqual(groundAt(ground, u) - 1e-6);
    // The top is whole; the right side only shows above 2 m; the bottom is buried.
    expect(has(p.lines, [0, 3], [4, 3])).toBe(true);
    expect(has(p.lines, [4, 2], [4, 3])).toBe(true);
    expect(p.lines.some((l) => l.a[1] < 1e-6 && l.b[1] < 1e-6 && Math.abs(l.a[0] - l.b[0]) > 1)).toBe(false);
  });

  it('reads the ground level beyond its ends', () => {
    const ground: [number, number][] = [
      [0, 1],
      [2, 3],
    ];
    expect(groundAt(ground, -5)).toBe(1);
    expect(groundAt(ground, 1)).toBeCloseTo(2);
    expect(groundAt(ground, 9)).toBe(3);
  });
});
