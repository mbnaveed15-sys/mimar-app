/**
 * Plots of any shape: their sides (road, neighbour, back or open), each side's setback and wall, a
 * corner plot's cut corner (splay), and the building line set in from the sides. Pure.
 */
import { MM_PER_UNIT } from './scale';
import type { Plot, PlotSide, PlotSideKind, Point } from '../types';

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

/** Twice the signed area; above zero for plots going round as `plotRect` makes them (clockwise on screen). */
export function signedArea2(pts: Point[]): number {
  let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  });
  return s;
}

export const polygonArea = (pts: Point[]) => Math.abs(signedArea2(pts)) / 2;

/** Whether segments ab and cd cross or touch (end to end touching aside, which the caller rules out). */
function segmentsMeet(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: Point, q: Point, r: Point, v: number) =>
    Math.abs(v) < 1e-9 &&
    Math.min(p.x, q.x) - 1e-9 <= r.x &&
    r.x <= Math.max(p.x, q.x) + 1e-9 &&
    Math.min(p.y, q.y) - 1e-9 <= r.y &&
    r.y <= Math.max(p.y, q.y) + 1e-9;
  return on(a, b, c, d1) || on(a, b, d, d2) || on(c, d, a, d3) || on(c, d, b, d4);
}

/**
 * Why an outline can't be a plot, or null when it can: at least three corners, no two corners on
 * top of each other, some area, and no side crossing another.
 */
export function outlineProblem(pts: Point[]): string | null {
  const n = pts.length;
  if (n < 3) return 'A plot needs at least three corners.';
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1) return 'Two corners of the plot are on top of each other.';
  }
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsMeet(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]))
        return 'The sides of the plot cross each other. Move a corner so they don’t.';
    }
  if (polygonArea(pts) < 1) return 'The plot has no area.';
  return null;
}

/** An outline going round the usual way (as `plotRect`), with its edge numbers mapped: `edge(old)` is the new index. */
export function orientOutline(pts: Point[]): { points: Point[]; edge: (i: number) => number } {
  if (signedArea2(pts) >= 0) return { points: pts, edge: (i) => i };
  const n = pts.length;
  // Reversed, edge i (p[i] → p[i+1]) runs from p[i+1] to p[i]: index n − 2 − i in the new list.
  return { points: [...pts].reverse(), edge: (i) => (((n - 2 - i) % n) + n) % n };
}

/** A plot's sides put the other way round (after a mirror reverses its corners). */
export function reversedSides(plot: Plot): Pick<Plot, 'front' | 'sideList'> {
  const n = plot.points.length;
  const map = (i: number) => (((n - 2 - i) % n) + n) % n;
  const out: Pick<Plot, 'front' | 'sideList'> = { front: map(plot.front) };
  if (plot.sideList) {
    const list: PlotSide[] = new Array(n);
    plot.sideList.forEach((s, i) => (list[map(i)] = s));
    out.sideList = list;
  }
  return out;
}

const unit = (v: Point) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/** The outward normal of edge i (the plot going round as `plotRect` makes it). */
function outward(pts: Point[], i: number): Point {
  const e = unit(sub(pts[(i + 1) % pts.length], pts[i]));
  const s = signedArea2(pts) >= 0 ? 1 : -1;
  return { x: e.y * s, y: -e.x * s };
}

/**
 * A first guess at each side's type from the road side: the road; sides facing away from it (within
 * 30°) are the back; the rest are neighbours. A four-cornered plot keeps the rule plots had before 1.30:
 * the side opposite the road is the back.
 */
export function guessSideKinds(points: Point[], front: number): PlotSideKind[] {
  const n = points.length;
  if (n === 4) return points.map((_, i) => (i === front ? 'road' : i === (front + 2) % 4 ? 'back' : 'neighbour'));
  const nf = outward(points, front);
  let kinds: PlotSideKind[] = points.map((_, i) =>
    i === front ? 'road' : dot(outward(points, i), nf) < -Math.cos(Math.PI / 6) ? 'back' : 'neighbour',
  );
  if (!kinds.includes('back')) {
    // Nothing faces away closely enough: the side facing most away is the back.
    let best = -1;
    let bestDot = Infinity;
    points.forEach((_, i) => {
      if (i === front) return;
      const d = dot(outward(points, i), nf);
      if (d < bestDot) [best, bestDot] = [i, d];
    });
    if (best >= 0) kinds = kinds.map((k, i) => (i === best ? 'back' : k));
  }
  return kinds;
}

