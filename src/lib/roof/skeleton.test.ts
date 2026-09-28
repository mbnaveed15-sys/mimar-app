import { describe, expect, it } from 'vitest';
import type { Point } from '../../types';
import { shedRoof, skeletonRoof, type Point3, type RoofShape } from './skeleton';

const P = (x: number, y: number): Point => ({ x, y });
const pts = (...xy: number[]): Point[] => xy.flatMap((v, i) => (i % 2 ? [] : [P(v, xy[i + 1])]));

/** True area of a planar 3D polygon (Newell's method). */
function area3(poly: Point3[]): number {
  let x = 0;
  let y = 0;
  let z = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    x += (a.y - b.y) * (a.z + b.z);
    y += (a.z - b.z) * (a.x + b.x);
    z += (a.x - b.x) * (a.y + b.y);
  });
  return Math.hypot(x, y, z) / 2;
}

/** Plan area of a polygon, unsigned. */
function planArea(poly: { x: number; y: number }[]): number {
  let s = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  });
  return Math.abs(s) / 2;
}

const len3 = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const kinds = (r: RoofShape, kind: string) => r.lines.filter((l) => l.kind === kind);
const sloped = (r: RoofShape) => r.faces.filter((f) => !f.vertical);

/** The sloped faces tile the outline in plan, and every face is planar. */
function expectTiles(r: RoofShape, outline: Point[]) {
  const total = sloped(r).reduce((s, f) => s + planArea(f.points), 0);
  expect(Math.abs(total - planArea(outline)) / planArea(outline)).toBeLessThan(1e-6);
  for (const f of r.faces) {
    const [a, b, c] = f.points;
    // Normal from the first corner and the face's widest spread.
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    let best = { x: 0, y: 0, z: 0 };
    for (const p of f.points.slice(2)) {
      const v = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };
      const nrm = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      if (Math.hypot(nrm.x, nrm.y, nrm.z) > Math.hypot(best.x, best.y, best.z)) best = nrm;
    }
    const l = Math.hypot(best.x, best.y, best.z);
    expect(l).toBeGreaterThan(0);
    for (const p of f.points) {
      expect(Math.abs(((p.x - a.x) * best.x + (p.y - a.y) * best.y + (p.z - a.z) * best.z) / l)).toBeLessThan(1e-6);
    }
    expect(c).toBeDefined();
  }
}

/** Samples a grid inside the outline: heights stay between 0 and the peak and change no faster than the slope. */
function expectContinuous(r: RoofShape, outline: Point[], slope: number, step: number) {
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const grid = new Map<string, number>();
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      const h = r.heightAt(P(x, y));
      if (h === null) continue;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(r.peak + 1e-9);
      grid.set(`${x},${y}`, h);
    }
  }
  expect(grid.size).toBeGreaterThan(20);
  for (const [key, h] of grid) {
    const [x, y] = key.split(',').map(Number);
    for (const [dx, dy] of [
      [step, 0],
      [0, step],
    ]) {
      const o = grid.get(`${x + dx},${y + dy}`);
      if (o === undefined || r.heightAt(P(x + dx / 2, y + dy / 2)) === null) continue;
      expect(Math.abs(o - h)).toBeLessThanOrEqual(step * slope * 1.0001);
    }
  }
}

const rect = pts(0, 0, 1000, 0, 1000, 600, 0, 600);
const ell = pts(0, 0, 1000, 0, 1000, 400, 400, 400, 400, 1000, 0, 1000);
const tee = pts(400, 0, 800, 0, 800, 800, 1200, 800, 1200, 1200, 0, 1200, 0, 800, 400, 800);
const you = pts(0, 0, 1200, 0, 1200, 1000, 800, 1000, 800, 400, 400, 400, 400, 1000, 0, 1000);

