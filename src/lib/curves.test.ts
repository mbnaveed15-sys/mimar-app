import { describe, expect, it } from 'vitest';
import { arcOf, pointAlong, projectOnWall, type WallLine } from './arc';
import {
  biarc,
  carrierOf,
  centreArc,
  circleSegs,
  crossings,
  endDirection,
  fractionOn,
  ovalInBox,
  ovalSegs,
  roundedRect,
  segThrough,
  splineSegs,
  tangentArc,
  trackSweep,
  withEndAt,
} from './curves';
import type { Point } from '../types';

const close = (a: Point, b: Point, tol = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
const startOf = (w: WallLine) => ({ x: w.x1, y: w.y1 });
const endOf = (w: WallLine) => ({ x: w.x2, y: w.y2 });

/** Each piece starts where the last ended (and, closed, the last ends at the first's start). */
function chained(segs: WallLine[], closed: boolean) {
  for (let i = 1; i < segs.length; i++) expect(close(endOf(segs[i - 1]), startOf(segs[i]))).toBe(true);
  if (closed) expect(close(endOf(segs[segs.length - 1]), startOf(segs[0]))).toBe(true);
}

/** Each joint is smooth: the direction leaving one piece is the direction entering the next. */
function smooth(segs: WallLine[], closed: boolean, tol = 1e-6) {
  const n = closed ? segs.length : segs.length - 1;
  for (let i = 0; i < n; i++) {
    const a = endDirection(segs[i], true);
    const b = endDirection(segs[(i + 1) % segs.length], false);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(tol);
  }
}

describe('arcs', () => {
  it('passes through three points', () => {
    const w = segThrough({ x: 0, y: 0 }, { x: 50, y: -20 }, { x: 100, y: 0 });
    expect(projectOnWall(w, { x: 50, y: -20 }).dist).toBeLessThan(1e-6);
  });

  it('carries on from a direction (tangent arc)', () => {
    for (const b of [
      { x: 100, y: 40 },
      { x: 100, y: -40 },
      { x: 20, y: 90 },
      { x: -30, y: 60 },
    ]) {
      const t = { x: 1, y: 0 };
      const w = tangentArc({ x: 0, y: 0 }, t, b);
      const d = endDirection(w, false);
      expect(close(d, t, 1e-6)).toBe(true);
      expect(close(endOf(w), b)).toBe(true);
    }
  });

  it('sweeps round a centre, past a half circle', () => {
    const c = { x: 0, y: 0 };
    const a = { x: 100, y: 0 };
    let s = 0;
    for (let i = 1; i <= 30; i++) {
      const ang = (i / 30) * 1.5 * Math.PI;
      s = trackSweep(s, c, a, { x: Math.cos(ang) * 80, y: Math.sin(ang) * 80 });
    }
    expect(s).toBeCloseTo(1.5 * Math.PI, 6);
    const w = centreArc(c, a, s);
    const arc = arcOf(w)!;
    expect(arc.r).toBeCloseTo(100, 6);
    expect(Math.abs(arc.sweep)).toBeCloseTo(1.5 * Math.PI, 6);
    // Three quarters round from +x (towards +y) ends at -y.
    expect(close(endOf(w), { x: 0, y: -100 }, 1e-6)).toBe(true);
  });
});

describe('circles and ovals', () => {
  it('makes a circle of two half circles', () => {
    const segs = circleSegs({ x: 10, y: 20 }, 50);
    chained(segs, true);
    for (const s of segs) {
      const arc = arcOf(s)!;
      expect(arc.r).toBeCloseTo(50, 6);
      expect(close({ x: arc.cx, y: arc.cy }, { x: 10, y: 20 }, 1e-6)).toBe(true);
    }
    // Together they go all the way round: top and bottom both on it.
    expect(projectOnWall(segs[0], { x: 10, y: -30 }).dist + projectOnWall(segs[1], { x: 10, y: 70 }).dist).toBeLessThan(
      1e-6,
    );
  });

  it('makes a smooth closed oval close to the ellipse', () => {
    for (const [A, B] of [
      [300, 150],
      [150, 300],
      [200, 190],
    ]) {
      const segs = ovalSegs({ x: 0, y: 0 }, A, B);
      expect(segs).toHaveLength(4);
      chained(segs, true);
      smooth(segs, true, 1e-6);
      // It reaches the ends of both axes.
      const on = (p: Point) => Math.min(...segs.map((s) => projectOnWall(s, p).dist));
      expect(on({ x: A, y: 0 })).toBeLessThan(1e-6);
      expect(on({ x: 0, y: B })).toBeLessThan(1e-6);
      // And keeps near the true ellipse in between.
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        expect(on({ x: A * Math.cos(t), y: B * Math.sin(t) })).toBeLessThan(0.05 * Math.max(A, B));
      }
    }
  });

  it('fits an oval in a box, and a square box makes a circle', () => {
    const segs = ovalInBox({ x: 0, y: 0 }, { x: 400, y: 200 });
    const xs = segs.flatMap((s) => [s.x1, s.x2, pointAlong(s, 0.5).x]);
    expect(Math.max(...xs)).toBeCloseTo(400, 6);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(ovalInBox({ x: 0, y: 0 }, { x: 100, y: 100 })).toHaveLength(2);
  });
});

