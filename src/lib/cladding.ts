/**
 * Cladding: a skin of stone, tiles, ACP, glass and the like on a wall's face, usually its outside one. It
 * covers the wall (and the frame in it) in 3D and the elevations, shows as a band on the plan, counts as the
 * building in the setbacks check, and is measured by kind for the cost. Pure.
 */
import { pointInPolygon } from '../geometry';
import { directionAlong, offsetWall, pointAlong } from './arc';
import { MM_PER_UNIT } from './scale';
import type { Hatch } from './hatch';
import { wallFaces } from '../rooms';
import { isBuildingWall, thicknessOf } from '../walls';
import { levelOf, type Cladding, type CladdingKind, type Id, type Pattern, type Point, type Wall } from '../types';

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

/**
 * The wall's outside face, away from the building: 'A' (its left normal) or 'B'; null for a wall with the
 * building on both sides (inside the house).
 */
export function outsideSide(wall: Wall, walls: Wall[]): 'A' | 'B' | null {
  const loops = wallFaces(
    walls.filter((w) => isBuildingWall(w) && levelOf(w) === levelOf(wall)),
    true,
  );
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
 * How far the cladding at one end of a wall reaches past it: round an outside corner, out to the outer face
 * of the cladding (or the face) of the wall it meets; at an inside corner, back to it (a negative reach);
 * nothing at a free end or a straight joint.
 */
function cornerReach(w: Wall, s: number, t: number, ct: number, atEnd: boolean, walls: Wall[]): number {
  const p = atEnd ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 };
  const dirHere = directionAlong(w, atEnd ? 1 : 0);
  // Pointing out of the wall at this end, and across to the cladding.
  const out = atEnd ? dirHere : { x: -dirHere.x, y: -dirHere.y };
  const n = { x: -dirHere.y * s, y: dirHere.x * s };
  const other = walls.find(
    (o) =>
      o.id !== w.id &&
      levelOf(o) === levelOf(w) &&
      isBuildingWall(o) &&
      [
        { x: o.x1, y: o.y1 },
        { x: o.x2, y: o.y2 },
      ].some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 2),
  );
  if (!other) return 0;
  const side = (other.cladding && cladable(other) ? other.cladding.side : undefined) ?? outsideSide(other, walls);
  if (!side) return 0;
  const oAtEnd = Math.hypot(other.x2 - p.x, other.y2 - p.y) < 2;
  const od = directionAlong(other, oAtEnd ? 1 : 0);
  const so = sideSign(side);
  // The other wall's outside normal, and how far out its outside surface is.
  const no = { x: -od.y * so, y: od.x * so };
  const across = out.x * no.x + out.y * no.y;
  // A straight joint (the walls run on along one line): no corner.
  if (Math.abs(across) < 0.05) return 0;
  const oClad = other.cladding && cladable(other) ? claddingMm(other.cladding) / MM_PER_UNIT : 0;
  // Round an outside corner where both are clad, one reaches over the other's cladding and the other stops
  // at the wall's face, so the two never overlap.
  const over = across < 0 || !oClad || w.id < other.id;
  const reach = thicknessOf(other) / 2 + (over ? oClad : 0);
  const nn = n.x * no.x + n.y * no.y;
  // Where each face of this cladding meets that surface, along this wall from its end.
  const at = (y: number) => (reach - y * nn) / across;
  const [inner, outer] = [at(t / 2), at(t / 2 + ct)];
  // Round an outside corner the cladding reaches out to the far one; at an inside corner it stops at the first.
  const r = across > 0 ? Math.max(inner, outer) : Math.min(inner, outer);
  const limit = 3 * (thicknessOf(other) + t + ct);
  return Math.max(-limit, Math.min(limit, r));
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