describe('skeletonRoof', () => {
  it('hips a rectangle', () => {
    const r = skeletonRoof(rect, 1);
    expect(r.peak).toBeCloseTo(300, 6);
    const ridges = kinds(r, 'ridge');
    expect(ridges).toHaveLength(1);
    expect(len3(ridges[0].a, ridges[0].b)).toBeCloseTo(400, 6);
    expect(ridges[0].a.z).toBeCloseTo(300, 6);
    expect(ridges[0].b.z).toBeCloseTo(300, 6);
    expect(kinds(r, 'hip')).toHaveLength(4);
    expect(kinds(r, 'valley')).toHaveLength(0);
    expect(kinds(r, 'eave')).toHaveLength(4);
    expect(r.faces).toHaveLength(4);
    expect(r.faces.every((f) => !f.vertical)).toBe(true);
    expect(r.faces.map((f) => f.points.length)).toEqual([4, 3, 4, 3]);
    r.faces.forEach((f, i) => {
      expect(f.edge).toBe(i);
      expect(f.points[0]).toEqual({ ...rect[i], z: 0 });
      expect(f.points[1]).toEqual({ ...rect[(i + 1) % 4], z: 0 });
    });
    const trueArea = r.faces.reduce((s, f) => s + area3(f.points), 0);
    expect(trueArea).toBeCloseTo(600000 * Math.SQRT2, 3);
    expectTiles(r, rect);
    expect(r.heightAt(P(500, 300))).toBeCloseTo(300, 6);
    expect(r.heightAt(P(100, 300))).toBeCloseTo(100, 6);
    expect(r.heightAt(P(500, 50))).toBeCloseTo(50, 6);
    expect(r.heightAt(P(-1, 300))).toBeNull();
  });

  it('gables the short ends of a rectangle', () => {
    const r = skeletonRoof(rect, 1, [false, true, false, true]);
    expect(r.peak).toBeCloseTo(300, 6);
    const ridges = kinds(r, 'ridge');
    expect(ridges).toHaveLength(1);
    expect(len3(ridges[0].a, ridges[0].b)).toBeCloseTo(1000, 6);
    expect(ridges[0].a.z).toBeCloseTo(300, 6);
    expect(kinds(r, 'hip')).toHaveLength(0);
    expect(kinds(r, 'eave')).toHaveLength(2);
    // Four rakes and the two gable walls' bottom edges.
    expect(kinds(r, 'verge')).toHaveLength(6);
    const walls = r.faces.filter((f) => f.vertical);
    expect(walls.map((f) => f.edge)).toEqual([1, 3]);
    for (const w of walls) {
      expect(w.points).toHaveLength(3);
      expect(area3(w.points)).toBeCloseTo((600 * 300) / 2, 6);
    }
    const slopes = sloped(r);
    expect(slopes.map((f) => f.points.length)).toEqual([4, 4]);
    for (const f of slopes) expect(area3(f.points)).toBeCloseTo(1000 * 300 * Math.SQRT2, 3);
    expectTiles(r, rect);
    expect(r.heightAt(P(0, 150))).toBeCloseTo(150, 6);
    expect(r.heightAt(P(500, 450))).toBeCloseTo(150, 6);
  });

  it('makes a pyramid on a square', () => {
    const sq = pts(0, 0, 800, 0, 800, 800, 0, 800);
    const r = skeletonRoof(sq, 0.5);
    expect(r.peak).toBeCloseTo(200, 6);
    expect(kinds(r, 'ridge')).toHaveLength(0);
    const hips = kinds(r, 'hip');
    expect(hips).toHaveLength(4);
    for (const h of hips) {
      expect(h.b.x).toBeCloseTo(400, 6);
      expect(h.b.y).toBeCloseTo(400, 6);
      expect(h.b.z).toBeCloseTo(200, 6);
    }
    expect(r.faces.map((f) => f.points.length)).toEqual([3, 3, 3, 3]);
    expectTiles(r, sq);
  });

  it('roofs an L with a valley from the reflex corner', () => {
    const r = skeletonRoof(ell, 1);
    expect(r.peak).toBeCloseTo(200, 6);
    const valleys = kinds(r, 'valley');
    expect(valleys).toHaveLength(1);
    expect(valleys[0].a).toEqual({ x: 400, y: 400, z: 0 });
    expect(valleys[0].b.x).toBeCloseTo(200, 6);
    expect(valleys[0].b.y).toBeCloseTo(200, 6);
    expect(valleys[0].b.z).toBeCloseTo(200, 6);
    expect(kinds(r, 'hip')).toHaveLength(5);
    expect(kinds(r, 'ridge')).toHaveLength(2);
    expect(r.faces).toHaveLength(6);
    expectTiles(r, ell);
    // Distance to the nearest eave line in each arm.
    const cases: [number, number, number][] = [
      [800, 100, 100],
      [700, 300, 100],
      [900, 200, 100],
      [100, 800, 100],
      [300, 700, 100],
      [300, 150, 150],
      [150, 300, 150],
      [200, 200, 200],
      [250, 250, 150],
      [600, 200, 200],
    ];
    for (const [x, y, h] of cases) expect(r.heightAt(P(x, y))).toBeCloseTo(h, 6);
    expect(r.heightAt(P(700, 700))).toBeNull();
    expectContinuous(r, ell, 1, 25);
  });

  it('roofs a T and a U', () => {
    for (const shape of [tee, you]) {
      const r = skeletonRoof(shape, 1);
      expect(r.peak).toBeCloseTo(200, 6);
      expectTiles(r, shape);
      expect(kinds(r, 'valley')).toHaveLength(2);
      for (let i = 0; i < shape.length; i++) {
        const a = shape[i];
        const b = shape[(i + 1) % shape.length];
        for (const u of [0, 0.25, 0.5, 0.9]) {
          expect(r.heightAt(P(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u))).toBeCloseTo(0, 6);
        }
      }
      expectContinuous(r, shape, 1, 30);
    }
    // The T's stem and bar ridges, and the U's arms.
    expect(skeletonRoof(tee, 1).heightAt(P(600, 500))).toBeCloseTo(200, 6);
    expect(skeletonRoof(tee, 1).heightAt(P(100, 1000))).toBeCloseTo(100, 6);
    expect(skeletonRoof(you, 1).heightAt(P(1000, 800))).toBeCloseTo(200, 6);
    expect(skeletonRoof(you, 1).heightAt(P(600, 100))).toBeCloseTo(100, 6);
  });

  it('does not depend on the winding', () => {
    for (const shape of [rect, ell, tee, you]) {
      const gable = shape.map((_, i) => i === 1);
      const fwd = skeletonRoof(shape, 0.7, gable);
      const rev = shape.slice().reverse();
      // Reversed, edge i runs from rev[i] to rev[i+1], which is the forward edge n-2-i.
      const n = shape.length;
      const back = skeletonRoof(
        rev,
        0.7,
        rev.map((_, i) => gable[(2 * n - 2 - i) % n]),
      );
      expect(back.peak).toBeCloseTo(fwd.peak, 9);
      expect(back.faces).toHaveLength(fwd.faces.length);
      expect(back.lines).toHaveLength(fwd.lines.length);
      for (let x = 0; x <= 1200; x += 50) {
        for (let y = 0; y <= 1200; y += 50) {
          const a = fwd.heightAt(P(x, y));
          const b = back.heightAt(P(x, y));
          if (a === null) expect(b).toBeNull();
          else expect(b).toBeCloseTo(a, 9);
        }
      }
      // Faces start with their own edge's ends, in the order given.
      for (const f of back.faces) {
        expect(f.points[0]).toEqual({ ...rev[f.edge], z: 0 });
        expect(f.points[1]).toEqual({ ...rev[(f.edge + 1) % n], z: 0 });
      }
    }
  });

  it('handles a genuine split event (a V notch into one long side)', () => {
    const notch = pts(0, 0, 2000, 0, 2000, 1000, 1100, 1000, 1000, 300, 900, 1000, 0, 1000);
    const r = skeletonRoof(notch, 1);
    expectTiles(r, notch);
    expectContinuous(r, notch, 1, 20);
    // The notch's tip runs down and splits the bottom edge's wavefront: the bottom face dips to a point below it.
    const bottom = r.faces.find((f) => f.edge === 0)!;
    const dip = bottom.points.find((p) => Math.abs(p.x - 1000) < 1e-6 && p.z > 0);
    expect(dip).toBeDefined();
    expect(dip!.y).toBeCloseTo(dip!.z, 6);
    expect(dip!.z).toBeLessThan(300);
    expect(r.heightAt(P(1000, dip!.y / 2))).toBeCloseTo(dip!.y / 2, 6);
    expect(r.peak).toBeGreaterThan(400);
    expect(r.peak).toBeLessThanOrEqual(500 + 1e-9);
  });

  it('handles a split with events at the same moment (a square notch)', () => {
    const notch = pts(0, 0, 2000, 0, 2000, 1000, 1100, 1000, 1100, 300, 900, 300, 900, 1000, 0, 1000);
    const r = skeletonRoof(notch, 1);
    expectTiles(r, notch);
    expectContinuous(r, notch, 1, 20);
    expect(r.peak).toBeCloseTo(450, 6);
    expect(r.heightAt(P(1000, 150))).toBeCloseTo(150, 6);
    expect(r.heightAt(P(1550, 500))).toBeCloseTo(450, 6);
    const ridges = kinds(r, 'ridge');
    expect(ridges.some((l) => l.a.z === 150 && Math.abs(l.a.x - l.b.x) === 500)).toBe(true);
  });

  it('keeps a gable between two gables vertical', () => {
    // Only the bottom edge is an eave: a shed-like roof rising to the far side.
    const r = skeletonRoof(rect, 1, [false, true, true, true]);
    expect(r.peak).toBeCloseTo(600, 6);
    expect(r.heightAt(P(500, 600))).toBeCloseTo(600, 6);
    expect(r.heightAt(P(500, 250))).toBeCloseTo(250, 6);
    const back = r.faces.find((f) => f.edge === 2)!;
    expect(back.vertical).toBe(true);
    expect(area3(back.points)).toBeCloseTo(1000 * 600, 6);
    expectTiles(r, rect);
  });

  it('lets an eave sweep a gable in line with it, even when that pinches a face', () => {
    const shape = pts(-300, 600, -300, 0, 0, 0, 0, -300, 1500, -300, 1500, 0, 900, 0, 900, 300, 600, 300, 600, 600);
    const gable = shape.map((_, i) => i === 6 || i === 7);
    const r = skeletonRoof(shape, 1, gable);
    expect(r.faces.filter((f) => f.vertical).map((f) => f.edge)).toEqual([6, 7]);
    expectTiles(r, shape);
    // The top eave's face runs past the gable wall at y = 300 down to its ridge with the bottom eave's face.
    expect(r.peak).toBeCloseTo(450, 6);
    expect(r.heightAt(P(750, 200))).toBeCloseTo(400, 6);
    expect(r.heightAt(P(750, 0))).toBeCloseTo(300, 6);
  });

  it('drops points in line and is flat at slope 0', () => {
    const withMids = pts(0, 0, 500, 0, 1000, 0, 1000, 600, 0, 600, 0, 300);
    const r = skeletonRoof(withMids, 1);
    expect(r.peak).toBeCloseTo(300, 6);
    expect(r.faces.map((f) => f.edge)).toEqual([0, 2, 3, 4]);
    expect(kinds(r, 'eave')).toHaveLength(6);
    expect(kinds(r, 'ridge')).toHaveLength(1);
    const flat = skeletonRoof(ell, 0);
    expect(flat.peak).toBe(0);
    expect(flat.heightAt(P(200, 200))).toBe(0);
    expect(flat.faces.every((f) => f.points.every((p) => p.z === 0))).toBe(true);
    expect(kinds(flat, 'valley')).toHaveLength(1);
  });

  it('fails safe on degenerate input', () => {
    expect(skeletonRoof([], 1).faces).toEqual([]);
    expect(skeletonRoof(pts(0, 0, 10, 0, 20, 0), 1).heightAt(P(5, 0))).toBeNull();
    const allGable = skeletonRoof(rect, 1, [true, true, true, true]);
    expect(allGable.peak).toBe(0);
    expect(allGable.heightAt(P(500, 300))).toBe(0);
  });
});

