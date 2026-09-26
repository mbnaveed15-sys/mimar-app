import { MM_PER_UNIT } from './scale';
import type { Plot, Point, Stair } from '../types';

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const area = (pts: Point[]) =>
  Math.abs(pts.reduce((s, p, i) => s + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0)) / 2;

/** Shift each edge i of a polygon sideways by dist[i] (sign picks the side) and re-join the corners. */
function shiftEdges(pts: Point[], dist: number[]): Point[] {
  const n = pts.length;
  const line = (i: number) => {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const e = sub(b, a);
    const l = Math.hypot(e.x, e.y) || 1;
    const shift = { x: (e.y / l) * dist[i], y: (-e.x / l) * dist[i] };
    return { p: { x: a.x + shift.x, y: a.y + shift.y }, d: e };
  };
  return pts.map((_, i) => {
    const L1 = line((i - 1 + n) % n);
    const L2 = line(i);
    const denom = L1.d.x * L2.d.y - L1.d.y * L2.d.x;
    if (Math.abs(denom) < 1e-9) return L2.p;
    const t = ((L2.p.x - L1.p.x) * L2.d.y - (L2.p.y - L1.p.y) * L2.d.x) / denom;
    return { x: L1.p.x + L1.d.x * t, y: L1.p.y + L1.d.y * t };
  });
}

/** Shrink a polygon inward by a distance per edge. */
function inset(pts: Point[], dist: number[]): Point[] {
  const a = shiftEdges(pts, dist);
  return area(a) <= area(pts)
    ? a
    : shiftEdges(
        pts,
        dist.map((d) => -d),
      );
}

/** Setback per edge (plan units): the front edge, the edge opposite it, and the sides. */
function setbackPerEdge(plot: Plot): number[] {
  const n = plot.points.length;
  const u = (mm: number) => mm / MM_PER_UNIT;
  return plot.points.map((_, i) => {
    if (i === plot.front) return u(plot.setbacks.front);
    if (n === 4 && i === (plot.front + 2) % 4) return u(plot.setbacks.rear);
    if (n === 4 && i === (plot.front + 3) % 4) return u(plot.setbacks.side2 ?? plot.setbacks.sides);
    return u(plot.setbacks.sides);
  });
}

/** The area left for building once the setbacks are taken off. */
export function buildableArea(plot: Plot): Point[] {
  return inset(plot.points, setbackPerEdge(plot));
}

/**
 * The building line moved in, per edge, by how far an item's centre sits from its face: `half`
 * gets each edge's direction. Items placed on it touch the building line from inside.
 */
export function buildingGuide(plot: Plot, half: (dir: Point) => number): Point[] {
  const line = buildableArea(plot);
  return inset(
    line,
    line.map((p, i) => {
      const q = line[(i + 1) % line.length];
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return half({ x: (q.x - p.x) / l, y: (q.y - p.y) / l });
    }),
  );
}

/** Centre lines of boundary walls of the given thickness, just inside the plot line. */
export function boundaryWallLines(plot: Plot, thickness: number): [Point, Point][] {
  const inner = inset(
    plot.points,
    plot.points.map(() => thickness / 2),
  );
  return inner.map((p, i) => [p, inner[(i + 1) % inner.length]]);
}