/** A plot's sides: as stored, or worked out for plots from before sides had types. */
export function plotSides(plot: Plot): PlotSide[] {
  if (plot.sideList && plot.sideList.length === plot.points.length) return plot.sideList;
  return guessSideKinds(plot.points, plot.front).map((kind) => ({ kind }));
}

/** Which of the plot's setbacks a side takes by default. */
export type SetbackSlot = 'front' | 'rear' | 'side1' | 'side2';

/**
 * Each side's slot. The main road takes the front setback and the back sides the rear. The others
 * take side 1 going round from the road until the back, side 2 coming the other way; sides between
 * two back sides go by which way they face.
 */
export function sideSlots(plot: Plot, sides = plotSides(plot)): SetbackSlot[] {
  const n = plot.points.length;
  const front = plot.front % n;
  const slots: (SetbackSlot | null)[] = sides.map((s, i) =>
    i === front ? 'front' : s.kind === 'back' ? 'rear' : null,
  );
  // With no back side, the first half going round is side 1.
  const reach = slots.includes('rear') ? n : Math.floor((n - 1) / 2) + 1;
  for (let k = 1; k < reach; k++) {
    const i = (front + k) % n;
    if (slots[i] === 'rear' || slots[i] === 'front') break;
    slots[i] = 'side1';
  }
  for (let k = 1; k < n; k++) {
    const i = (front - k + n) % n;
    if (slots[i] !== null) break;
    slots[i] = 'side2';
  }
  const along = unit(sub(plot.points[(front + 1) % n], plot.points[front]));
  return slots.map((s, i) => s ?? (dot(outward(plot.points, i), along) > 0 ? 'side1' : 'side2'));
}

/** What each side is set back by, and where that comes from. */
export interface SideSetback {
  mm: number;
  slot: SetbackSlot;
  /** Typed for this side rather than taken from the plot's setbacks. */
  typed: boolean;
  /** A second road side on the side setback: corner-plot figures aren't in the bylaws yet. */
  provisional: boolean;
}

export function sideSetbacks(plot: Plot, sides = plotSides(plot)): SideSetback[] {
  const slots = sideSlots(plot, sides);
  const sb = plot.setbacks;
  const bySlot: Record<SetbackSlot, number> = {
    front: sb.front,
    rear: sb.rear,
    side1: sb.sides,
    side2: sb.side2 ?? sb.sides,
  };
  return sides.map((s, i) => {
    const typed = s.setbackMm !== undefined;
    return {
      mm: typed ? s.setbackMm! : bySlot[slots[i]],
      slot: slots[i],
      typed,
      provisional: !typed && s.kind === 'road' && slots[i] !== 'front',
    };
  });
}

/** The corner (index into points) where the main road meets another road side, if any. */
export function roadCorner(plot: Plot, sides = plotSides(plot)): number | null {
  const n = plot.points.length;
  const front = plot.front % n;
  // The corner at the end of the road side comes first (going round), then the one at its start.
  if (sides[(front + 1) % n]?.kind === 'road') return (front + 1) % n;
  if (sides[(front - 1 + n) % n]?.kind === 'road') return front;
  return null;
}

/** An edge of the outline the plot really has: `side` is the plot side it lies on, or 'splay' for the cut corner. */
export interface OutlineEdge {
  a: Point;
  b: Point;
  side: number | 'splay';
}

/**
 * The plot's outline with its cut corner, when it has one: the corner between the two roads is cut
 * `splay.sizeMm` back along each side (never more than half of either side).
 */
export function plotOutline(plot: Plot, sides = plotSides(plot)): OutlineEdge[] {
  const pts = plot.points;
  const n = pts.length;
  const corner = plot.splay && plot.splay.sizeMm > 0 ? roadCorner(plot, sides) : null;
  const edges: OutlineEdge[] = [];
  for (let i = 0; i < n; i++) {
    let a = pts[i];
    let b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const cut = corner === null ? 0 : Math.min(plot.splay!.sizeMm / MM_PER_UNIT, len / 2);
    if (corner === i) a = { x: a.x + ((b.x - a.x) / len) * cut, y: a.y + ((b.y - a.y) / len) * cut };
    if (corner === (i + 1) % n) b = { x: b.x - ((b.x - a.x) / len) * cut, y: b.y - ((b.y - a.y) / len) * cut };
    if (corner === i) {
      // The splay edge comes before this side: from the previous side's cut end to this side's.
      const p = pts[(i - 1 + n) % n];
      const c = pts[i];
      const pl = Math.hypot(c.x - p.x, c.y - p.y) || 1;
      const pc = Math.min(plot.splay!.sizeMm / MM_PER_UNIT, pl / 2);
      edges.push({ a: { x: c.x - ((c.x - p.x) / pl) * pc, y: c.y - ((c.y - p.y) / pl) * pc }, b: a, side: 'splay' });
    }
    edges.push({ a, b, side: i });
  }
  return edges;
}