describe('shedRoof', () => {
  it('rises from the low edge of a rectangle', () => {
    const r = shedRoof(rect, 0.25, 0);
    expect(r.peak).toBeCloseTo(150, 9);
    expect(r.heightAt(P(500, 600))).toBeCloseTo(600 * 0.25, 9);
    expect(r.heightAt(P(300, 0))).toBeCloseTo(0, 9);
    expect(r.heightAt(P(300, 200))).toBeCloseTo(50, 9);
    expect(r.heightAt(P(300, 700))).toBeNull();
    expect(sloped(r)).toHaveLength(1);
    expect(sloped(r)[0].edge).toBe(0);
    const walls = r.faces.filter((f) => f.vertical);
    expect(walls).toHaveLength(3);
    expect(walls.map((f) => f.points.length).sort()).toEqual([3, 3, 4]);
    expect(area3(walls.find((f) => f.edge === 2)!.points)).toBeCloseTo(1000 * 150, 6);
    expect(kinds(r, 'eave')).toHaveLength(1);
    expect(planArea(sloped(r)[0].points)).toBeCloseTo(600000, 6);
  });

  it('works the other way round', () => {
    const r = shedRoof(rect.slice().reverse(), 1, 1);
    // Reversed edge 1 runs from (1000, 600) to (1000, 0): the roof rises towards x = 0.
    expect(r.heightAt(P(0, 300))).toBeCloseTo(1000, 9);
    expect(r.heightAt(P(1000, 300))).toBeCloseTo(0, 9);
  });
});