/** A plot rectangle from two corners; the front is the bottom edge (nearest the viewer). */
export function plotRect(a: Point, b: Point): Point[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  // Order: top-left, top-right, bottom-right, bottom-left; edge 2 (bottom) faces the road.
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Steepest comfortable riser (7") and a usual tread (10"). */
export const MAX_RISER_MM = 177.8;
export const DEFAULT_TREAD_MM = 254;
/** Ramps climb 1 in 12. */
export const RAMP_SLOPE = 12;
const LANDING_GAP_MM = 100;

/** One step (or landing, or ramp) as a rectangle in the stair's own frame, and the height of its top. */
export interface StairPart {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Height of the top surface above the stair's floor, in mm (ramps: the high end). */
  topMm: number;
  /** For ramps: the low end's height, and which way it rises (-y means towards the top of the footprint). */
  bottomMm?: number;
  kind: 'tread' | 'landing' | 'ramp';
}

export interface StairLayout {
  risers: number;
  riserMm: number;
  /** Footprint in plan units (w across, h along). */
  w: number;
  h: number;
  parts: StairPart[];
  /** The walking line, bottom to top, for the arrow in plan. */
  path: Point[];
}

/**
 * Work out a stair from its shape, width and total rise: how many risers (none steeper than 7"),
 * where each tread and landing goes, and its footprint. Local frame: centred on 0,0, climbing
 * from the bottom (+y) towards the top (-y), like the plan symbol's UP arrow.
 */
/** The most a stair or ramp may climb (10 m): more is damage, not a design. */
export const MAX_RISE_MM = 10000;

export function stairLayout(st: Pick<Stair, 'shape' | 'width' | 'riseMm' | 'treadMm'>): StairLayout {
  const u = (mm: number) => mm / MM_PER_UNIT;
  const W = st.width;
  const T = u(st.treadMm);
  if (st.shape === 'ramp') {
    const len = u(st.riseMm * RAMP_SLOPE);
    return {
      risers: 0,
      riserMm: 0,
      w: W,
      h: len,
      parts: [{ x: -W / 2, y: -len / 2, w: W, h: len, topMm: st.riseMm, bottomMm: 0, kind: 'ramp' }],
      path: [
        { x: 0, y: len / 2 },
        { x: 0, y: -len / 2 },
      ],
    };
  }
  const rise = Math.min(Math.max(st.riseMm, 0), MAX_RISE_MM);
  const risers = Math.max(2, Math.ceil(rise / MAX_RISER_MM - 1e-9));
  const riserMm = rise / risers;
  const treads = risers - 1; // the last riser steps up onto the floor above
  const parts: StairPart[] = [];

  if (st.shape === 'straight') {
    const h = treads * T;
    for (let i = 0; i < treads; i++)
      parts.push({ x: -W / 2, y: h / 2 - (i + 1) * T, w: W, h: T, topMm: (i + 1) * riserMm, kind: 'tread' });
    return {
      risers,
      riserMm,
      w: W,
      h,
      parts,
      path: [
        { x: 0, y: h / 2 },
        { x: 0, y: -h / 2 },
      ],
    };
  }

  // Two flights with a square landing between them (the landing takes one tread's rise).
  const t1 = Math.floor((treads - 1) / 2);
  const t2 = treads - 1 - t1;
  if (st.shape === 'L') {
    // Up the left side, turn right on the landing at the top-left, then along the top.
    const w = W + t2 * T;
    const h = t1 * T + W;
    const left = -w / 2;
    const bottom = h / 2;
    for (let i = 0; i < t1; i++)
      parts.push({ x: left, y: bottom - (i + 1) * T, w: W, h: T, topMm: (i + 1) * riserMm, kind: 'tread' });
    parts.push({ x: left, y: -h / 2, w: W, h: W, topMm: (t1 + 1) * riserMm, kind: 'landing' });
    for (let j = 0; j < t2; j++)
      parts.push({ x: left + W + j * T, y: -h / 2, w: T, h: W, topMm: (t1 + 2 + j) * riserMm, kind: 'tread' });
    return {
      risers,
      riserMm,
      w,
      h,
      parts,
      path: [
        { x: left + W / 2, y: bottom },
        { x: left + W / 2, y: -h / 2 + W / 2 },
        { x: w / 2, y: -h / 2 + W / 2 },
      ],
    };
  }
  // U: up the left, across the landing at the top, and back down... up again on the right.
  const gap = u(LANDING_GAP_MM);
  const w = 2 * W + gap;
  const h = Math.max(t1, t2) * T + W;
  const left = -w / 2;
  const bottom = h / 2;
  for (let i = 0; i < t1; i++)
    parts.push({ x: left, y: bottom - (i + 1) * T, w: W, h: T, topMm: (i + 1) * riserMm, kind: 'tread' });
  parts.push({ x: left, y: -h / 2, w, h: W, topMm: (t1 + 1) * riserMm, kind: 'landing' });
  for (let j = 0; j < t2; j++)
    parts.push({ x: left + W + gap, y: -h / 2 + W + j * T, w: W, h: T, topMm: (t1 + 2 + j) * riserMm, kind: 'tread' });
  return {
    risers,
    riserMm,
    w,
    h,
    parts,
    path: [
      { x: left + W / 2, y: bottom },
      { x: left + W / 2, y: -h / 2 + W / 2 },
      { x: w / 2 - W / 2, y: -h / 2 + W / 2 },
      { x: w / 2 - W / 2, y: -h / 2 + W + t2 * T },
    ],
  };
}
