/**
 * Where a door or window can go on a wall. A wall is split into pieces by the walls that meet or
 * cross it; an opening sits inside one piece, kept a gap away from the faces of the walls at its
 * ends (and from a free wall end) and from the other doors and windows on it, so it is never flush
 * with a corner. It snaps to the centre of the piece, the centre of either half, tight against the
 * gap, and to round distances from the corner. Pure: plan in, position out.
 */
import type { Id, Opening, Point, Wall } from '../types';
import { thicknessOf } from '../walls';

/** The gap kept between a door or window and a corner, when not set: 6". */
export const DEFAULT_OPENING_GAP_MM = 152.4;
/** The smallest gap that can be set: 2". */
export const MIN_OPENING_GAP_MM = 50.8;
/** The largest gap that can be set: 3'. */
export const MAX_OPENING_GAP_MM = 914.4;

/** A gap from storage or typed in, kept within its limits. */
export const clampGap = (mm: unknown): number =>
  typeof mm === 'number' && Number.isFinite(mm)
    ? Math.min(MAX_OPENING_GAP_MM, Math.max(MIN_OPENING_GAP_MM, mm))
    : DEFAULT_OPENING_GAP_MM;

const EPS = 1e-6;
/** Blocked stretches shorter than this (plan units) are just walls touching end to end. */
const MIN_BLOCK = 0.5;
/** How far off the centre line the pointer must be to pick a side (plan units). */
const SIDE_EPS = 0.5;
/** How close two wall ends must be to count as joined (plan units). */
const JOIN = 0.5;

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

interface Frame {
  a: Point;
  /** Unit direction from start to end, and the unit normal to its left. */
  u: Point;
  n: Point;
  len: number;
}

function frameOf(w: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'>): Frame {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  const u = len ? { x: (w.x2 - w.x1) / len, y: (w.y2 - w.y1) / len } : { x: 1, y: 0 };
  return { a: { x: w.x1, y: w.y1 }, u, n: { x: -u.y, y: u.x }, len };
}

/**
 * The part of the segment from p to p + u·len inside another wall's outline (its centre line
 * widened by its thickness), as distances along the segment; null when it misses.
 */
