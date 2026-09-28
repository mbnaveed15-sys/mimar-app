/**
 * Curved walls: a wall with a bow is a circular arc from its start to its end, bowing out by `bow`
 * plan units at its middle towards its side A (the left normal (-dy, dx)); a negative bow bows the
 * other way. Everything that works with straight lines (rooms, snapping, the 3D model) uses the arc
 * as a row of short straight pieces, fine enough that the difference is under 2 mm. Pure.
 */
import type { Opening, Point } from '../types';

/** The fields of a wall this module reads. */
export interface WallLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  bow?: number;
}

export interface WallArc {
  /** Centre and radius (plan units). */
  cx: number;
  cy: number;
  r: number;
  /** Angle (radians, from +x towards +y) of the start from the centre. */
  a0: number;
  /** Signed angle swept from the start to the end. */
  sweep: number;
}

/** A bow smaller than this (plan units: 0.5 mm) is a straight wall. */
const STRAIGHT = 0.05;
/** How far a straight piece may stray from the true arc (plan units: 2 mm). */
const TOLERANCE = 0.2;
/** The largest turn between pieces, so the arc looks smooth. */
const MAX_STEP = (5 * Math.PI) / 180;

export const isArc = (w: WallLine): boolean => Math.abs(w.bow ?? 0) > STRAIGHT;

const arcCache = new WeakMap<WallLine, WallArc | null>();

/** The circle a curved wall lies on, or null for a straight wall. */
export function arcOf(w: WallLine): WallArc | null {
  if (arcCache.has(w)) return arcCache.get(w)!;
  const out = computeArc(w);
  arcCache.set(w, out);
  return out;
}

function computeArc(w: WallLine): WallArc | null {
  const bow = w.bow ?? 0;
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const c = Math.hypot(dx, dy);
  if (!isArc(w) || c < 1e-6) return null;
  const nx = -dy / c;
  const ny = dx / c;
  const r = (c * c) / 4 / (2 * Math.abs(bow)) + Math.abs(bow) / 2;
  const off = bow - Math.sign(bow) * r;
  const cx = (w.x1 + w.x2) / 2 + nx * off;
  const cy = (w.y1 + w.y2) / 2 + ny * off;
  const a0 = Math.atan2(w.y1 - cy, w.x1 - cx);
  const size = 4 * Math.atan((2 * Math.abs(bow)) / c);
  // The arc turns whichever way passes through its middle point.
  const mid = { x: (w.x1 + w.x2) / 2 + nx * bow, y: (w.y1 + w.y2) / 2 + ny * bow };
  const at = (s: number) => Math.hypot(cx + r * Math.cos(a0 + s / 2) - mid.x, cy + r * Math.sin(a0 + s / 2) - mid.y);
  const sweep = at(size) <= at(-size) ? size : -size;
  return { cx, cy, r, a0, sweep };
}

/** Length of the wall along its centre line (along the curve for a curved wall). */
export function runLength(w: WallLine): number {
  const arc = arcOf(w);
  return arc ? arc.r * Math.abs(arc.sweep) : Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

/** The point a fraction t (0 to 1) of the way along the wall's centre line. */
export function pointAlong(w: WallLine, t: number): Point {
  const arc = arcOf(w);
  if (!arc) return { x: w.x1 + t * (w.x2 - w.x1), y: w.y1 + t * (w.y2 - w.y1) };
  const a = arc.a0 + t * arc.sweep;
  return { x: arc.cx + arc.r * Math.cos(a), y: arc.cy + arc.r * Math.sin(a) };
}

/** The unit direction of the wall at a fraction t along it (from its start towards its end). */
export function directionAlong(w: WallLine, t: number): Point {
  const arc = arcOf(w);
  if (!arc) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
    return { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len };
  }
  const a = arc.a0 + t * arc.sweep;
  const s = Math.sign(arc.sweep);
  return { x: -Math.sin(a) * s, y: Math.cos(a) * s };
}

/** How many straight pieces an arc of this radius and sweep is drawn with. */
function pieceCount(r: number, sweep: number): number {
  const step = Math.min(MAX_STEP, 2 * Math.acos(Math.max(-1, 1 - TOLERANCE / r)));
  return Math.max(1, Math.ceil(Math.abs(sweep) / step));
}

const pathCache = new WeakMap<WallLine, Point[]>();

/** The wall's centre line as a row of points: its two ends, or the arc in short straight pieces. */
export function wallPath(w: WallLine): Point[] {
  const cached = pathCache.get(w);
  if (cached) return cached;
  const arc = arcOf(w);
  let pts: Point[];
  if (!arc)
    pts = [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 },
    ];
  else {
    const n = pieceCount(arc.r, arc.sweep);
    pts = Array.from({ length: n + 1 }, (_, i) => pointAlong(w, i / n));
    // The ends exactly where the wall says, so joins match.
    pts[0] = { x: w.x1, y: w.y1 };
    pts[n] = { x: w.x2, y: w.y2 };
  }
  pathCache.set(w, pts);
  return pts;
}

