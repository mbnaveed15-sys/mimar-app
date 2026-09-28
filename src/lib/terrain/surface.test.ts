import { describe, expect, it } from 'vitest';
import { buildSurface, contourLines, delaunay, earthworks, meshArea, profileAlong, type GroundPoint } from './surface';

/** A small seeded random number generator (mulberry32), so the tests always see the same points. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type XY = { x: number; y: number };

const cross = (a: XY, b: XY, c: XY) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

function randomPoints(n: number, size: number, seed: number): XY[] {
  const rnd = seeded(seed);
  return Array.from({ length: n }, () => ({ x: rnd() * size, y: rnd() * size }));
}

function grid(n: number, spacing: number): XY[] {
  const pts: XY[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push({ x: i * spacing, y: j * spacing });
  return pts;
}

/** Area of the convex hull of some points (monotone chain). */
function hullArea(points: XY[]): number {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = (list: XY[]) => {
    const h: XY[] = [];
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  const hull = [...half(p), ...half([...p].reverse())];
  return hull.reduce((s, a, i) => s + cross({ x: 0, y: 0 }, a, hull[(i + 1) % hull.length]), 0) / 2;
}

const plane = (x: number, y: number) => 2 * x + 3 * y + 100;

/** Random levels on the plane z = 2x + 3y + 100 over a 1000 square, with its corners. */
function planeLevels(): GroundPoint[] {
  const corners = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ];
  return [...corners, ...randomPoints(60, 1000, 7)].map((p) => ({ ...p, z: plane(p.x, p.y) }));
}

describe('delaunay', () => {
  it('splits a square in two and a 10 × 10 grid into 162 triangles, all counter-clockwise', () => {
    const square = grid(2, 10);
    expect(delaunay(square)).toHaveLength(2);
    const g = grid(10, 10);
    const tris = delaunay(g);
    expect(tris).toHaveLength(162);
    for (const [a, b, c] of tris) expect(cross(g[a], g[b], g[c])).toBeGreaterThan(0);
  });

  it('keeps every circumcircle empty and covers the convex hull', () => {
    const pts = randomPoints(200, 1000, 42);
    const tris = delaunay(pts);
    let area = 0;
    for (const [a, b, c] of tris) {
      const A = pts[a],
        B = pts[b],
        C = pts[c];
      expect(cross(A, B, C)).toBeGreaterThan(0);
      area += cross(A, B, C) / 2;
      const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
      const a2 = A.x ** 2 + A.y ** 2,
        b2 = B.x ** 2 + B.y ** 2,
        c2 = C.x ** 2 + C.y ** 2;
      const ux = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d;
      const uy = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d;
      const r = Math.hypot(A.x - ux, A.y - uy);
      pts.forEach((p, i) => {
        if (i !== a && i !== b && i !== c)
          expect(Math.hypot(p.x - ux, p.y - uy)).toBeGreaterThanOrEqual(r * (1 - 1e-9));
      });
    }
    expect(area).toBeCloseTo(hullArea(pts), 6);
  });

  it('merges duplicate points, keeping the first', () => {
    const pts = [...grid(2, 10), { x: 0, y: 0 }, { x: 10 + 1e-7, y: 10 }];
    const tris = delaunay(pts);
    expect(tris).toHaveLength(2);
    expect(tris.flat().every((i) => i < 4)).toBe(true);
  });

  it('gives no triangles for points in a line, or fewer than three', () => {
    expect(delaunay([0, 1, 2, 3, 4].map((i) => ({ x: i * 0.1, y: i * 0.3 })))).toEqual([]);
    expect(delaunay(grid(2, 10).slice(0, 2))).toEqual([]);
    expect(delaunay([])).toEqual([]);
  });
});

