/**
 * Cladding: a skin of stone, tiles, ACP, glass and the like on a wall's face, usually its outside one. It
 * covers the wall (and the frame in it) in 3D and the elevations, shows as a band on the plan, counts as the
 * building in the setbacks check, and is measured by kind for the cost. Pure.
 */
import { pointInPolygon } from '../geometry';
import { directionAlong, offsetWall, paramAlong, partOf, pointAlong, projectOnWall, runLength } from './arc';
import { MM_PER_UNIT } from './scale';
import type { Hatch } from './hatch';
import { wallFaces } from '../rooms';
import { isBuildingWall, thicknessOf } from '../walls';
import {
  levelOf,
  type Cladding,
  type CladdingKind,
  type Id,
  type Opening,
  type Pattern,
  type Point,
  type Slab,
  type Wall,
} from '../types';

export interface CladdingType {
  name: string;
  /** Usual thickness, with its fixing (mortar bed, frame or cleats), mm. */
  thicknessMm: number;
  color: string;
  pattern: Pattern;
  /** The texture's repeat, mm. */
  spanMm: number;
  /** DXF/IFC name. */
  short: string;
}

export const CLADDING: Record<CladdingKind, CladdingType> = {
  stone: { name: 'Stone', thicknessMm: 40, color: '#C9B99B', pattern: 'stone', spanMm: 600, short: 'Stone' },
  marble: { name: 'Marble', thicknessMm: 30, color: '#ECE9E2', pattern: 'marble', spanMm: 600, short: 'Marble' },
  granite: { name: 'Granite', thicknessMm: 30, color: '#6F6A66', pattern: 'granite', spanMm: 600, short: 'Granite' },
  brickTile: {
    name: 'Brick tiles',
    thicknessMm: 25,
    color: '#B4562F',
    pattern: 'brick',
    spanMm: 229,
    short: 'Brick tile',
  },
  tile: {
    name: 'Ceramic / porcelain tiles',
    thicknessMm: 15,
    color: '#D8D2C8',
    pattern: 'tiles',
    spanMm: 600,
    short: 'Tile',
  },
  terracotta: {
    name: 'Terracotta panels',
    thicknessMm: 40,
    color: '#BF663F',
    pattern: 'tiles',
    spanMm: 300,
    short: 'Terracotta',
  },
  acp: {
    name: 'ACP (aluminium composite)',
    thicknessMm: 50,
    color: '#9EA5AC',
    pattern: 'metal',
    spanMm: 1220,
    short: 'ACP',
  },
  glass: {
    name: 'Glass (spandrel)',
    thicknessMm: 75,
    color: '#8FB8CC',
    pattern: 'glass',
    spanMm: 1220,
    short: 'Glass',
  },
  wood: { name: 'Wood / WPC boards', thicknessMm: 30, color: '#A47449', pattern: 'wood', spanMm: 150, short: 'Wood' },
  plaster: {
    name: 'Textured plaster',
    thicknessMm: 20,
    color: '#E8DFCF',
    pattern: 'plain',
    spanMm: 1000,
    short: 'Plaster',
  },
};

/** The hatch a kind of cladding is drawn with on the plan and in DXF. */
export const CLADDING_HATCH: Record<CladdingKind, Hatch> = {
  stone: 'stone',
  marble: 'stone',
  granite: 'stone',
  brickTile: 'brick',
  tile: 'tiles',
  terracotta: 'tiles',
  acp: 'steel',
  glass: 'glass',
  wood: 'timber',
  plaster: 'plaster',
};

export const CLADDING_KINDS = Object.keys(CLADDING) as CladdingKind[];
export const isCladdingKind = (v: unknown): v is CladdingKind => typeof v === 'string' && v in CLADDING;

/** The cladding's thickness, mm. */
export const claddingMm = (c: Cladding) => c.thicknessMm ?? CLADDING[c.kind].thicknessMm;

/** Walls that can be clad: building walls, retaining and boundary walls, not curtain walls. */
export const cladable = (w: Wall) => w.kind !== 'curtain' && w.kind !== 'parapet' && (isBuildingWall(w) || !!w.kind);

/** Each floor's rooms (the loops its building walls close), worked out once for a list of walls. */
const LOOPS = new WeakMap<Wall[], Map<Id, Point[][]>>();
function loopsOn(level: Id, walls: Wall[]): Point[][] {
  let byLevel = LOOPS.get(walls);
  if (!byLevel) LOOPS.set(walls, (byLevel = new Map()));
  let loops = byLevel.get(level);
  if (!loops) {
    loops = wallFaces(
      walls.filter((w) => isBuildingWall(w) && levelOf(w) === level),
      true,
    );
    byLevel.set(level, loops);
  }
  return loops;
}

/**
 * The wall's outside face, away from the building: 'A' (its left normal) or 'B'; null for a wall with the
 * building on both sides (inside the house).
 */