/** The wall's centre line as straight segments. */
export function wallSegments(w: WallLine): [Point, Point][] {
  const pts = wallPath(w);
  return pts.slice(1).map((p, i) => [pts[i], p]);
}

/** A line through the wall's centre, `off` to its side A (negative: side B), as a row of points. */
export function offsetPath(w: WallLine, off: number): Point[] {
  const arc = arcOf(w);
  if (!arc) {
    const d = directionAlong(w, 0);
    return [
      { x: w.x1 - d.y * off, y: w.y1 + d.x * off },
      { x: w.x2 - d.y * off, y: w.y2 + d.x * off },
    ];
  }
  const pts = wallPath(w);
  const n = pts.length - 1;
  return pts.map((p, i) => {
    const d = directionAlong(w, i / n);
    return { x: p.x - d.y * off, y: p.y + d.x * off };
  });
}

/** The nearest point on the wall's centre line to p: its fraction along the wall, the point, and the distance. */
export function projectOnWall(w: WallLine, p: Point): { t: number; point: Point; dist: number } {
  const arc = arcOf(w);
  if (!arc) {
    const C = w.x2 - w.x1;
    const D = w.y2 - w.y1;
    const lenSq = C * C + D * D;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - w.x1) * C + (p.y - w.y1) * D) / lenSq));
    const q = { x: w.x1 + t * C, y: w.y1 + t * D };
    return { t, point: q, dist: Math.hypot(p.x - q.x, p.y - q.y) };
  }
  const t = arcParam(arc, p);
  const tc = Math.max(0, Math.min(1, t));
  const q = pointAlong(w, tc);
  return { t: tc, point: q, dist: Math.hypot(p.x - q.x, p.y - q.y) };
}

/**
 * The fraction along an arc of the point nearest p, not clamped: below 0 or above 1 when p is
 * beyond an end (whichever end is nearer round the circle).
 */
function arcParam(arc: WallArc, p: Point): number {
  const TAU = Math.PI * 2;
  const s = Math.sign(arc.sweep);
  const size = Math.abs(arc.sweep);
  const a = Math.atan2(p.y - arc.cy, p.x - arc.cx);
  const d = ((((a - arc.a0) * s) % TAU) + TAU) % TAU;
  if (d <= size) return d / size;
  // Past the end, or before the start: whichever is nearer round the circle.
  return d - size < TAU - d ? d / size : -(TAU - d) / size;
}

/** The fraction along the wall of the point nearest p, as the straight-wall rule does (not clamped). */
export function paramAlong(w: WallLine, p: Point): number {
  const arc = arcOf(w);
  if (!arc) {
    const C = w.x2 - w.x1;
    const D = w.y2 - w.y1;
    const lenSq = C * C + D * D;
    return lenSq === 0 ? 0 : ((p.x - w.x1) * C + (p.y - w.y1) * D) / lenSq;
  }
  return arcParam(arc, p);
}

/** Shortest distance from p to the wall's centre line. */
export const distanceToWall = (w: WallLine, p: Point): number => projectOnWall(w, p).dist;

/** The bow for an arc of the given radius on this wall's ends, bowing the same way (the shorter arc). */
export function bowForRadius(w: WallLine, r: number): number {
  const c = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const rr = Math.max(r, c / 2);
  const s = rr - Math.sqrt(Math.max(0, rr * rr - (c * c) / 4));
  return (Math.sign(w.bow ?? 0) || 1) * s;
}

/** The bow that makes the arc pass through p (as near as it can), or 0 when p is on the straight line. */
export function bowThrough(w: WallLine, p: Point): number {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const c = Math.hypot(dx, dy);
  if (c < 1e-6) return 0;
  // Circle through both ends and p: its sagitta, from the offset of p across the chord and its place along it.
  const u = { x: dx / c, y: dy / c };
  const along = (p.x - w.x1) * u.x + (p.y - w.y1) * u.y - c / 2;
  const across = -(p.x - w.x1) * u.y + (p.y - w.y1) * u.x;
  if (Math.abs(across) < 1e-6) return 0;
  // The circle through both ends and p has its centre on the chord's perpendicular, k across from the
  // chord's middle: (c/2)² + k² = along² + (across − k)². The arc's middle is on p's side of it.
  const k = (along * along + across * across - (c * c) / 4) / (2 * across);
  return k + Math.sign(across) * Math.hypot(c / 2, k);
}

/** The radius of a curved wall, or null for a straight one. */
export const radiusOf = (w: WallLine): number | null => arcOf(w)?.r ?? null;

/** The part of the wall from fraction t0 to t1 along it, as a wall of its own (same curve). */
export function partOf<T extends WallLine>(w: T, t0: number, t1: number): T {
  const a = pointAlong(w, t0);
  const b = pointAlong(w, t1);
  const arc = arcOf(w);
  if (!arc) return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const half = (Math.abs(arc.sweep) * Math.abs(t1 - t0)) / 2;
  const bow = Math.sign(w.bow ?? 0) * Math.sign(t1 - t0) * arc.r * (1 - Math.cos(half));
  return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y, bow: Math.abs(bow) > STRAIGHT ? bow : undefined };
}

