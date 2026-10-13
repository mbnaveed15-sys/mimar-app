/**
 * Layout lines cut solids, as lines cut faces in SketchUp: a straight layout line drawn right across
 * a block or slab splits it into pieces, so each piece can be pushed or pulled on its own. Pure.
 */
import { pointInPolygon, pointToSegmentDistance } from '../geometry';
import { newId } from './ids';
import { levelOf, type Block, type PlanElement, type Point, type SketchLine, type Slab } from '../types';

const EPS = 1e-6;
/** How close (plan units) a point must be to count as on an edge. */
const ON = 0.05;

const sameAt = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) <= ON;

function area(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/** Drop repeated points (and a last point that repeats the first). */
function tidy(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) if (!out.length || !sameAt(out[out.length - 1], p)) out.push(p);
  while (out.length > 1 && sameAt(out[0], out[out.length - 1])) out.pop();
  return out;
}

/** Where segment a–b crosses the outline's edges: the point, its edge, and how far along a–b (0–1). */
function hits(poly: Point[], a: Point, b: Point): { p: Point; edge: number; t: number }[] {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const out: { p: Point; edge: number; t: number }[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const e = { x: q.x - p.x, y: q.y - p.y };
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < EPS) continue; // Parallel: running along an edge cuts nothing.
    const w = { x: p.x - a.x, y: p.y - a.y };
    const t = (w.x * e.y - w.y * e.x) / den;
    const u = (w.x * d.y - w.y * d.x) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) continue;
    out.push({ p: { x: a.x + t * d.x, y: a.y + t * d.y }, edge: i, t });
  }
  out.sort((m, n) => m.t - n.t);
  return out.filter((h, i) => i === 0 || !sameAt(h.p, out[i - 1].p));
}

/** Strictly inside the outline (not on its edge). */
function inside(p: Point, poly: Point[]): boolean {
  if (!pointInPolygon(p, poly)) return false;
  return poly.every((a, i) => pointToSegmentDistance(p, a, poly[(i + 1) % poly.length]) > ON);
}

/** Split an outline once along a chord from x (on edge i) to y (on edge j). */
function cut(poly: Point[], x: Point, i: number, y: Point, j: number): [Point[], Point[]] {
  if (i > j) [x, i, y, j] = [y, j, x, i];
  const n = poly.length;
  const one = [x, ...poly.slice(i + 1, j + 1), y];
  const two = [y, ...poly.slice(j + 1, n), ...poly.slice(0, i + 1), x];
  return [tidy(one), tidy(two)];
}

/**
 * The pieces a straight segment cuts an outline into: one outline when the segment doesn't go right
 * across it. A segment that only goes part way in cuts nothing.
 */
export function splitPolygon(poly: Point[], a: Point, b: Point): Point[][] {
  let pieces = [tidy(poly)];
  // Each pass makes one cut, so an L-shaped outline crossed twice comes out in three pieces.
  for (let pass = 0; pass < 32; pass++) {
    let changed = false;
    const next: Point[][] = [];
    for (const piece of pieces) {
      if (changed || piece.length < 3) {
        next.push(piece);
        continue;
      }
      const hs = hits(piece, a, b);
      let done = false;
      for (let k = 0; k + 1 < hs.length && !done; k++) {
        const [x, y] = [hs[k], hs[k + 1]];
        const mid = { x: (x.p.x + y.p.x) / 2, y: (x.p.y + y.p.y) / 2 };
        if (x.edge === y.edge || !inside(mid, piece)) continue;
        const [one, two] = cut(piece, x.p, x.edge, y.p, y.edge);
        if (one.length < 3 || two.length < 3 || Math.abs(area(one)) < 1 || Math.abs(area(two)) < 1) continue;
        next.push(one, two);
        done = changed = true;
      }
      if (!done) next.push(piece);
    }
    pieces = next;
    if (!changed) break;
  }
  return pieces;
}

type Solid = Block | Slab;

/** A solid's pieces once the line cuts it, or null when it doesn't. A slab's voids go with their piece. */
function splitSolid(el: Solid, a: Point, b: Point): Solid[] | null {
  // A line through a void would leave the void's edge split between pieces: leave that slab whole.
  if (el.type === 'slab' && el.holes?.some((h) => hits(h, a, b).length > 0)) return null;
  const parts = splitPolygon(el.points, a, b);
  if (parts.length < 2) return null;
  return parts.map((points, i) => {
    const id = i === 0 ? el.id : newId();
    if (el.type === 'block') return { ...el, id, points, shape: 'polygon' as const };
    const { curve: _curve, holes, holeCurves, ...rest } = el;
    void _curve;
    const kept = (holes ?? [])
      .map((h, k) => ({ h, c: holeCurves?.[k] ?? null }))
      .filter(({ h }) => pointInPolygon(h[0], points));
    return {
      ...rest,
      id,
      points,
      ...(kept.length && { holes: kept.map((k) => k.h) }),
      ...(kept.some((k) => k.c) && { holeCurves: kept.map((k) => k.c) }),
    };
  });
}

/**
 * Split every block and slab on the line's level that the (straight) layout line goes right across.
 * The first piece keeps the item's id. Elements come back unchanged when nothing is cut.
 */
export function splitSolidsByLine(elements: PlanElement[], line: SketchLine): PlanElement[] {
  if (Math.abs(line.bow ?? 0) > 0.05) return elements;
  const a = { x: line.x1, y: line.y1 };
  const b = { x: line.x2, y: line.y2 };
  const level = levelOf(line);
  let changed = false;
  const out: PlanElement[] = [];
  for (const el of elements) {
    if ((el.type === 'block' || el.type === 'slab') && !el.locked && levelOf(el) === level) {
      const parts = splitSolid(el, a, b);
      if (parts) {
        out.push(...parts);
        changed = true;
        continue;
      }
    }
    out.push(el);
  }
  return changed ? out : elements;
}