export function outsideSide(wall: Wall, walls: Wall[]): 'A' | 'B' | null {
  const loops = loopsOn(levelOf(wall), walls);
  if (!loops.length) return 'A';
  const p = pointAlong(wall, 0.5);
  const d = directionAlong(wall, 0.5);
  const off = thicknessOf(wall) / 2 + 2;
  const inside = (q: Point) => loops.some((l) => pointInPolygon(q, l));
  const a = inside({ x: p.x - d.y * off, y: p.y + d.x * off });
  const b = inside({ x: p.x + d.y * off, y: p.y - d.x * off });
  if (a && b) return null;
  return a ? 'B' : 'A';
}

/** The side a wall's cladding is on: its own, else the outside face (side A for a wall inside the house). */
export const claddingSide = (wall: Wall, walls: Wall[]): 'A' | 'B' =>
  wall.cladding?.side ?? outsideSide(wall, walls) ?? 'A';

/** +1 for side A, -1 for side B. */
export const sideSign = (side: 'A' | 'B') => (side === 'A' ? 1 : -1);

export interface CladPiece {
  /** The cladding as a wall of its own: on the face, as thick as the cladding. */
  wall: Wall;
  /** How far it reaches past each end (plan units) to meet the cladding round a corner. */
  start: number;
  end: number;
  /** Its outline on the plan. */
  outline: Point[];
}

/**
 * Each clad wall's cladding as a thin wall on its face, reaching round the corners to meet the cladding
 * (or the face) of the wall it joins there.
 */
export function claddingPieces(walls: Wall[]): Map<Id, CladPiece> {
  const out = new Map<Id, CladPiece>();
  const clad = walls.filter((w) => w.cladding && cladable(w));
  for (const w of clad) {
    const c = w.cladding!;
    const t = thicknessOf(w);
    const ct = claddingMm(c) / MM_PER_UNIT;
    const s = sideSign(claddingSide(w, walls));
    const skin: Wall = {
      id: `${CLAD_PREFIX}${w.id}`,
      type: 'wall',
      ...offsetWallLine(w, s * (t / 2 + ct / 2)),
      thickness: ct,
      ...(w.levelId ? { levelId: w.levelId } : {}),
    };
    const reach = (atEnd: boolean) => cornerReach(w, s, t, ct, atEnd, walls);
    const start = reach(false);
    const end = reach(true);
    out.set(w.id, { wall: skin, start, end, outline: skinOutline(skin, start, end) });
  }
  return out;
}

export const CLAD_PREFIX = 'clad:';
/** The wall a cladding id belongs to (3D picks), or null. */
export const claddingWallOf = (id: string | null | undefined) =>
  id?.startsWith(CLAD_PREFIX) ? id.slice(CLAD_PREFIX.length) : null;

function offsetWallLine(w: Wall, d: number) {
  const o = offsetWall(w, d);
  return { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, ...(o.bow ? { bow: o.bow } : {}) };
}

/**
 * How far the cladding at one end of a wall reaches past it. It goes by the wall met on the cladding's own
 * side of the corner: round the outside of a corner it reaches out to that wall's far face (and over its
 * cladding there); inside a corner it stops at that wall's near face (or the cladding on it); a negative
 * reach stops short of the end. Nothing at a free end or a straight joint. Where the wall butts another
 * along its length, the cladding stops at that wall's face.
 */
function cornerReach(w: Wall, s: number, t: number, ct: number, atEnd: boolean, walls: Wall[]): number {
  const p = atEnd ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 };
  const dirHere = directionAlong(w, atEnd ? 1 : 0);
  // Pointing out of the wall at this end, and across to the cladding.
  const out = atEnd ? dirHere : { x: -dirHere.x, y: -dirHere.y };
  const n = { x: -dirHere.y * s, y: dirHere.x * s };
  const near = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) < 2;
  const others = walls.filter(
    (o) => o.id !== w.id && levelOf(o) === levelOf(w) && isBuildingWall(o) === isBuildingWall(w),
  );
  /**
   * Where the cladding ends against wall `o`, which runs along `d` here: `inner` on the inside of the corner
   * (it stops at the near face), else round the outside (it reaches the far face); `under` when the other
   * wall's cladding runs through and this one stops at it.
   */
  const meet = (o: Wall, d: Point, inner: boolean, under: boolean): number => {
    // The other wall's normal pointing on past this wall's end.
    let m = { x: -d.y, y: d.x };
    let across = out.x * m.x + out.y * m.y;
    if (across < 0) {
      m = { x: -m.x, y: -m.y };
      across = -across;
    }
    // A straight joint (the walls run on along one line): no corner.
    if (across < 0.05) return 0;
    const half = thicknessOf(o) / 2;
    const oClad = o.cladding && cladable(o) ? claddingMm(o.cladding) / MM_PER_UNIT : 0;
    // Whether the other wall's cladding is on its far face from here.
    const far = oClad > 0 && sideSign(claddingSide(o, walls)) * (-d.y * m.x + d.x * m.y) > 0;
    const face = inner ? -(half + (oClad && !far && under ? oClad : 0)) : half + (far && !under ? oClad : 0);
    const nm = n.x * m.x + n.y * m.y;
    // Where each face of this cladding meets that surface, along this wall from its end.
    const at = (y: number) => (face - y * nm) / across;
    const [a, b] = [at(t / 2), at(t / 2 + ct)];
    const r = inner ? Math.min(a, b) : Math.max(a, b);
    const limit = 3 * (thicknessOf(o) + t + ct);
    return Math.max(-limit, Math.min(limit, r));
  };
  // Of the walls ending here, the first one round from this wall's clad face.
  let best: { o: Wall; d: Point; turn: number } | null = null;
  for (const o of others)
    for (const oAtEnd of [false, true]) {
      if (!near(oAtEnd ? o.x2 : o.x1, oAtEnd ? o.y2 : o.y1)) continue;
      const d = directionAlong(o, oAtEnd ? 1 : 0);
      const away = oAtEnd ? { x: -d.x, y: -d.y } : d;
      let turn = Math.atan2(away.x * n.x + away.y * n.y, -(away.x * out.x + away.y * out.y));
      if (turn < 0) turn += 2 * Math.PI;
      // A wall lying back over this one is no corner.
      if (turn < 0.05 || turn > 2 * Math.PI - 0.05) continue;
      if (!best || turn < best.turn) best = { o, d, turn };
    }
  // Where both walls are clad on the same side of the corner, one runs through and the other stops at it.
  if (best) return meet(best.o, best.d, best.turn < Math.PI, w.id > best.o.id);
  const host = others.find((o) => !near(o.x1, o.y1) && !near(o.x2, o.y2) && projectOnWall(o, p).dist < 2);
  if (!host) return 0;
  const along = Math.min(1, Math.max(0, projectOnWall(host, p).t));
  return meet(host, directionAlong(host, along), true, true);
}