/** The corners of the plot as it really is (the cut corner included). */
export function outlinePoints(plot: Plot): Point[] {
  return plotOutline(plot).map((e) => e.a);
}

/** The plot's area in plan units², the cut corner taken off. */
export function plotArea(plot: Plot): number {
  return polygonArea(outlinePoints(plot));
}

/** Line through p going along d. */
interface Line {
  p: Point;
  d: Point;
}

function meet(l1: Line, l2: Line): Point | null {
  const denom = cross(l1.d, l2.d);
  if (Math.abs(denom) < 1e-9) return null;
  const t = cross(sub(l2.p, l1.p), l2.d) / denom;
  return { x: l1.p.x + l1.d.x * t, y: l1.p.y + l1.d.y * t };
}

/**
 * Move each edge of a polygon in by its own distance (out for a negative one) and re-join the
 * corners, with sharp (mitred) corners. Edges that the others squeeze out as they move in (a short
 * side between two deep setbacks, a small cut corner) are dropped; where the result would cross
 * itself (a narrow neck pinched through), the biggest part is kept. Returns the new corners and,
 * for each new edge, the original edge it came from; nothing is left when the setbacks swallow it.
 */
export function insetPolygon(pts: Point[], dist: number[]): { points: Point[]; edges: number[] } {
  const n = pts.length;
  if (n < 3) return { points: [], edges: [] };
  const sign = signedArea2(pts) >= 0 ? -1 : 1; // inward for the outline's way round
  const line = (i: number): Line => {
    const a = pts[i];
    const e = sub(pts[(i + 1) % n], a);
    const u = unit(e);
    const d = dist[i] * sign;
    return { p: { x: a.x + u.y * d, y: a.y - u.x * d }, d: e };
  };
  let alive = pts.map((_, i) => i);
  let corners: Point[] = [];
  for (let round = 0; round <= n; round++) {
    if (alive.length < 3) return { points: [], edges: [] };
    const lines = alive.map(line);
    const m = alive.length;
    corners = alive.map((_, j) => {
      const prev = lines[(j - 1 + m) % m];
      const here = lines[j];
      return meet(prev, here) ?? here.p;
    });
    // An edge whose ends have passed each other (it points backwards now) has been squeezed out.
    let worst = -1;
    let worstLen = 1e-6;
    for (let j = 0; j < m; j++) {
      const along = dot(sub(corners[(j + 1) % m], corners[j]), unit(lines[j].d));
      if (along < worstLen) [worst, worstLen] = [j, along];
    }
    if (worst < 0) break;
    alive = alive.filter((_, j) => j !== worst);
  }
  if (alive.length < 3) return { points: [], edges: [] };
  return biggestLoop(corners, alive, signedArea2(pts) >= 0);
}

/** Where two edges that aren't neighbours cross or touch (a corner on the other edge, or overlapping), if they do. */
function contact(a: Point, b: Point, c: Point, d: Point): Point | null {
  const eps = 1e-6;
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps)))
    return meet({ p: a, d: sub(b, a) }, { p: c, d: sub(d, c) });
  const onSeg = (p: Point, q: Point, r: Point) => {
    const e = sub(q, p);
    const l2 = dot(e, e) || 1;
    const t = dot(sub(r, p), e) / l2;
    if (t < -eps || t > 1 + eps) return false;
    return Math.hypot(p.x + e.x * t - r.x, p.y + e.y * t - r.y) < 1e-4;
  };
  for (const r of [c, d]) if (onSeg(a, b, r)) return r;
  for (const r of [a, b]) if (onSeg(c, d, r)) return r;
  return null;
}

/** The loop without corners doubled up (left behind where a split point was a corner). */
function dropRepeats(loop: { points: Point[]; edges: number[] }) {
  const points: Point[] = [];
  const edges: number[] = [];
  loop.points.forEach((p, i) => {
    const q = loop.points[(i + 1) % loop.points.length];
    if (Math.hypot(q.x - p.x, q.y - p.y) < 1e-6) return;
    points.push(p);
    edges.push(loop.edges[i]);
  });
  return { points, edges };
}

/**
 * Split a polygon that crosses or touches itself into simple loops and keep the biggest one going
 * the same way round as the original (loops the wrong way round are what the setbacks pinched out).
 */