function clipToWall(p: Point, u: Point, len: number, other: Wall): [number, number] | null {
  const f = frameOf(other);
  if (!f.len) return null;
  const half = thicknessOf(other) / 2 + EPS * 10;
  let t0 = 0;
  let t1 = len;
  // Each side of the outline: along the other wall (0..len) and across it (-half..half).
  const rel = sub(p, f.a);
  for (const [axis, lo, hi] of [
    [f.u, -EPS * 10, f.len + EPS * 10],
    [f.n, -half, half],
  ] as const) {
    const start = dot(rel, axis);
    const rate = dot(u, axis);
    if (Math.abs(rate) < 1e-12) {
      if (start < lo || start > hi) return null;
      continue;
    }
    let a = (lo - start) / rate;
    let b = (hi - start) / rate;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

/** Join overlapping stretches and drop the tiny ones. */
function merge(list: [number, number][]): [number, number][] {
  const sorted = list.filter(([a, b]) => b - a >= MIN_BLOCK).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Walls that could touch this one: their boxes overlap its box, grown by the thickest wall. */
function nearbyWalls(self: Pick<Wall, 'x1' | 'y1' | 'x2' | 'y2'> & { id?: Id }, walls: Wall[]): Wall[] {
  const reach = walls.reduce((m, w) => Math.max(m, thicknessOf(w)), 0) + 1;
  const minX = Math.min(self.x1, self.x2) - reach;
  const maxX = Math.max(self.x1, self.x2) + reach;
  const minY = Math.min(self.y1, self.y2) - reach;
  const maxY = Math.max(self.y1, self.y2) + reach;
  return walls.filter(
    (w) =>
      w.id !== self.id &&
      Math.max(w.x1, w.x2) >= minX &&
      Math.min(w.x1, w.x2) <= maxX &&
      Math.max(w.y1, w.y2) >= minY &&
      Math.min(w.y1, w.y2) <= maxY,
  );
}

/** Stretches of the segment a–b covered by other walls, as distances from a. */
export function blockedAlong(a: Point, b: Point, walls: Wall[], selfId?: Id): [number, number][] {
  const f = frameOf({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  if (!f.len) return [];
  const seg = { id: selfId, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  const hits: [number, number][] = [];
  for (const w of nearbyWalls(seg, walls)) {
    const hit = clipToWall(a, f.u, f.len, w);
    if (hit) hits.push(hit);
  }
  return merge(hits);
}

/** The stretches of the segment a–b clear of other walls, as distances from a. */
export function clearAlong(a: Point, b: Point, walls: Wall[], selfId?: Id): [number, number][] {
  return clearOf(Math.hypot(b.x - a.x, b.y - a.y), blockedAlong(a, b, walls, selfId));
}

/** The stretches of 0..len left clear by the blocked ones. */
function clearOf(len: number, blocked: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let at = 0;
  for (const [a, b] of blocked) {
    if (a > at + EPS) out.push([at, Math.min(a, len)]);
    at = Math.max(at, b);
  }
  if (len > at + EPS) out.push([at, len]);
  return out;
}

/** A wall's two faces, left then right of its direction, as segments. */
export function faceSegments(w: Wall): [Point, Point][] {
  const f = frameOf(w);
  const h = thicknessOf(w) / 2;
  return [1, -1].map((s): [Point, Point] => [
    { x: w.x1 + f.n.x * h * s, y: w.y1 + f.n.y * h * s },
    { x: w.x2 + f.n.x * h * s, y: w.y2 + f.n.y * h * s },
  ]);
}

/**
 * A stretch of a wall clear of the walls that meet or cross it, as distances along its centre line
 * from its start. `gapA` and `gapB`: an opening must keep the gap at that end (a wall face or a free
 * end); not where the wall carries straight on into another.
 */
export interface WallPiece {
  a: number;
  b: number;
  gapA: boolean;
  gapB: boolean;
}

/** Another wall carries straight on from this end (so the end isn't a corner). */
function carriesOn(wall: Wall, end: Point, walls: Wall[]): boolean {
  const f = frameOf(wall);
  return walls.some((w) => {
    if (w.id === wall.id) return false;
    const g = frameOf(w);
    if (!g.len || Math.abs(f.u.x * g.u.y - f.u.y * g.u.x) > 0.02) return false;
    const near = (p: Point) => Math.hypot(p.x - end.x, p.y - end.y) <= JOIN;
    return near({ x: w.x1, y: w.y1 }) || near({ x: w.x2, y: w.y2 });
  });
}

/** The pieces of a wall between the walls that meet or cross it (either face counts). */
export function wallPieces(wall: Wall, walls: Wall[]): WallPiece[] {
  const f = frameOf(wall);
  if (!f.len) return [];
  // Where either face runs into another wall, projected onto the centre line.
  const blocked = merge(
    faceSegments(wall).flatMap(([a, b]) =>
      blockedAlong(a, b, walls, wall.id).map(([s, e]): [number, number] => [s, e]),
    ),
  );
  const startOn = carriesOn(wall, { x: wall.x1, y: wall.y1 }, walls);
  const endOn = carriesOn(wall, { x: wall.x2, y: wall.y2 }, walls);
  return clearOf(f.len, blocked).map(([a, b]) => ({
    a,
    b,
    gapA: !(a < EPS && startOn),
    gapB: !(b > f.len - EPS && endOn),
  }));
}

/** Which piece a distance along the wall falls in (the nearest when it is inside another wall). */
export function pieceAt(pieces: WallPiece[], s: number): WallPiece | null {
  let best: WallPiece | null = null;
  let bestD = Infinity;
  for (const p of pieces) {
    const d = s < p.a ? p.a - s : s > p.b ? s - p.b : 0;
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** What a door or window snapped to along its wall (labels are in inference's SNAP_LABELS). */
export type OpeningSnap = 'wall-centre' | 'half-centre' | 'corner-gap' | 'from-corner';

export interface PlaceContext {
  /** All walls on the floor (the host among them). */
  walls: Wall[];
  /** Doors and windows on the floor; those on other walls, or only drawn on a face, are skipped. */
  openings: Opening[];
  /** The gap to keep from corners and other openings, in plan units. */
  gap: number;
  /** Grid step for round distances from the corner, or null. */
  grid: number | null;
  /** How close to a snap point counts, in plan units. */
  tolerance: number;
  /** The opening being moved: it doesn't get in its own way. */
  ignoreId?: Id;
  /** A length in plan units as text, for messages. */
  fmt: (units: number) => string;
  /** "door", "window" or "gate", for messages. */
  noun: string;
  /** Just keep it clear: no snapping (for a width changed in place, or a nudge). */
  noSnap?: boolean;
}

export type Placement =
  | {
      ok: true;
      /** Centre, along the wall from its start. */
      s: number;
      x: number;
      y: number;
      angle: number;
      width: number;
      snap: OpeningSnap | null;
      piece: WallPiece;
      /** Clear distance from each edge to the end of its piece (towards the wall's start, and its end). */
      before: number;
      after: number;
    }
  | { ok: false; error: string; piece: WallPiece | null };

/** Where the centre of an opening can go in a piece, leaving the gaps: [lo, hi] less the other openings. */
function allowedRanges(wall: Wall, piece: WallPiece, width: number, ctx: PlaceContext): [number, number][] {
  const f = frameOf(wall);
  const lo = piece.a + (piece.gapA ? ctx.gap : 0) + width / 2;
  const hi = piece.b - (piece.gapB ? ctx.gap : 0) - width / 2;
  if (lo > hi + EPS) return [];
  const taken: [number, number][] = ctx.openings
    .filter((o) => o.wallId === wall.id && o.id !== ctx.ignoreId && !o.flat)
    .map((o) => {
      const s = dot(sub(o, f.a), f.u);
      const reach = o.width / 2 + ctx.gap + width / 2;
      return [s - reach, s + reach];
    });
  let ranges: [number, number][] = [[lo, Math.max(lo, hi)]];
  for (const [a, b] of taken) {
    ranges = ranges.flatMap(([x, y]): [number, number][] => {
      if (b <= x + EPS || a >= y - EPS) return [[x, y]];
      const out: [number, number][] = [];
      if (a > x + EPS) out.push([x, a]);
      if (b < y - EPS) out.push([b, y]);
      return out;
    });
  }
  return ranges;
}

const nearestIn = (ranges: [number, number][], s: number) => {
  let best = s;
  let bestD = Infinity;
  for (const [a, b] of ranges) {
    const v = Math.min(b, Math.max(a, s));
    if (Math.abs(v - s) < bestD) {
      best = v;
      bestD = Math.abs(v - s);
    }
  }
  return best;
};

const inRanges = (ranges: [number, number][], s: number) => ranges.some(([a, b]) => s >= a - EPS && s <= b + EPS);

function placed(wall: Wall, piece: WallPiece, s: number, width: number, snap: OpeningSnap | null): Placement {
  const f = frameOf(wall);
  return {
    ok: true,
    s,
    x: f.a.x + f.u.x * s,
    y: f.a.y + f.u.y * s,
    angle: (Math.atan2(f.u.y, f.u.x) * 180) / Math.PI,
    width,
    snap,
    piece,
    before: s - width / 2 - piece.a,
    after: piece.b - (s + width / 2),
  };
}

/** Why an opening can't go in a piece: too short for it and its gaps, or full. */
function noRoom(piece: WallPiece, width: number, ctx: PlaceContext): Placement {
  const need = width + (piece.gapA ? ctx.gap : 0) + (piece.gapB ? ctx.gap : 0);
  const len = piece.b - piece.a;
  const error =
    len + EPS < need
      ? `This piece of wall is ${ctx.fmt(len)}: a ${ctx.fmt(width)} ${ctx.noun} needs ${ctx.fmt(need)} with its gaps.`
      : `No room for a ${ctx.fmt(width)} ${ctx.noun} here: it would be too close to a door or window.`;
  return { ok: false, error, piece };
}

/**
 * Put an opening of the given width on the wall near p: in the piece p is in, snapped to the
 * piece's centre, the centre of either half, tight against a gap or a round distance from the
 * nearer corner, and pushed clear of the corners and the other openings.
 */
export function placeOnWallPiece(wall: Wall, p: Point, width: number, ctx: PlaceContext): Placement {
  const f = frameOf(wall);
  if (!f.len) return { ok: false, error: `This wall has no length.`, piece: null };
  const raw = Math.min(f.len, Math.max(0, dot(sub(p, f.a), f.u)));
  const piece = pieceAt(wallPieces(wall, ctx.walls), raw);
  if (!piece) return { ok: false, error: `There is no clear piece of this wall for a ${ctx.noun}.`, piece: null };
  const ranges = allowedRanges(wall, piece, width, ctx);
  if (!ranges.length) return noRoom(piece, width, ctx);

  const len = piece.b - piece.a;
  const lo = piece.a + (piece.gapA ? ctx.gap : 0) + width / 2;
  const hi = piece.b - (piece.gapB ? ctx.gap : 0) - width / 2;
  // Snap points, the nearest within reach winning.
  const points: [number, OpeningSnap][] = [
    [piece.a + len / 2, 'wall-centre'],
    [piece.a + len / 4, 'half-centre'],
    [piece.a + (3 * len) / 4, 'half-centre'],
    [lo, 'corner-gap'],
    [hi, 'corner-gap'],
  ];
  let s = raw;
  let snap: OpeningSnap | null = null;
  let bestD = ctx.noSnap ? -1 : ctx.tolerance;
  for (const [at, kind] of points) {
    const d = Math.abs(at - raw);
    if (d <= bestD && inRanges(ranges, at)) {
      s = at;
      snap = kind;
      bestD = d;
    }
  }
  if (!snap && ctx.grid && !ctx.noSnap) {
    // A round distance from the nearer corner to the opening's near edge (never inside the gap).
    const fromA = raw - piece.a <= piece.b - raw;
    const edge = fromA ? raw - width / 2 - piece.a : piece.b - (raw + width / 2);
    const least = (fromA ? piece.gapA : piece.gapB) ? ctx.gap : 0;
    const d = Math.round(edge / ctx.grid) * ctx.grid;
    // Rounded into the gap: tight against the gap instead.
    const tight = d < least - EPS;
    const at = tight ? (fromA ? lo : hi) : fromA ? piece.a + d + width / 2 : piece.b - d - width / 2;
    if (inRanges(ranges, at)) {
      s = at;
      snap = tight ? 'corner-gap' : 'from-corner';
    }
  }
  if (!inRanges(ranges, s)) {
    s = nearestIn(ranges, s);
    snap = Math.abs(s - lo) < EPS || Math.abs(s - hi) < EPS ? 'corner-gap' : null;
  }
  return placed(wall, piece, s, width, snap);
}

/**
 * Put an opening a typed distance from the corner nearer p (the clear distance from the corner's
 * face to the opening's edge), in the piece p is in.
 */
export function placeAtDistance(wall: Wall, p: Point, width: number, dist: number, ctx: PlaceContext): Placement {
  const f = frameOf(wall);
  const raw = Math.min(f.len, Math.max(0, dot(sub(p, f.a), f.u)));
  const piece = pieceAt(wallPieces(wall, ctx.walls), raw);
  if (!piece) return { ok: false, error: `There is no clear piece of this wall for a ${ctx.noun}.`, piece: null };
  const fromA = raw - piece.a <= piece.b - raw;
  const least = (fromA ? piece.gapA : piece.gapB) ? ctx.gap : 0;
  if (dist < least - 1e-3) return { ok: false, error: `Keep at least ${ctx.fmt(least)} from the corner.`, piece };
  const s = fromA ? piece.a + dist + width / 2 : piece.b - dist - width / 2;
  const ranges = allowedRanges(wall, piece, width, ctx);
  if (!ranges.length) return noRoom(piece, width, ctx);
  if (!inRanges(ranges, s)) {
    const far = piece.b - piece.a;
    return {
      ok: false,
      error:
        dist + width > far
          ? `That is past the end of this piece of wall (${ctx.fmt(far)}).`
          : `That is too close to the other corner or to a door or window.`,
      piece,
    };
  }
  return placed(wall, piece, s, width, null);
}

/** Where a door or window stands now: in its piece, and whether it keeps its gaps. */
export function openingFits(o: Opening, wall: Wall, ctx: Omit<PlaceContext, 'ignoreId'>): boolean {
  const f = frameOf(wall);
  const s = dot(sub(o, f.a), f.u);
  const piece = pieceAt(wallPieces(wall, ctx.walls), s);
  if (!piece) return false;
  return inRanges(allowedRanges(wall, piece, o.width, { ...ctx, ignoreId: o.id }), s);
}

// Doors: which way they open and where the hinge is, in plan directions.

/** The side a door opens towards and the end its hinge is at, as unit directions. */
export function doorSides(o: Pick<Opening, 'angle' | 'flipSide' | 'flipHinge'>): { swing: Point; hinge: Point } {
  const a = (o.angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -u.y, y: u.x };
  return {
    swing: o.flipSide ? n : { x: -n.x, y: -n.y },
    hinge: o.flipHinge ? u : { x: -u.x, y: -u.y },
  };
}

/** The flips that make a door at this angle open towards `swing` with its hinge towards `hinge`. */
export function flipsFor(angle: number, swing: Point, hinge: Point): { flipSide: boolean; flipHinge: boolean } {
  const a = (angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -u.y, y: u.x };
  return { flipSide: dot(swing, n) > 0, flipHinge: dot(hinge, u) > 0 };
}

/** Which hand a door is: its hinge on the left or the right, seen from the side it opens into. */
export type Hand = 'left' | 'right';

export function handOf(o: Pick<Opening, 'angle' | 'flipSide' | 'flipHinge'>): Hand {
  const { swing, hinge } = doorSides(o);
  // Facing the wall from the swing side (facing -swing), your right is this way on the plan (y down).
  const right = { x: swing.y, y: -swing.x };
  return dot(hinge, right) > 0 ? 'right' : 'left';
}

/** The flips for a door at this angle opening towards the side p is on, with the given hand. */
export { SIDE_EPS };

export function flipsTowards(
  o: Pick<Opening, 'angle' | 'x' | 'y'>,
  p: Point,
  hand: Hand,
): { flipSide: boolean; flipHinge: boolean } {
  const a = (o.angle * Math.PI) / 180;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = { x: -u.y, y: u.x };
  // Right on the centre line (placed from code, say): the usual side.
  const side = dot(sub(p, o), n) > SIDE_EPS ? n : { x: -n.x, y: -n.y };
  const right = { x: side.y, y: -side.x };
  const hinge = hand === 'right' ? right : { x: -right.x, y: -right.y };
  return flipsFor(o.angle, side, hinge);
}
