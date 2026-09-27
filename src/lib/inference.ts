import { snap } from '../geometry';
import type { Point, Wall } from '../types';
import { thicknessOf } from '../walls';
import { clearAlong, wallPieces } from './openingPlace';

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
  | 'free'
  // Doors and windows along their wall.
  | 'wall-centre'
  | 'half-centre'
  | 'corner-gap'
  | 'from-corner'
  // Lined up with the end of another wall or line.
  | 'aligned';

export interface Inference {
  point: Point;
  kind: SnapKind;
  /** Dotted guides to show: from the point it lines up with to the point snapped to. */
  guides?: [Point, Point][];
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
  'wall-centre': 'Centre of wall',
  'half-centre': 'Centre of half',
  'corner-gap': 'Gap from corner',
  'from-corner': 'From corner',
  aligned: 'Lined up',
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
 * 1. points, the nearest winning: ends, wall-face corners, midpoints (of whole walls, and of the
 *    pieces between the walls that meet them, on the centre line and faces), crossings (faces
 *    too), perpendicular from the last point, and where the axis from the last point meets a wall;
 * 2. along the building line (ahead of a grid point on it);
 * 3. lined up with the ends of two nearby walls or lines at once, or with one and the last point's
 *    axis, or with one where it crosses the wall or line under the pointer;
 * 4. straight across or up from the last point (the red and green axes), so a line stays level;
 * 5. lined up with the end of one nearby wall or line (a dotted guide shows which);
 * 6. along a wall's centre line or face, or a layout line, a round number of grid steps from its
 *    nearer end (for a face, from the corner at the end of its piece);
 * 7. the grid.
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
  // Midpoints of the pieces between the walls that meet a wall (the middle of each room's side).
  for (const w of nearWalls) {
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (!len) continue;
    for (const piece of wallPieces(w, others)) {
      const t = (piece.a + piece.b) / 2 / len;
      consider({ x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t }, 'midpoint');
    }
  }
  for (const { seg, kind } of near)
    if (kind === 'on-face') {
      const a = { x: seg.x1, y: seg.y1 };
      const len = dist(a, { x: seg.x2, y: seg.y2 });
      if (!len) continue;
      for (const [p, q] of clearAlong(a, { x: seg.x2, y: seg.y2 }, others, wallIdOf(seg))) {
        const t = (p + q) / 2 / len;
        consider({ x: seg.x1 + (seg.x2 - seg.x1) * t, y: seg.y1 + (seg.y2 - seg.y1) * t }, 'midpoint');
      }
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

  // 3. Lined up with the ends of nearby walls and lines (SketchUp's inference from points), where
  //    two lines of alignment cross, or one crosses the axis from the last point or a wall.
  // Not the ends of what the pointer is already on: along it, those are just its own line.
  const under = new Set(near.map(({ seg, kind }) => (kind === 'on-face' ? wallIdOf(seg) : seg.id)));
  const align = alignments(
    raw,
    [...others, ...lines].filter((seg) => !under.has(seg.id)),
    from,
    tolerance,
  );
  const { ax, ay } = align;
  // On a wall or line, a point must stay on it: only where a guide crosses it counts.
  const onSomething = near.some(({ kind }) => kind !== 'building-line');
  if (ax && ay && !onSomething) return aligned({ x: ax.x, y: ay.y }, [ax, ay]);
  if (from && ax && Math.abs(raw.y - from.y) < tolerance) return aligned({ x: ax.x, y: from.y }, [ax, from]);
  if (from && ay && Math.abs(raw.x - from.x) < tolerance) return aligned({ x: from.x, y: ay.y }, [ay, from]);
  let onSeg: Inference | null = null;
  let onSegD = tolerance * 2;
  for (const [q, upright] of [
    [ax, true],
    [ay, false],
  ] as const) {
    if (!q) continue;
    const line = upright
      ? { id: 'align', x1: q.x, y1: q.y - 1e7, x2: q.x, y2: q.y + 1e7 }
      : { id: 'align', x1: q.x - 1e7, y1: q.y, x2: q.x + 1e7, y2: q.y };
    for (const { seg, kind } of near) {
      if (kind === 'building-line') continue;
      const x = crossing(line, seg);
      if (x && dist(x, raw) < onSegD) {
        onSeg = aligned(x, [q]);
        onSegD = dist(x, raw);
      }
    }
  }
  if (onSeg) return onSeg;

  // 4. Straight across or up from the last point: ahead of grid points, so a line from an off-grid point stays level.
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

  // 5. Lined up with one nearby end (away from walls and lines): along its dotted guide, at the grid
  //    step nearest the pointer.
  if (ax && !onSomething) return aligned({ x: ax.x, y: grid ? roundTo(raw.y, grid) : raw.y }, [ax]);
  if (ay && !onSomething) return aligned({ x: grid ? roundTo(raw.x, grid) : raw.x, y: ay.y }, [ay]);

  // 6. Along a wall, a wall face or a layout line, a round number of grid steps from its nearer end.
  for (const { seg, kind } of near)
    if (kind !== 'building-line') consider(alongFromEnd(raw, seg, kind, grid, others), kind, tolerance * 2);
  if (best) return best;

  // 7. The grid.
  if (grid) return { point: snap(raw, grid), kind: 'grid' };
  return { point: raw, kind: 'free' };
}

/** A snapped point lined up with others, with a dotted guide from each. */
function aligned(point: Point, from: Point[]): Inference {
  return { point, kind: 'aligned', guides: from.map((q): [Point, Point] => [q, point]) };
}

/** The wall a face segment belongs to (face ids are the wall's id, a colon and the side). */
const wallIdOf = (seg: Segment) => seg.id.slice(0, seg.id.lastIndexOf(':'));

/**
 * The ends of walls and lines near the pointer (but not under it) that it lines up with: the
 * closest in x (straight above or below) and in y (straight across), within the tolerance.
 */
function alignments(raw: Point, segs: Segment[], from: Point | null | undefined, tolerance: number) {
  const reach = tolerance * 40;
  let ax: Point | null = null;
  let ay: Point | null = null;
  let bestX = tolerance;
  let bestY = tolerance;
  for (const seg of segs)
    for (const q of [
      { x: seg.x1, y: seg.y1 },
      { x: seg.x2, y: seg.y2 },
    ]) {
      const d = dist(q, raw);
      if (d < tolerance || d > reach || (from && dist(q, from) < 1e-6)) continue;
      // The closest line-up wins; of ends lined up equally, the nearer one draws the guide.
      const dx = Math.abs(raw.x - q.x);
      const dy = Math.abs(raw.y - q.y);
      if (dx < bestX - 1e-6 || (dx < bestX + 1e-6 && ax && d < dist(ax, raw))) {
        ax = q;
        bestX = dx;
      }
      if (dy < bestY - 1e-6 || (dy < bestY + 1e-6 && ay && d < dist(ay, raw))) {
        ay = q;
        bestY = dy;
      }
    }
  return { ax, ay };
}

/**
 * The point along a segment nearest the pointer a whole number of grid steps from its nearer end:
 * for a wall face, from the corner at the end of its piece (where the next wall's face is).
 */
function alongFromEnd(raw: Point, seg: Segment, kind: Kind, grid: number | null, walls: Wall[]): Point {
  const a = { x: seg.x1, y: seg.y1 };
  const b = { x: seg.x2, y: seg.y2 };
  const len = dist(a, b);
  if (!grid || !len) return closestOnSegment(raw, a, b);
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const t = Math.max(0, Math.min(len, (raw.x - a.x) * u.x + (raw.y - a.y) * u.y));
  let [lo, hi] = [0, len];
  if (kind === 'on-face') {
    const piece = clearAlong(a, b, walls, wallIdOf(seg)).find(([p, q]) => t >= p - 1e-6 && t <= q + 1e-6);
    if (piece) [lo, hi] = piece;
  }
  const fromLo = t - lo <= hi - t;
  const d = roundTo(fromLo ? t - lo : hi - t, grid);
  const s = Math.max(0, Math.min(len, fromLo ? lo + d : hi - d));
  return { x: a.x + u.x * s, y: a.y + u.y * s };
}

/** Unit direction for an arrow-key axis lock. */
export function axisDirection(axis: 'x' | 'y'): Point {
  return axis === 'x' ? { x: 1, y: 0 } : { x: 0, y: 1 };
}
