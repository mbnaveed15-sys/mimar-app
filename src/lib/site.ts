import { MM_PER_UNIT } from './scale';
import { buildableArea, insetPolygon } from './plot';
import type { Plot, Point, Stair } from '../types';

/** The area left for building once the setbacks are taken off. */
export { buildableArea };

/**
 * The building line moved in, per edge, by how far an item's centre sits from its face: `half`
 * gets each edge's direction. Items placed on it touch the building line from inside.
 */
export function buildingGuide(plot: Plot, half: (dir: Point) => number): Point[] {
  const line = buildableArea(plot);
  return insetPolygon(
    line,
    line.map((p, i) => {
      const q = line[(i + 1) % line.length];
      const l = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return half({ x: (q.x - p.x) / l, y: (q.y - p.y) / l });
    }),
  ).points;
}

/** Centre lines of walls of the given thickness just inside an outline (a parapet round a slab). */
export function boundaryWallLines(plot: Pick<Plot, 'points'>, thickness: number): [Point, Point][] {
  const inner = insetPolygon(
    plot.points,
    plot.points.map(() => thickness / 2),
  ).points;
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
  kind: 'tread' | 'landing' | 'ramp' | 'pole';
  /** A curved or spiral stair's wedge (or its pole), as an outline; x, y, w, h are then its box. */
  points?: Point[];
  /** Past a spiral's first turn: over the treads below, so left out of the plan. */
  overhead?: boolean;
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

/** What each stair shape is called. */
export const STAIR_SHAPE_NAMES: Record<Stair['shape'], string> = {
  straight: 'Straight',
  L: 'L-shaped',
  U: 'U-shaped',
  curved: 'Curved',
  spiral: 'Spiral',
  ramp: 'Ramp',
};

/** Clear height wanted over a spiral stair's treads, under the turn above. */
export const SPIRAL_HEADROOM_MM = 2000;

/** A curved stair's usual inner radius, and a spiral stair's centre pole. */
export const CURVED_INNER_MM = 1000;
export const SPIRAL_POLE_MM = 75;

export function stairLayout(
  st: Pick<Stair, 'shape' | 'width' | 'riseMm' | 'treadMm'> & Partial<Pick<Stair, 'innerMm' | 'turn'>>,
): StairLayout {
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

  if (st.shape === 'curved' || st.shape === 'spiral') return roundStair(st, risers, riserMm, treads, T);

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

/**
 * A curved or spiral stair: wedge treads round a centre, the tread depth measured on the walking
 * line (the middle of the flight). It starts at the bottom of its box going up the page (-y) and
 * turns left (or right) as it climbs; the box is centred on 0,0.
 */
function roundStair(
  st: Pick<Stair, 'shape' | 'width' | 'innerMm' | 'turn'>,
  risers: number,
  riserMm: number,
  treads: number,
  T: number,
): StairLayout {
  const u = (mm: number) => mm / MM_PER_UNIT;
  const spiral = st.shape === 'spiral';
  const ri = spiral ? u(SPIRAL_POLE_MM) : u(Math.max(0, st.innerMm ?? CURVED_INNER_MM));
  const ro = ri + st.width;
  const rw = ri + st.width / 2;
  const step = T / rw;
  const sx = st.turn === 'right' ? -1 : 1;
  const at = (r: number, a: number): Point => ({ x: sx * r * Math.cos(a), y: -r * Math.sin(a) });
  const arc = (r: number, a0: number, a1: number) => {
    const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / ((5 * Math.PI) / 180)));
    return Array.from({ length: n + 1 }, (_, i) => at(r, a0 + ((a1 - a0) * i) / n));
  };
  const wedges: { points: Point[]; topMm: number; overhead: boolean }[] = [];
  for (let i = 0; i < treads; i++) {
    const a0 = i * step;
    const a1 = (i + 1) * step;
    wedges.push({
      points: [...arc(ri, a0, a1), ...arc(ro, a1, a0)],
      topMm: (i + 1) * riserMm,
      overhead: a1 > 2 * Math.PI + 1e-6,
    });
  }
  const pole = spiral ? arc(ri, 0, 2 * Math.PI).slice(0, -1) : null;
  // Centre the box of what shows in plan (a spiral's first turn) on 0,0.
  const shown = [...wedges.filter((w) => !w.overhead).flatMap((w) => w.points), ...(pole ?? [])];
  const xs = shown.map((p) => p.x);
  const ys = shown.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const dx = -(x0 + x1) / 2;
  const dy = -(y0 + y1) / 2;
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
  const part = (points: Point[], topMm: number, kind: StairPart['kind'], overhead = false): StairPart => {
    const px = points.map((p) => p.x);
    const py = points.map((p) => p.y);
    const x = Math.min(...px);
    const y = Math.min(...py);
    return { x, y, w: Math.max(...px) - x, h: Math.max(...py) - y, topMm, kind, points, ...(overhead && { overhead }) };
  };
  const parts = wedges.map((w) => part(w.points.map(move), w.topMm, 'tread', w.overhead));
  if (pole) parts.push(part(pole.map(move), risers * riserMm, 'pole'));
  const sweep = Math.min(treads * step, 2 * Math.PI - step / 2);
  return {
    risers,
    riserMm,
    w: x1 - x0,
    h: y1 - y0,
    parts,
    path: arc(rw, 0, sweep).map(move),
  };
}

/** Where a stair's tread or landing lies in its own frame: its outline, or its box. */
export function partOutline(part: StairPart): Point[] {
  return (
    part.points ?? [
      { x: part.x, y: part.y },
      { x: part.x + part.w, y: part.y },
      { x: part.x + part.w, y: part.y + part.h },
      { x: part.x, y: part.y + part.h },
    ]
  );
}

/** How much a spiral stair climbs in one turn (mm): the headroom under the turn above, less the tread. */
export function spiralTurnRiseMm(layout: StairLayout): number | null {
  const treads = layout.parts.filter((p) => p.kind === 'tread');
  const over = treads.findIndex((p) => p.overhead);
  return over < 0 ? null : over * layout.riserMm;
}

/** A new stair's own settings from the Stairs tool's, climbing `riseMm`. */
export function stairSpec(
  site: {
    stairShape: Stair['shape'];
    stairWidthMm: number;
    treadMm: number;
    stairInnerMm?: number;
    stairTurn?: Stair['turn'];
  },
  riseMm: number,
): Pick<Stair, 'shape' | 'width' | 'riseMm' | 'treadMm' | 'innerMm' | 'turn'> {
  const round = site.stairShape === 'curved' || site.stairShape === 'spiral';
  return {
    shape: site.stairShape,
    width: site.stairWidthMm / MM_PER_UNIT,
    riseMm,
    treadMm: site.treadMm,
    ...(site.stairShape === 'curved' && { innerMm: site.stairInnerMm ?? CURVED_INNER_MM }),
    ...(round && site.stairTurn === 'right' && { turn: 'right' as const }),
  };
}
