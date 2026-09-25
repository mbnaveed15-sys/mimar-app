import { snap } from '../geometry';
import type { Point, Wall } from '../types';

/** What a drawing point snapped to, like SketchUp's inference. */
export type SnapKind =
  | 'endpoint'
  | 'midpoint'
  | 'intersection'
  | 'on-wall'
  | 'on-line'
  | 'building-line'
  | 'axis-x'
  | 'axis-y'
  | 'locked'
  | 'grid'
  | 'free';

export interface Inference {
  point: Point;
  kind: SnapKind;
}

export const SNAP_LABELS: Record<SnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  intersection: 'Intersection',
  'on-wall': 'On wall',
  'on-line': 'On line',
  'building-line': 'On building line',
  'axis-x': 'On red axis',
  'axis-y': 'On green axis',
  locked: 'Locked',
  grid: 'Grid',
  free: '',
};

/** A straight piece to snap to: a wall's centre line or a layout line. */
export interface Segment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface InferOptions {
  walls: Wall[];
  /** Layout (drafting) lines. */
  lines?: Segment[];
  /**
   * The building line (where the setbacks end), moved in so the item being drawn touches it from
   * inside. It wins over a grid point, so walls don't end up centred on the line.
   */
  guides?: Segment[];
  /** How close counts as "on" something, in plan units (about 10 screen pixels). */
  tolerance: number;
  /** The point being drawn from, for axis inference and locks. */
  from?: Point | null;
  /** Grid step to snap to, or null when grid snapping is off. */
  grid: number | null;
  /** Keep the point on this direction from `from` (arrow-key axis lock or Shift lock). */
  lock?: Point | null;
  /** Leave these walls out (the ones being moved). */
  ignoreIds?: Set<string>;
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closest point to p on segment a–b. */
function closestOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Where two segments cross, if they do (ends touching count). */
export function crossing(a: Segment, b: Segment): Point | null {
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / denom;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / denom;
  const e = 1e-6;
  return t >= -e && t <= 1 + e && u >= -e && u <= 1 + e ? { x: a.x1 + t * rx, y: a.y1 + t * ry } : null;
}

/** Round a distance to the grid step, if there is one. */
const roundTo = (v: number, step: number | null) => (step ? Math.round(v / step) * step : v);

/**
 * Snap a raw pointer position the way SketchUp does: ends first, then midpoints, then where lines
 * and walls cross, then grid points (even under a wall), then straight across or up from the last
 * point (red and green axes), then points along walls and lines (in grid steps), then the grid.
 */
export function infer(raw: Point, opts: InferOptions): Inference {
  const { walls, tolerance, from, grid, lock, ignoreIds } = opts;
  const keep = <T extends { id: string }>(list: T[]) => (ignoreIds ? list.filter((w) => !ignoreIds.has(w.id)) : list);
  const others = keep(walls);
  const lines = keep(opts.lines ?? []);
  const guides = opts.guides ?? [];
  const all: { seg: Segment; kind: 'on-wall' | 'on-line' | 'building-line' }[] = [
    ...others.map((seg) => ({ seg, kind: 'on-wall' as const })),
    ...lines.map((seg) => ({ seg, kind: 'on-line' as const })),
    ...guides.map((seg) => ({ seg, kind: 'building-line' as const })),
  ];

  if (from && lock) {
    // Stay on the locked line; lengths along it snap to the grid.
    const len = Math.hypot(lock.x, lock.y) || 1;
    const ux = lock.x / len;
    const uy = lock.y / len;
    const t = roundTo((raw.x - from.x) * ux + (raw.y - from.y) * uy, grid);
    const point = { x: from.x + ux * t, y: from.y + uy * t };
    const kind = Math.abs(uy) < 1e-9 ? 'axis-x' : Math.abs(ux) < 1e-9 ? 'axis-y' : 'locked';
    return { point, kind };
  }

  let best: Inference | null = null;
  let bestD = tolerance;
  const consider = (point: Point, kind: SnapKind, within = tolerance) => {
    const d = dist(point, raw);
    if (d < bestD && d < within) {
      best = { point, kind };
      bestD = d;
    }
  };

  for (const { seg, kind } of all) {
    const end = kind === 'building-line' ? kind : 'endpoint';
    consider({ x: seg.x1, y: seg.y1 }, end);
    consider({ x: seg.x2, y: seg.y2 }, end);
  }
  if (best) return best;

  for (const { seg, kind } of all)
    if (kind !== 'building-line') consider({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }, 'midpoint');
  if (best) return best;

  // Crossings, among the pieces close to the pointer only (keeps this quick on big plans).
  const near = all.filter(
    ({ seg }) => dist(closestOnSegment(raw, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }), raw) < tolerance,
  );
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const x = crossing(near[i].seg, near[j].seg);
      if (x) consider(x, 'intersection');
    }
  if (best) return best;

  // On the building line, at the grid step nearest the pointer: ahead of a grid point on the line itself.
  for (const g of guides) {
    const a = { x: g.x1, y: g.y1 };
    const b = { x: g.x2, y: g.y2 };
    if (dist(closestOnSegment(raw, a, b), raw) >= tolerance) continue;
    consider(closestOnSegment(grid ? snap(raw, grid) : raw, a, b), 'building-line', tolerance * 2);
  }
  if (best) return best;

  // A grid point close by wins even over a wall or item lying on top of it.
  if (grid) {
    consider(snap(raw, grid), 'grid', Math.min(tolerance, grid * 0.35));
    if (best) return best;
  }

  if (from) {
    const dx = Math.abs(raw.x - from.x);
    const dy = Math.abs(raw.y - from.y);
    if (dy < tolerance && dx >= dy) {
      return { point: { x: from.x + roundTo(raw.x - from.x, grid), y: from.y }, kind: 'axis-x' };
    }
    if (dx < tolerance && dy > dx) {
      return { point: { x: from.x, y: from.y + roundTo(raw.y - from.y, grid) }, kind: 'axis-y' };
    }
  }

  // Along a wall or line, in grid steps from its start.
  for (const { seg, kind } of all) {
    const a = { x: seg.x1, y: seg.y1 };
    const len = dist(a, { x: seg.x2, y: seg.y2 });
    if (!len) continue;
    const ux = (seg.x2 - seg.x1) / len;
    const uy = (seg.y2 - seg.y1) / len;
    const t = Math.max(0, Math.min(len, (raw.x - a.x) * ux + (raw.y - a.y) * uy));
    const onLine = { x: a.x + ux * t, y: a.y + uy * t };
    if (dist(onLine, raw) >= tolerance) continue;
    const stepped = Math.max(0, Math.min(len, roundTo(t, grid)));
    consider({ x: a.x + ux * stepped, y: a.y + uy * stepped }, kind, tolerance * 2);
  }
  if (best) return best;

  if (grid) return { point: snap(raw, grid), kind: 'grid' };
  return { point: raw, kind: 'free' };
}

/** Unit direction for an arrow-key axis lock. */
export function axisDirection(axis: 'x' | 'y'): Point {
  return axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}