describe('freeform curves', () => {
  const pts = [
    { x: 0, y: 0 },
    { x: 100, y: -50 },
    { x: 200, y: 20 },
    { x: 300, y: -10 },
  ];

  it('goes through every point, smoothly', () => {
    const segs = splineSegs(pts);
    chained(segs, false);
    smooth(segs, false, 1e-5);
    for (const p of pts) expect(Math.min(...segs.map((s) => projectOnWall(s, p).dist))).toBeLessThan(1e-6);
    expect(close(startOf(segs[0]), pts[0])).toBe(true);
    expect(close(endOf(segs[segs.length - 1]), pts[3])).toBe(true);
  });

  it('closes round to the first point', () => {
    const segs = splineSegs(pts, true);
    chained(segs, true);
    smooth(segs, true, 1e-5);
  });

  it('is straight through two points or points in a line', () => {
    expect(splineSegs([pts[0], pts[1]])).toHaveLength(1);
    const line = splineSegs([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 200, y: 0 },
    ]);
    expect(line.every((s) => !s.bow)).toBe(true);
  });

  it('builds a biarc with matching end directions', () => {
    const t0 = { x: 1, y: 0 };
    const t1 = { x: 0, y: 1 };
    const [a, b] = biarc({ x: 0, y: 0 }, t0, { x: 100, y: 100 }, t1);
    expect(close(endDirection(a, false), t0, 1e-6)).toBe(true);
    expect(close(endDirection(b, true), t1, 1e-6)).toBe(true);
    smooth([a, b], false);
  });
});

describe('rounded rectangles', () => {
  it('rounds each corner with a quarter circle', () => {
    const segs = roundedRect({ x: 0, y: 0 }, { x: 400, y: 300 }, 50);
    expect(segs).toHaveLength(8);
    chained(segs, true);
    smooth(segs, true);
    expect(segs.filter((s) => arcOf(s)).every((s) => Math.abs(arcOf(s)!.r - 50) < 1e-6)).toBe(true);
  });

  it('is a plain rectangle with no radius, and a radius too big is cut to fit', () => {
    expect(roundedRect({ x: 0, y: 0 }, { x: 400, y: 300 }, 0)).toHaveLength(4);
    // Half the short side: the short sides are all curve.
    const pill = roundedRect({ x: 0, y: 0 }, { x: 400, y: 300 }, 999);
    expect(pill).toHaveLength(6);
    chained(pill, true);
  });
});

describe('lines and circles', () => {
  it('finds where lines and circles cross', () => {
    const line = carrierOf({ x1: -200, y1: 0, x2: 200, y2: 0 });
    const circle = { kind: 'circle' as const, c: { x: 0, y: 0 }, r: 100 };
    const hits = crossings(line, circle);
    expect(hits).toHaveLength(2);
    expect(hits.map((p) => Math.round(p.x)).sort((a, b) => a - b)).toEqual([-100, 100]);
    const other = { kind: 'circle' as const, c: { x: 100, y: 0 }, r: 100 };
    expect(crossings(circle, other)).toHaveLength(2);
    expect(crossings(circle, { kind: 'circle', c: { x: 500, y: 0 }, r: 10 })).toHaveLength(0);
  });

  it('moves the end of an arc round its circle, keeping the other end', () => {
    // A quarter circle from (100, 0) round to (0, 100) about the origin.
    const w = segThrough({ x: 100, y: 0 }, { x: Math.SQRT1_2 * 100, y: Math.SQRT1_2 * 100 }, { x: 0, y: 100 });
    const longer = withEndAt(w, 'start', { x: -100, y: 0 });
    expect(close(startOf(longer), { x: 100, y: 0 })).toBe(true);
    expect(close(endOf(longer), { x: -100, y: 0 }, 1e-6)).toBe(true);
    expect(Math.abs(arcOf(longer)!.sweep)).toBeCloseTo(Math.PI, 6);
    const shorter = withEndAt(w, 'end', { x: Math.SQRT1_2 * 100, y: Math.SQRT1_2 * 100 });
    expect(Math.abs(arcOf(shorter)!.sweep)).toBeCloseTo(Math.PI / 4, 6);
    expect(fractionOn(w, { x: -100, y: 0 })).toBeCloseTo(2, 6);
    expect(fractionOn(w, { x: 0, y: -100 }, true)).toBeCloseTo(-1, 6);
  });
});
