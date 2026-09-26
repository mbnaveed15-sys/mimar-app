/**
 * Quantities measured from the drawing, per floor, in the units Pakistani estimates use: cubic feet
 * (cft), square feet (sqft), running feet (rft) and counts. Walls are measured along their centre
 * lines (the usual centre-line method), with doors and windows taken out.
 */
import { pointInPolygon, wallLength } from '../geometry';
import { polygonArea } from '../rooms';
import { DOOR_HEAD_MM, SLAB_MM, WINDOW_HEAD_MM, WINDOW_SILL_MM } from '../three/model';
import { levelOf, type Opening, type PlanDoc, type Point, type Room } from '../types';
import { thicknessOf, wallsOf } from '../walls';
import { MM_PER_UNIT } from './scale';
import { builtAreaSqFt } from './planCheck';
import { openingProfileMm } from './shapes';

const MM_PER_FT = 304.8;
/** Plan units to feet. */
const FT = MM_PER_UNIT / MM_PER_FT;
const mmFt = (mm: number) => mm / MM_PER_FT;
/** A slab assumed over a floor with none drawn: 6". */
const ESTIMATED_SLAB_FT = 0.5;

/** What a floor finish is, for its rate: taken from the room's material. */
export type FloorKind = 'tiles' | 'marble' | 'granite' | 'wood' | 'stone' | 'concrete' | 'other' | 'none';

export interface FloorQuantities {
  levelId: string;
  name: string;
  /** Walls (with the plinth under the ground floor's walls), cft. */
  brickworkCft: number;
  /** Boundary and parapet walls, cft. */
  boundaryCft: number;
  slabCft: number;
  /** No slab drawn over this floor: one estimated over its covered area (6" thick), cft. */
  slabEstimateCft: number;
  /** Covered area (to the walls' outer faces), sqft: for electrical and plumbing. */
  coveredSqft: number;
  beamCft: number;
  columnCft: number;
  /** Stairs: estimated from their footprint (a waist slab and the steps). */
  stairCft: number;
  /** Blocks and raised shapes, cft. */
  blockCft: number;
  /** Wall faces towards rooms, and faces outside (and both faces of boundary walls), sqft. */
  insideFaceSqft: number;
  outsideFaceSqft: number;
  /** Room floor areas by finish, sqft. */
  flooring: Partial<Record<FloorKind, number>>;
  doors: number;
  windows: number;
  windowSqft: number;
  /** Length of walls standing on the ground (for the foundations), rft. Ground floor only. */
  foundationRft: number;
}

export interface Quantities {
  floors: FloorQuantities[];
  total: FloorQuantities;
}

const PATTERN_KIND: Record<string, FloorKind> = {
  tiles: 'tiles',
  marble: 'marble',
  terrazzo: 'marble',
  granite: 'granite',
  wood: 'wood',
  stone: 'stone',
  pavers: 'stone',
  concrete: 'concrete',
  plain: 'other',
};

function emptyFloor(levelId: string, name: string): FloorQuantities {
  return {
    levelId,
    name,
    brickworkCft: 0,
    boundaryCft: 0,
    slabCft: 0,
    slabEstimateCft: 0,
    coveredSqft: 0,
    beamCft: 0,
    columnCft: 0,
    stairCft: 0,
    blockCft: 0,
    insideFaceSqft: 0,
    outsideFaceSqft: 0,
    flooring: {},
    doors: 0,
    windows: 0,
    windowSqft: 0,
    foundationRft: 0,
  };
}

/** An outline's area in square feet, less its holes. */
const areaSqft = (points: Point[], holes: Point[][] = []) =>
  Math.max(0, polygonArea(points) - holes.reduce((s, h) => s + polygonArea(h), 0)) * FT * FT;

/** The face of an opening in the wall, sqft (a door or gate up to its head, a window its own size or shape). */
function openingSqft(o: Opening, wallHeightFt: number): number {
  if (o.type === 'door') {
    const h = o.gate ? wallHeightFt : Math.min(mmFt(DOOR_HEAD_MM), wallHeightFt);
    return o.width * FT * h;
  }
  if (o.shape) return polygonArea(openingProfileMm(o)) / (MM_PER_FT * MM_PER_FT);
  const h = mmFt(o.heightMm ?? WINDOW_HEAD_MM - WINDOW_SILL_MM);
  return o.width * FT * Math.min(h, wallHeightFt);
}