describe('buildSurface', () => {
  it('reproduces a plane inside the levels and stays flat beyond them', () => {
    const s = buildSurface(planeLevels());
    expect(s.empty).toBe(false);
    expect(s.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
    for (const p of randomPoints(500, 1000, 3))
      expect(Math.abs(s.heightAt(p.x, p.y) - plane(p.x, p.y))).toBeLessThan(1e-6);
    expect(s.heightAt(1500, 500)).toBeCloseTo(plane(1000, 500), 6);
    expect(s.heightAt(-300, -800)).toBeCloseTo(plane(0, 0), 6);
    expect(s.heightAt(400, 1200)).toBeCloseTo(plane(400, 1000), 6);
    expect(s.heightAt(NaN, 0)).toBe(0);
  });

  it('is flat at one level, zero with none, and linear along two', () => {
    const one = buildSurface([{ x: 5, y: 5, z: 300 }]);
    expect(one.heightAt(-100, 900)).toBe(300);
    const none = buildSurface([]);
    expect(none.empty).toBe(true);
    expect(none.bounds).toBeNull();
    expect(none.heightAt(10, 10)).toBe(0);
    const two = buildSurface([
      { x: 0, y: 0, z: 0 },
      { x: 100, y: 0, z: 1000 },
    ]);
    expect(two.triangles).toEqual([]);
    expect(two.heightAt(50, 30)).toBeCloseTo(500, 9);
    expect(two.heightAt(25, -40)).toBeCloseTo(250, 9);
    expect(two.heightAt(-50, 0)).toBe(0);
    expect(two.heightAt(200, 5)).toBe(1000);
  });
});

describe('contourLines', () => {
  it('draws straight lines across a plane at the right heights', () => {
    // z = x on a grid, so some levels pass exactly through points.
    const s = buildSurface(grid(11, 100).map((p) => ({ ...p, z: p.x })));
    const levels = contourLines(s, 250);
    expect(levels.map((l) => l.zMm)).toEqual(expect.arrayContaining([250, 500, 750]));
    for (const { zMm, lines } of levels) {
      for (const line of lines) for (const p of line) expect(p.x).toBeCloseTo(zMm, 9);
    }
    for (const z of [250, 500, 750]) {
      const { lines } = levels.find((l) => l.zMm === z)!;
      expect(lines).toHaveLength(1);
      const ys = lines[0].map((p) => p.y);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      expect(Math.max(...ys)).toBeCloseTo(1000, 9);
      for (let i = 1; i < ys.length; i++) expect(ys[i]).not.toBe(ys[i - 1]);
    }
  });

  it('draws closed loops round a peak', () => {
    const ring = Array.from({ length: 12 }, (_, i) => ({
      x: 100 * Math.cos((i * Math.PI) / 6),
      y: 100 * Math.sin((i * Math.PI) / 6),
      z: 0,
    }));
    const s = buildSurface([{ x: 0, y: 0, z: 1000 }, ...ring]);
    const levels = contourLines(s, 250);
    expect(levels.map((l) => l.zMm)).toEqual([250, 500, 750]);
    for (const { zMm, lines } of levels) {
      expect(lines).toHaveLength(1);
      const line = lines[0];
      expect(line).toHaveLength(13);
      expect(line[line.length - 1]).toEqual(line[0]);
      for (const p of line) {
        const along = Math.hypot(p.x, p.y) / (100 * (1 - zMm / 1000));
        expect(along).toBeGreaterThan(Math.cos(Math.PI / 12) - 1e-9);
        expect(along).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });
});

describe('meshArea', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const hole = [
    { x: 40, y: 40 },
    { x: 60, y: 40 },
    { x: 60, y: 60 },
    { x: 40, y: 60 },
  ];
  const inHole = (p: XY) => p.x > 40 && p.x < 60 && p.y > 40 && p.y < 60;

  for (const cell of [10, 7]) {
    it(`meshes a square less a hole (cell ${cell})`, () => {
      const m = meshArea(square, [hole], cell, (x, y) => x + 2 * y);
      let area = 0;
      for (const [a, b, c] of m.triangles) {
        const A = m.points[a],
          B = m.points[b],
          C = m.points[c];
        const mid = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
        expect(mid.x > 0 && mid.x < 100 && mid.y > 0 && mid.y < 100).toBe(true);
        expect(inHole(mid)).toBe(false);
        area += cross(A, B, C) / 2;
      }
      expect(Math.abs(area - 9600) / 9600).toBeLessThan(0.01);
      m.points.forEach((p, i) => expect(m.z[i]).toBe(p.x + 2 * p.y));
    });
  }
});

describe('earthworks', () => {
  // 10 m across (x), 20 m long; the ground rises 1 m across; finished flat at 0.5 m.
  const rect = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 2000 },
    { x: 0, y: 2000 },
  ];
  const natural = (x: number) => x;
  const finished = () => 500;

  it('balances cut and fill on an even slope', () => {
    // Each half: 5 m × 20 m at an average depth of 0.25 m.
    const e = earthworks(rect, [], natural, finished);
    expect(Math.abs(e.cutM3 - 25) / 25).toBeLessThan(0.01);
    expect(Math.abs(e.fillM3 - 25) / 25).toBeLessThan(0.01);
    expect(e.areaM2).toBeCloseTo(200, 6);
  });

  it('leaves a hole out', () => {
    // A 2 m square hole where the cut is 0.3 m deep on average.
    const hole = [
      { x: 700, y: 900 },
      { x: 900, y: 900 },
      { x: 900, y: 1100 },
      { x: 700, y: 1100 },
    ];
    const e = earthworks(rect, [hole], natural, finished);
    expect(Math.abs(e.cutM3 - 23.8) / 23.8).toBeLessThan(0.01);
    expect(Math.abs(e.fillM3 - 25) / 25).toBeLessThan(0.01);
    expect(Math.abs(e.areaM2 - 196) / 196).toBeLessThan(0.01);
  });
});

describe('profileAlong', () => {
  it('follows a plane, sorted, from end to end', () => {
    const s = buildSurface(planeLevels());
    const a = { x: 100, y: 200 },
      b = { x: 900, y: 700 };
    const len = Math.hypot(800, 500);
    const prof = profileAlong(s, a, b, 50);
    expect(prof[0].t).toBe(0);
    expect(prof[prof.length - 1].t).toBe(len);
    expect(prof.length).toBeGreaterThan(len / 50 + 5);
    for (let i = 1; i < prof.length; i++) expect(prof[i].t).toBeGreaterThan(prof[i - 1].t);
    for (const { t, zMm } of prof) {
      expect(zMm).toBeCloseTo(plane(a.x + (800 * t) / len, a.y + (500 * t) / len), 6);
    }
  });
});

describe('performance', () => {
  it('builds 5,000 levels and answers 20,000 heights quickly', () => {
    const rnd = seeded(11);
    const pts = randomPoints(5000, 10000, 5).map((p) => ({ ...p, z: rnd() * 3000 }));
    let t0 = performance.now();
    const s = buildSurface(pts);
    const build = performance.now() - t0;
    expect(s.triangles.length).toBeGreaterThan(9900);
    const queries = randomPoints(20000, 12000, 9).map((p) => ({ x: p.x - 1000, y: p.y - 1000 }));
    t0 = performance.now();
    let sum = 0;
    for (const q of queries) sum += s.heightAt(q.x, q.y);
    const heights = performance.now() - t0;
    expect(Number.isFinite(sum)).toBe(true);
    expect(build).toBeLessThan(2000);
    expect(heights).toBeLessThan(500);
  });
});
