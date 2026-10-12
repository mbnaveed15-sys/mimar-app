/**
 * Where a dimension's line goes and what it reads (no imports from the rest of the plan code, so
 * geometry.ts can use it). Pure.
 */
import type { Dimension, Point } from '../types';

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const rad = (deg: number) => (deg * Math.PI) / 180;

export const dimStart = (d: Pick<Dimension, 'x1' | 'y1'>): Point => ({ x: d.x1, y: d.y1 });
export const dimEnd = (d: Pick<Dimension, 'x2' | 'y2'>): Point => ({ x: d.x2, y: d.y2 });

/** A dimension's line and value, worked out from its points. */
export interface DimLine {
  /** The measured points. */
  p1: Point;
  p2: Point;
  /** The ends of the dimension line (for a radius: the centre and the point on the curve). */
  a: Point;
  b: Point;
  /** Unit direction it measures along, and the normal (left of it) its line is set off along. */
  u: Point;
  n: Point;
  /** The distance measured, plan units. */
  value: number;
}

/** The direction a dimension measures along: its angle, or from its first point to its second. */
export function dimDirection(d: Pick<Dimension, 'x1' | 'y1' | 'x2' | 'y2' | 'angle'>): Point {
  if (d.angle !== undefined) return { x: Math.cos(rad(d.angle)), y: Math.sin(rad(d.angle)) };
  const len = Math.hypot(d.x2 - d.x1, d.y2 - d.y1);
  return len > 1e-9 ? { x: (d.x2 - d.x1) / len, y: (d.y2 - d.y1) / len } : { x: 1, y: 0 };
}

/** Where the dimension line runs and what it reads. */
export function dimLine(d: Pick<Dimension, 'x1' | 'y1' | 'x2' | 'y2' | 'lx' | 'ly' | 'angle' | 'radius'>): DimLine {
  const p1 = dimStart(d);
  const p2 = dimEnd(d);
  const u = dimDirection(d);
  const n = { x: -u.y, y: u.x };
  if (d.radius) return { p1, p2, a: p1, b: p2, u, n, value: Math.hypot(p2.x - p1.x, p2.y - p1.y) };
  // The line passes through (lx, ly), along u: each end is its point carried across to it.
  const c = dot({ x: d.lx, y: d.ly }, n);
  const a = { x: p1.x + n.x * (c - dot(p1, n)), y: p1.y + n.y * (c - dot(p1, n)) };
  const b = { x: p2.x + n.x * (c - dot(p2, n)), y: p2.y + n.y * (c - dot(p2, n)) };
  return { p1, p2, a, b, u, n, value: Math.abs(dot({ x: p2.x - p1.x, y: p2.y - p1.y }, u)) };
}

/**
 * The angle a Horizontal / Vertical dimension takes from where the pointer is, as AutoCAD does:
 * above or below the two points it is horizontal (0), beside them vertical (90).
 */
export function linearAngle(p1: Point, p2: Point, cursor: Point): 0 | 90 {
  const beyond = (v: number, a: number, b: number) => Math.max(0, Math.min(a, b) - v, v - Math.max(a, b));
  const outX = beyond(cursor.x, p1.x, p2.x);
  const outY = beyond(cursor.y, p1.y, p2.y);
  if (outY > outX) return 0;
  if (outX > outY) return 90;
  // Inside (or level with both): along whichever way the points are further apart.
  return Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y) ? 0 : 90;
}

/** The angle (degrees, clockwise on the plan from +x) of the direction from a to b. */
export const angleOf = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

/** Turn a dimension's points and line by a function (move, rotate, mirror, scale). */
export function mapDimension(d: Dimension, f: (p: Point) => Point, turn?: (deg: number) => number): Dimension {
  const a = f(dimStart(d));
  const b = f(dimEnd(d));
  const l = f({ x: d.lx, y: d.ly });
  const out: Dimension = { ...d, x1: a.x, y1: a.y, x2: b.x, y2: b.y, lx: l.x, ly: l.y };
  if (d.angle !== undefined && turn) out.angle = normDeg(turn(d.angle));
  return out;
}

/** An angle in degrees brought into [0, 180), as a measuring direction has no way round. */
export const normDeg = (deg: number) => {
  const r = Math.round(deg * 1e6) / 1e6;
  return ((r % 180) + 180) % 180;
};

/** The points a dimension covers on the plan: its measured points and the ends of its line. */
export function dimOutline(d: Dimension): Point[] {
  const { p1, p2, a, b } = dimLine(d);
  return d.radius ? [p1, p2] : [p1, p2, a, b];
}
