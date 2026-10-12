/**
 * Curved edges on outlines (slabs, levelled areas): each edge of the outline can be bent into an
 * arc, the way a wall is. The item's `points` always hold the outline as it really is, with each
 * curved edge as short straight pieces (fine enough to look round), so everything that reads the
 * outline (3D, drawings, exports, areas) works unchanged. `curve` keeps the corners and the point
 * each edge passes through at its middle, so the curves can be changed again. Pure.
 */
import type { EdgeCurve, Point } from '../types';
import { bowThrough, pointAlong, wallPath, type WallLine } from './arc';

/** A bow smaller than this (plan units) is a straight edge. */
const STRAIGHT = 0.05;
/** How close a corner must be to a point of the outline to still belong to it. */
const SAME = 0.01;

/** Edge i of a curve as a wall line (corner i to corner i + 1, bowed through its middle point). */
export function edgeLine(curve: EdgeCurve, i: number): WallLine {
  const n = curve.corners.length;
  const a = curve.corners[i];
  const b = curve.corners[(i + 1) % n];
  const mid = curve.mids[i];
  const line: WallLine = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  if (!mid) return line;
  const bow = bowThrough(line, mid);
  return Math.abs(bow) > STRAIGHT ? { ...line, bow } : line;
}

/** The outline a curve makes: each corner, then the points along its edge (not the next corner). */
export function facetOutline(curve: EdgeCurve): Point[] {
  const out: Point[] = [];
  curve.corners.forEach((_, i) => out.push(...wallPath(edgeLine(curve, i)).slice(0, -1)));
  return out;
}

export const isCurved = (curve: EdgeCurve | undefined): boolean => !!curve?.mids.some((m) => m);

/**
 * The curve an item's outline is made with, if it still is: an edit that moved its points another
 * way (a stretch) leaves the outline as it is, with straight pieces where the curves were.
 */
export function curveOf(el: { points: Point[]; curve?: EdgeCurve }): EdgeCurve | null {
  const c = el.curve;
  if (!c || c.corners.length < 3 || c.mids.length !== c.corners.length) return null;
  let at = 0;
  for (const corner of c.corners) {
    while (at < el.points.length && Math.hypot(el.points[at].x - corner.x, el.points[at].y - corner.y) > SAME) at++;
    if (at >= el.points.length) return null;
    at++;
  }
  return c;
}

/** The corners and middles of an item's edges: from its curve, or its points as straight edges. */
export function edgesOf(el: { points: Point[]; curve?: EdgeCurve }): EdgeCurve {
  return curveOf(el) ?? { corners: el.points, mids: el.points.map(() => null) };
}

/** An item with its outline made from this curve (straight all round: no curve kept). */
export function withCurve<T extends { points: Point[]; curve?: EdgeCurve }>(el: T, curve: EdgeCurve): T {
  if (!isCurved(curve)) {
    const next = { ...el, points: curve.corners };
    delete next.curve;
    return next;
  }
  return { ...el, curve, points: facetOutline(curve) };
}

/**
 * Bend edge i so it passes through p at its middle: straight again when p is off the straight line by
 * no more than `straight` (plan units), or p is null.
 */
export function bendEdge<T extends { points: Point[]; curve?: EdgeCurve }>(
  el: T,
  i: number,
  p: Point | null,
  straight = STRAIGHT,
): T {
  const c = edgesOf(el);
  const line = edgeLine({ ...c, mids: c.mids.map(() => null) }, i);
  const bow = p ? bowThrough(line, p) : 0;
  const mid = Math.abs(bow) > Math.max(straight, STRAIGHT) ? pointAlong({ ...line, bow }, 0.5) : null;
  return withCurve(el, { corners: c.corners, mids: c.mids.map((m, j) => (j === i ? mid : m)) });
}

/** The middle of each edge, where its bend grip goes. */
export const edgeMiddles = (el: { points: Point[]; curve?: EdgeCurve }): Point[] => {
  const c = edgesOf(el);
  return c.corners.map((_, i) => pointAlong(edgeLine(c, i), 0.5));
};

/**
 * A curve moved, turned, mirrored or scaled point by point; `reverse` when a mirror turned the
 * outline round (its corners are listed the other way, and each edge with them).
 */
export function mapCurve(curve: EdgeCurve, f: (p: Point) => Point, reverse = false): EdgeCurve {
  const corners = curve.corners.map(f);
  const mids = curve.mids.map((m) => (m ? f(m) : null));
  if (!reverse) return { corners, mids };
  const n = corners.length;
  return {
    corners: corners.reverse(),
    // Edge j of the reversed outline is edge n - 2 - j of the original, walked the other way.
    mids: corners.map((_, j) => mids[(((n - 2 - j) % n) + n) % n]),
  };
}
