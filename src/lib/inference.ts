import { snap } from '../geometry';
import type { Point, Wall } from '../types';

/** What a drawing point snapped to, like SketchUp's inference. */
export type SnapKind = 'endpoint' | 'midpoint' | 'on-wall' | 'axis-x' | 'axis-y' | 'locked' | 'grid' | 'free';

export interface Inference {
  point: Point;
  kind: SnapKind;
}

export const SNAP_LABELS: Record<SnapKind, string> = {
  endpoint: 'Endpoint',
  midpoint: 'Midpoint',
  'on-wall': 'On wall',
  'axis-x': 'On red axis',
  'axis-y': 'On green axis',
  locked: 'Locked',
  grid: 'Grid',
  free: '',
};

export interface InferOptions {
  walls: Wall[];
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

/** Round a distance to the grid step, if there is one. */
const roundTo = (v: number, step: number | null) => (step ? Math.round(v / step) * step : v);

/**
 * Snap a raw pointer position the way SketchUp does: wall ends first, then wall midpoints, straight
 * across or up from the last point (red and green axes), points on walls, then the grid.
 */
export function infer(raw: Point, opts: InferOptions): Inference {
  const { walls, tolerance, from, grid, lock, ignoreIds } = opts;
  const others = ignoreIds ? walls.filter((w) => !ignoreIds.has(w.id)) : walls;

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
  const consider = (point: Point, kind: SnapKind) => {
    const d = dist(point, raw);
    if (d < bestD) {
      best = { point, kind };
      bestD = d;
    }
  };

  for (const w of others) {
    consider({ x: w.x1, y: w.y1 }, 'endpoint');
    consider({ x: w.x2, y: w.y2 }, 'endpoint');
  }
  if (best) return best;

  for (const w of others) consider({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 }, 'midpoint');
  if (best) return best;

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

  for (const w of others) consider(closestOnSegment(raw, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }), 'on-wall');
  if (best) return best;

  if (grid) return { point: snap(raw, grid), kind: 'grid' };
  return { point: raw, kind: 'free' };
}

/** Unit direction for an arrow-key axis lock. */
export function axisDirection(axis: 'x' | 'y'): Point {
  return axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}