function biggestLoop(pts: Point[], labels: number[], positive: boolean): { points: Point[]; edges: number[] } {
  const loops: { points: Point[]; edges: number[] }[] = [];
  const stack = [dropRepeats({ points: pts, edges: labels })];
  let guard = 0;
  while (stack.length && guard++ < 256) {
    const { points, edges } = stack.pop()!;
    const n = points.length;
    if (n < 3) continue;
    let split: { i: number; j: number; x: Point } | null = null;
    for (let i = 0; i < n && !split; i++)
      for (let j = i + 2; j < n && !split; j++) {
        if (i === 0 && j === n - 1) continue;
        const x = contact(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]);
        if (x) split = { i, j, x };
      }
    if (!split) {
      loops.push({ points, edges });
      continue;
    }
    const { i, j, x } = split;
    // Loop 1: x → p[i+1] … p[j] → x; loop 2: x → p[j+1] … p[i] → x. Each starts along one of the
    // edges that met and runs back to x along the other.
    stack.push(
      dropRepeats({ points: [x, ...points.slice(i + 1, j + 1)], edges: [edges[i], ...edges.slice(i + 1, j + 1)] }),
      dropRepeats({
        points: [x, ...points.slice(j + 1), ...points.slice(0, i + 1)],
        edges: [edges[j], ...edges.slice(j + 1), ...edges.slice(0, i + 1)],
      }),
    );
  }
  let best: { points: Point[]; edges: number[] } = { points: [], edges: [] };
  let bestArea = 1e-6;
  for (const loop of loops) {
    const a = signedArea2(loop.points);
    if (loop.points.length >= 3 && a > 0 === positive && Math.abs(a) / 2 > bestArea) {
      best = loop;
      bestArea = Math.abs(a) / 2;
    }
  }
  return best;
}

/** The area left for building once each side's setback is taken off (the cut corner doesn't move it). */
export function buildableArea(plot: Plot): Point[] {
  const sides = plotSides(plot);
  const setbacks = sideSetbacks(plot, sides);
  const edges = plotOutline(plot, sides);
  const pts = edges.map((e) => e.a);
  const dist = edges.map((e) => (e.side === 'splay' ? 0 : setbacks[e.side].mm / MM_PER_UNIT));
  return insetPolygon(pts, dist).points;
}

/** A boundary wall's centre line along one edge of the outline, and the edge it stands on. */
export interface SideWallLine {
  side: number | 'splay';
  a: Point;
  b: Point;
  thickness: number;
  heightMm: number;
}

/**
 * The centre lines of the plot's boundary walls, each just inside its side. The cut corner has a
 * wall when either road side does (as the road side before it). Sides squeezed out get none.
 */
export function sideWallLines(plot: Plot, sides = plotSides(plot)): SideWallLine[] {
  const edges = plotOutline(plot, sides);
  const specOf = (e: OutlineEdge) => {
    if (e.side !== 'splay') return sides[e.side].wall;
    const corner = roadCorner(plot, sides)!;
    const n = plot.points.length;
    return sides[(corner - 1 + n) % n].wall ?? sides[corner].wall;
  };
  const specs = edges.map(specOf);
  const inset = insetPolygon(
    edges.map((e) => e.a),
    specs.map((w) => (w ? w.thicknessMm / MM_PER_UNIT / 2 : 0)),
  );
  const out: SideWallLine[] = [];
  const m = inset.points.length;
  inset.edges.forEach((orig, j) => {
    const spec = specs[orig];
    if (!spec) return;
    out.push({
      side: edges[orig].side,
      a: inset.points[j],
      b: inset.points[(j + 1) % m],
      thickness: spec.thicknessMm / MM_PER_UNIT,
      heightMm: spec.heightMm,
    });
  });
  return out;
}

/** The main road's length (the frontage) in plan units, before any cut corner. */
export function frontage(plot: Plot): number {
  const n = plot.points.length;
  const a = plot.points[plot.front % n];
  const b = plot.points[(plot.front + 1) % n];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Whether a plot has more than one road side. */
export const isCornerPlot = (plot: Plot) => plotSides(plot).filter((s) => s.kind === 'road').length > 1;

/** Readable names for the kinds of side. */
export const SIDE_KIND_NAMES: Record<PlotSideKind, string> = {
  road: 'Road',
  neighbour: 'Neighbour',
  back: 'Back',
  open: 'Open (park)',
};

/** The outward direction of side i, for labels outside the plot. */
export function sideOutward(plot: Plot, i: number): Point {
  return outward(plot.points, i);
}