/** Measure the building: each floor, then the whole. */
export function quantities(doc: PlanDoc, wallHeightMm: number): Quantities {
  const levels = doc.levels.length ? doc.levels : [{ id: 'ground', name: 'Ground floor' }];
  const materialOf = new Map(doc.materials.map((m) => [m.id, m]));
  const floorKind = (room: Room): FloorKind => {
    const mat = room.material ? materialOf.get(room.material) : undefined;
    if (!mat) return 'none';
    return PATTERN_KIND[mat.pattern ?? 'plain'] ?? 'other';
  };
  const floors = levels.map((level, i) => {
    const q = emptyFloor(level.id, level.name);
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const rooms = doc.rooms.filter((r) => levelOf(r) === level.id);
    const walls = wallsOf(els);
    const openings = els.filter((el): el is Opening => el.type === 'door' || el.type === 'window');
    const inRoom = (p: Point) => rooms.some((r) => pointInPolygon(p, r.points));

    for (const wall of walls) {
      const L = wallLength(wall) * FT;
      if (!L) continue;
      const t = thicknessOf(wall) * FT;
      const H = mmFt(wall.heightMm ?? wallHeightMm);
      const own = openings.filter((o) => o.wallId === wall.id);
      const holes = own.filter((o) => !o.flat).reduce((s, o) => s + openingSqft(o, H), 0);
      // Niches take brickwork out; projections add it.
      const shaped = own
        .filter((o) => o.flat && o.depthMm)
        .reduce((s, o) => s + (polygonArea(openingProfileMm(o)) / MM_PER_FT ** 2) * mmFt(o.depthMm!), 0);
      const plinth = i === 0 && !wall.kind && !wall.elevMm ? mmFt(doc.plinthMm) : 0;
      const volume = Math.max(0, L * t * (H + plinth) - holes * t + shaped);
      if (wall.kind) q.boundaryCft += volume;
      else q.brickworkCft += volume;
      if (i === 0 && !wall.elevMm) q.foundationRft += L;

      // Each face: towards a room is inside; otherwise (and boundary walls) outside.
      const face = Math.max(0, L * H - holes);
      for (const sign of [1, -1]) {
        const off = (thicknessOf(wall) / 2 + 5) * sign;
        const len = wallLength(wall);
        const mid = {
          x: (wall.x1 + wall.x2) / 2 + (-(wall.y2 - wall.y1) / len) * off,
          y: (wall.y1 + wall.y2) / 2 + ((wall.x2 - wall.x1) / len) * off,
        };
        if (!wall.kind && inRoom(mid)) q.insideFaceSqft += face;
        else q.outsideFaceSqft += face;
      }
    }

    for (const o of openings) {
      if (o.flat) continue;
      const host = walls.find((w) => w.id === o.wallId);
      if (o.type === 'door') q.doors += 1;
      else {
        q.windows += 1;
        q.windowSqft += openingSqft(o, mmFt(host?.heightMm ?? wallHeightMm));
      }
    }

    for (const el of els) {
      switch (el.type) {
        case 'slab':
          q.slabCft += areaSqft(el.points, el.holes) * el.thickness * FT;
          break;
        case 'beam':
          q.beamCft += Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * FT * el.width * FT * el.depth * FT;
          break;
        case 'column': {
          const plan = el.shape === 'round' ? Math.PI * ((el.w / 2) * FT) ** 2 : el.w * FT * el.h * FT;
          q.columnCft += plan * mmFt(el.heightMm ?? wallHeightMm + SLAB_MM);
          break;
        }
        case 'stair':
          // A 6" waist slab along the slope plus the steps' own triangles, over the footprint.
          q.stairCft += el.w * FT * el.h * FT * (0.5 * 1.15 + mmFt(el.riserMm || 150) / 2);
          break;
        case 'block':
          if (el.heightMm > 0) q.blockCft += areaSqft(el.points) * mmFt(el.heightMm);
          break;
      }
    }

    q.coveredSqft = builtAreaSqFt(doc, level.id);
    if (!els.some((el) => el.type === 'slab')) q.slabEstimateCft = q.coveredSqft * ESTIMATED_SLAB_FT;
    for (const r of rooms) {
      const kind = floorKind(r);
      q.flooring[kind] = (q.flooring[kind] ?? 0) + areaSqft(r.points);
    }
    return q;
  });
  return { floors, total: sumFloors(floors) };
}

/** Add floors together. */
export function sumFloors(floors: FloorQuantities[]): FloorQuantities {
  const total = emptyFloor('all', 'All floors');
  for (const f of floors) {
    for (const key of Object.keys(total) as (keyof FloorQuantities)[]) {
      const v = f[key];
      if (typeof v === 'number') (total[key] as number) += v;
    }
    for (const [k, v] of Object.entries(f.flooring) as [FloorKind, number][])
      total.flooring[k] = (total.flooring[k] ?? 0) + v;
  }
  return total;
}