/** The same curve drawn the other way round (its ends swapped). */
export function reversed<T extends WallLine>(w: T): T {
  return { ...w, x1: w.x2, y1: w.y2, x2: w.x1, y2: w.y1, ...(w.bow !== undefined && { bow: -w.bow }) };
}

/**
 * A wall parallel to this one, `d` towards its side A (negative: side B): for a curved wall, an
 * arc on the same centre with the radius changed by d.
 */
export function offsetWall<T extends WallLine>(w: T, d: number): T {
  const arc = arcOf(w);
  if (!arc) {
    const [a, b] = offsetPath(w, d);
    return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  const r = arc.r + Math.sign(w.bow ?? 0) * d;
  if (r <= STRAIGHT) return w;
  const k = r / arc.r;
  const at = (x: number, y: number) => ({ x: arc.cx + (x - arc.cx) * k, y: arc.cy + (y - arc.cy) * k });
  const a = at(w.x1, w.y1);
  const b = at(w.x2, w.y2);
  return { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y, bow: (w.bow ?? 0) * k };
}

/** A straight part of a wall, for building it: its own ends, and the doors and windows in it. */
export interface WallPiece<T extends WallLine> {
  wall: T;
  openings: Opening[];
  /**
   * How far each end reaches past its point to close the joint with the next piece of the same
   * curve; undefined at the wall's own ends (the usual joins to other walls apply there).
   */
  start?: number;
  end?: number;
}

/**
 * A wall as straight pieces. A straight wall is one piece. A curved wall is short straight pieces
 * along the arc, except that each door or window sits in one straight piece of its own (its chord),
 * flat on the curve.
 */
export function straightPieces<T extends WallLine>(w: T, openings: Opening[], halfThickness: number): WallPiece<T>[] {
  const arc = arcOf(w);
  if (!arc) return [{ wall: w, openings }];
  const size = Math.abs(arc.sweep);
  // Each opening's span, as fractions along the wall; overlapping spans are merged.
  const spans = openings
    .map((o) => {
      const t = Math.max(0, Math.min(1, arcParam(arc, o)));
      const half = Math.asin(Math.min(1, o.width / 2 / arc.r)) / size;
      return { t0: Math.max(0, t - half), t1: Math.min(1, t + half), openings: [o] };
    })
    .sort((a, b) => a.t0 - b.t0)
    .reduce<{ t0: number; t1: number; openings: Opening[] }[]>((out, s) => {
      const last = out[out.length - 1];
      if (last && s.t0 < last.t1) {
        last.t1 = Math.max(last.t1, s.t1);
        last.openings.push(...s.openings);
      } else out.push({ ...s });
      return out;
    }, []);
  const cuts: { t0: number; t1: number; openings: Opening[] }[] = [];
  const fill = (t0: number, t1: number) => {
    if (t1 - t0 < 1e-9) return;
    const n = pieceCount(arc.r, (t1 - t0) * size);
    for (let i = 0; i < n; i++)
      cuts.push({ t0: t0 + ((t1 - t0) * i) / n, t1: t0 + ((t1 - t0) * (i + 1)) / n, openings: [] });
  };
  let t = 0;
  for (const s of spans) {
    fill(t, s.t0);
    cuts.push(s);
    t = s.t1;
  }
  fill(t, 1);
  // Close each joint on the outside of the bend: the pieces overlap on the inside, hidden in each other.
  const joint = (a: (typeof cuts)[number], b: (typeof cuts)[number]) =>
    halfThickness * Math.tan(((a.t1 - a.t0 + (b.t1 - b.t0)) * size) / 4);
  return cuts.map((c, i) => {
    const a = pointAlong(w, c.t0);
    const b = pointAlong(w, c.t1);
    const piece = { ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y, bow: undefined };
    return {
      wall: piece,
      openings: c.openings,
      start: i > 0 ? joint(cuts[i - 1], c) : undefined,
      end: i < cuts.length - 1 ? joint(c, cuts[i + 1]) : undefined,
    };
  });
}

/**
 * Where a door or window of the given width goes on a curved wall, centred as near p as it fits:
 * its ends on the arc, so it lies flat across the curve. Null for a straight wall.
 */
export function placeOnArc(
  w: WallLine,
  p: Point,
  width: number,
): { x: number; y: number; angle: number; width: number } | null {
  const arc = arcOf(w);
  if (!arc) return null;
  const size = Math.abs(arc.sweep);
  // No wider than the wall's ends are apart (or the circle, for more than half of one).
  const wid = Math.min(width, size > Math.PI ? 2 * arc.r : Math.hypot(w.x2 - w.x1, w.y2 - w.y1));
  const half = Math.asin(Math.min(1, wid / 2 / arc.r)) / size;
  const t = Math.max(half, Math.min(1 - half, arcParam(arc, p)));
  const a = pointAlong(w, t - half);
  const b = pointAlong(w, t + half);
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    width: Math.hypot(b.x - a.x, b.y - a.y),
  };
}