/** The plan outline of a piece of cladding, with its corner reach. */
function skinOutline(skin: Wall, start: number, end: number): Point[] {
  const half = (skin.thickness ?? 0) / 2;
  const a = offsetWall(skin, half);
  const b = offsetWall(skin, -half);
  const ext = (w: Wall, at: 0 | 1, by: number): Point => {
    const d = directionAlong(w, at);
    const p = at ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 };
    const k = at ? by : -by;
    return { x: p.x + d.x * k, y: p.y + d.y * k };
  };
  if (!skin.bow) return [ext(a, 0, start), ext(a, 1, end), ext(b, 1, end), ext(b, 0, start)];
  // A curved skin: points along its two faces.
  const n = 16;
  const faceA = Array.from({ length: n + 1 }, (_, i) => pointAlong(a, i / n));
  const faceB = Array.from({ length: n + 1 }, (_, i) => pointAlong(b, i / n)).reverse();
  return [ext(a, 0, start), ...faceA, ext(a, 1, end), ext(b, 1, end), ...faceB, ext(b, 0, start)];
}

/**
 * A piece of cladding as it shows on the plan: its outline, broken at the wall's doors and windows (the
 * cladding stops at an opening).
 */
export function claddingBands(piece: CladPiece, openings: Opening[]): Point[][] {
  const skin = piece.wall;
  const len = runLength(skin);
  if (len <= 0) return [];
  const gaps = openings
    .filter((o) => !o.flat)
    .map((o) => {
      const t = paramAlong(skin, o);
      const half = o.width / 2 / len;
      return [t - half, t + half];
    })
    .sort((a, b) => a[0] - b[0]);
  const out: Point[][] = [];
  const add = (t0: number, t1: number) => {
    if ((t1 - t0) * len < 0.5) return;
    const whole = t0 <= 0 && t1 >= 1;
    out.push(skinOutline(whole ? skin : partOf(skin, t0, t1), t0 <= 0 ? piece.start : 0, t1 >= 1 ? piece.end : 0));
  };
  let from = 0;
  for (const [a, b] of gaps) {
    if (a > from) add(from, Math.min(a, 1));
    from = Math.max(from, b);
  }
  if (from < 1) add(from, 1);
  return out;
}

/**
 * How far a wall's cladding carries on up past the wall's top, mm: over the edge of the slab lying on the
 * wall, so the slab doesn't show as a band across the facade. Nothing where the slab stands out past the
 * cladding, or for a wall with a height of its own.
 */
export function claddingOverSlabMm(wall: Wall, walls: Wall[], slabs: Slab[]): number {
  const c = wall.cladding;
  if (!c || !cladable(wall) || wall.heightMm) return 0;
  const s = sideSign(claddingSide(wall, walls));
  const p = pointAlong(wall, 0.5);
  const d = directionAlong(wall, 0.5);
  const n = { x: -d.y * s, y: d.x * s };
  const t = thicknessOf(wall) / 2;
  const at = (k: number) => ({ x: p.x + n.x * k, y: p.y + n.y * k });
  const [behind, front] = [at(-t - 2), at(t + claddingMm(c) / MM_PER_UNIT + 1)];
  let mm = 0;
  for (const slab of slabs) {
    if (slab.footing || slab.elevMm || levelOf(slab) !== levelOf(wall)) continue;
    if (!pointInPolygon(behind, slab.points) || pointInPolygon(front, slab.points)) continue;
    if (slab.holes?.some((h) => pointInPolygon(behind, h))) continue;
    mm = Math.max(mm, slab.thickness * MM_PER_UNIT);
  }
  return mm;
}
