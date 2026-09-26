import { snap } from '../geometry';
import type { Point, Wall } from '../types';
import { thicknessOf } from '../walls';

/** What a drawing point snapped to, like SketchUp's inference and AutoCAD's object snaps. */
export type SnapKind =
  | 'endpoint'
  | 'corner'
  | 'midpoint'
  | 'intersection'
  | 'perpendicular'
  | 'on-wall'
  | 'on-face'
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
  corner: 'Wall corner',
  midpoint: 'Midpoint',
  intersection: 'Intersection',
  perpendicular: 'Perpendicular',
  'on-wall': 'On wall',
  'on-face': 'On wall face',
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

/** A wall's two faces, as segments beside its centre line. */
function wallFaces(w: Wall): Segment[] {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (!len) return [];
  const h = thicknessOf(w) / 2;
  const n = { x: (-(w.y2 - w.y1) / len) * h, y: ((w.x2 - w.x1) / len) * h };
  return [1, -1].map((s) => ({
    id: `${w.id}:${s}`,
    x1: w.x1 + n.x * s,
    y1: w.y1 + n.y * s,
    x2: w.x2 + n.x * s,
    y2: w.y2 + n.y * s,
  }));
}

type Kind = 'on-wall' | 'on-face' | 'on-line' | 'building-line';

/**
 * Snap a raw pointer position the way AutoCAD's object snaps and SketchUp's inference do:
 * 1. points, the nearest winning: ends, wall-face corners, midpoints, crossings (faces too),
 *    perpendicular from the last point, and where the axis from the last point meets a wall;
 * 2. along the building line (ahead of a grid point on it);
 * 3. straight across or up from the last point (the red and green axes), so a line stays level;
 * 4. along a wall's centre line or face, or a layout line, at the grid step nearest the pointer;
 * 5. the grid.
 */
export function infer(raw: Point, opts: InferOptions): Inference {
  const { walls, tolerance, from, grid, lock, ignoreIds } = opts;
  const keep = <T extends { id: string }>(list: T[]) => (ignoreIds ? list.filter((w) => !ignoreIds.has(w.id)) : list);
  const others = keep(walls);
  const lines = keep(opts.lines ?? []);
  const guides = opts.guides ?? [];

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

  const nearRaw = (seg: Segment) =>
    dist(closestOnSegment(raw, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }), raw) < tolerance;
  // Only the pieces near the pointer matter for faces, crossings and points along them.
  const nearWalls = others.filter(nearRaw);
  const near: { seg: Segment; kind: Kind }[] = [
    ...nearWalls.map((seg) => ({ seg, kind: 'on-wall' as const })),
    ...others
      .flatMap(wallFaces)
      .filter(nearRaw)
      .map((seg) => ({ seg, kind: 'on-face' as const })),
    ...lines.filter(nearRaw).map((seg) => ({ seg, kind: 'on-line' as const })),
    ...guides.filter(nearRaw).map((seg) => ({ seg, kind: 'building-line' as const })),
  ];

  let best: Inference | null = null;
  let bestD = Infinity;
  const consider = (point: Point, kind: SnapKind, within = tolerance) => {
    const d = dist(point, raw);
    if (d < within && d < bestD) {
      best = { point, kind };
      bestD = d;
    }
  };

  // 1. Points: the nearest wins.
  for (const seg of [...others, ...lines]) {
    consider({ x: seg.x1, y: seg.y1 }, 'endpoint');
    consider({ x: seg.x2, y: seg.y2 }, 'endpoint');
    consider({ x: (seg.x1 + seg.x2) / 2, y: (seg.y1 + seg.y2) / 2 }, 'midpoint');
  }
  for (const { seg, kind } of near)
    if (kind === 'on-face') {
      consider({ x: seg.x1, y: seg.y1 }, 'corner');
      consider({ x: seg.x2, y: seg.y2 }, 'corner');
    }
  for (const g of guides) {
    consider({ x: g.x1, y: g.y1 }, 'building-line');
    consider({ x: g.x2, y: g.y2 }, 'building-line');
  }
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const x = crossing(near[i].seg, near[j].seg);
      if (x) consider(x, 'intersection');
    }
  if (from)
    for (const { seg } of near) {
      // Perpendicular from the last point onto the wall or line.
      const a = { x: seg.x1, y: seg.y1 };
      const b = { x: seg.x2, y: seg.y2 };
      const foot = closestOnSegment(from, a, b);
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = len2 ? ((from.x - a.x) * (b.x - a.x) + (from.y - a.y) * (b.y - a.y)) / len2 : -1;
      if (t > 1e-6 && t < 1 - 1e-6 && dist(foot, from) > 1e-6) consider(foot, 'perpendicular');
      // Where the axis from the last point meets it.
      for (const axis of [
        { x1: from.x - 1e7, y1: from.y, x2: from.x + 1e7, y2: from.y },
        { x1: from.x, y1: from.y - 1e7, x2: from.x, y2: from.y + 1e7 },
      ]) {
        const x = crossing({ id: 'axis', ...axis }, seg);
        if (x) consider(x, 'intersection');
      }
    }
  if (best) return best;

  // 2. On the building line, at the grid step nearest the pointer: ahead of a grid point on the line itself.
  for (const { seg, kind } of near)
    if (kind === 'building-line')
      consider(
        closestOnSegment(grid ? snap(raw, grid) : raw, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }),
        'building-line',
        tolerance * 2,
      );
  if (best) return best;

  // 3. Straight across or up from the last point: ahead of grid points, so a line from an off-grid point stays level.
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

  // 4. Along a wall, a wall face or a layout line, at the grid step nearest the pointer (the grid
  //    point itself when it lies on it).
  for (const { seg, kind } of near)
    if (kind !== 'building-line')
      consider(
        closestOnSegment(grid ? snap(raw, grid) : raw, { x: seg.x1, y: seg.y1 }, { x: seg.x2, y: seg.y2 }),
        kind,
        tolerance * 2,
      );
  if (best) return best;

  // 5. The grid.
  if (grid) return { point: snap(raw, grid), kind: 'grid' };
  return { point: raw, kind: 'free' };
}

/** Unit direction for an arrow-key axis lock. */
export function axisDirection(axis: 'x' | 'y'): Point {
  return axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}
