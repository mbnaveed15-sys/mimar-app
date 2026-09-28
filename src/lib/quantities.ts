/**
 * Quantities measured from the drawing, per floor, in the units Pakistani estimates use: cubic feet
 * (cft), square feet (sqft), running feet (rft) and counts. Walls are measured along their centre
 * lines (the usual centre-line method), with doors and windows taken out.
 */
import { pointInPolygon, wallLength } from '../geometry';
import { directionAlong, pointAlong } from './arc';
import { openRooms, within } from './voids';
import { isCurtain } from './curtain';
import { gableArea, GABLE_WALL_MM, slopedArea } from './roof/roof';
import { polygonArea } from '../rooms';
import { outsideOutline } from './outline';
import { DOOR_HEAD_MM, WINDOW_HEAD_MM, WINDOW_SILL_MM } from '../three/model';
import { GROUND_LEVEL, levelOf, type Opening, type PlanDoc, type Point, type Room } from '../types';
import { levelWallMm, slabMm } from './levels';
import { thicknessOf, wallsOf } from '../walls';
import { MM_PER_UNIT } from './scale';
import { builtAreaSqFt } from './planCheck';
import { boxOf, cellFor, GridIndex } from './spatial';
import { openingProfileMm } from './shapes';
import { groundOf } from './terrain/ground';
import { siteEarthworks } from './terrain/groundView';

/** Cubic feet in a cubic metre. */
const CFT_PER_M3 = 35.3147;

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
  /** A basement's RCC retaining walls, cft. */
  retainingCft: number;
  /** Digging out the basement: its outline × its depth below the ground and its floor slab, cft. */
  excavationCft: number;
  /** The basement's RCC floor (raft), 12" over its outline, cft (estimated). */
  raftCft: number;
  /** Waterproofing: the retaining walls' outer faces and the basement floor, sqft. */
  waterproofSqft: number;
  /** Levelling the site (ground floor): earth dug out above the finished ground, and filled in below it, cft. */
  cutCft: number;
  fillCft: number;
  /** Glass curtain walls: their face less any doors in them, sqft. */
  glazingSqft: number;
  /** Pitched roofs: the sloping area of their covering, sqft. */
  roofSqft: number;
}

/** A basement floor (raft) assumed 12" thick. */
export const RAFT_FT = 1;

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
    retainingCft: 0,
    excavationCft: 0,
    raftCft: 0,
    waterproofSqft: 0,
    cutCft: 0,
    fillCft: 0,
    glazingSqft: 0,
    roofSqft: 0,
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
  const site = groundOf(doc);
  const floors = levels.map((level) => {
    const ground = level.id === GROUND_LEVEL;
    const levelMm = levelWallMm(doc, level.id, wallHeightMm);
    const q = emptyFloor(level.id, level.name);
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const rooms = doc.rooms.filter((r) => levelOf(r) === level.id);
    const walls = wallsOf(els);
    const openings = els.filter((el): el is Opening => el.type === 'door' || el.type === 'window');
    // Rooms and doors looked up by place and by wall, so big plans measure quickly.
    const roomIndex = new GridIndex<Room>(cellFor(rooms.map((r) => boxOf(r.points))));
    for (const r of rooms) roomIndex.add(r, boxOf(r.points));
    const inRoom = (p: Point) => roomIndex.at(p).some((r) => pointInPolygon(p, r.points));
    const onWall = new Map<string, Opening[]>();
    for (const o of openings) onWall.set(o.wallId, [...(onWall.get(o.wallId) ?? []), o]);
    const wallById = new Map(walls.map((w) => [w.id, w]));
    // Double-height rooms: no slab over them, and the walls beside them rise through the slab's depth.
    const open = openRooms(doc, level.id);
    const openSqft = open.reduce((s, r) => s + areaSqft(r.points), 0);
    const slabFt = mmFt(slabMm(doc));

    for (const wall of walls) {
      const L = wallLength(wall) * FT;
      if (!L) continue;
      const t = thicknessOf(wall) * FT;
      const H = mmFt(wall.heightMm ?? levelMm);
      const own = onWall.get(wall.id) ?? [];
      const holes = own.filter((o) => !o.flat).reduce((s, o) => s + openingSqft(o, H), 0);
      // Niches take brickwork out; projections add it.
      const shaped = own
        .filter((o) => o.flat && o.depthMm)
        .reduce((s, o) => s + (polygonArea(openingProfileMm(o)) / MM_PER_FT ** 2) * mmFt(o.depthMm!), 0);
      // The plinth rises from the finished ground under the wall (±0 on flat ground).
      const centre = pointAlong(wall, 0.5);
      const under = ground ? site.finishedAt(centre.x, centre.y) : 0;
      const plinth = ground && !wall.kind && !wall.elevMm ? Math.max(0, mmFt(doc.plinthMm - under)) : 0;
      // A glass curtain wall is glazing, standing on a brick plinth like the other walls.
      if (isCurtain(wall)) {
        const doorsSqft = own.filter((o) => o.type === 'door' && !o.flat).reduce((s, o) => s + openingSqft(o, H), 0);
        q.glazingSqft += Math.max(0, L * H - doorsSqft);
        q.brickworkCft += L * t * plinth;
        if (ground && !wall.elevMm) q.foundationRft += L;
        continue;
      }
      // Beside a double-height room it carries on up through where the slab would be.
      const u0 = directionAlong(wall, 0.5);
      const probe = (sign: number) => ({
        x: centre.x - u0.y * (thicknessOf(wall) / 2 + 5) * sign,
        y: centre.y + u0.x * (thicknessOf(wall) / 2 + 5) * sign,
      });
      const byVoid = open.some((r) => pointInPolygon(probe(1), r.points) || pointInPolygon(probe(-1), r.points));
      const up = byVoid && !wall.kind ? slabFt : 0;
      const volume = Math.max(0, L * t * (H + plinth + up) - holes * t + shaped);
      if (wall.kind === 'retaining') q.retainingCft += volume;
      else if (wall.kind) q.boundaryCft += volume;
      else q.brickworkCft += volume;
      if (ground && !wall.elevMm) q.foundationRft += L;

      // Each face: towards a room is inside; otherwise (and boundary walls) outside.
      const face = Math.max(0, L * H - holes);
      for (const sign of [1, -1]) {
        const off = (thicknessOf(wall) / 2 + 5) * sign;
        const u = directionAlong(wall, 0.5);
        const mid = { x: centre.x - u.y * off, y: centre.y + u.x * off };
        const room = (!wall.kind || wall.kind === 'retaining') && inRoom(mid);
        if (room) q.insideFaceSqft += face;
        // A retaining wall's earth side is waterproofed, not plastered.
        else if (wall.kind === 'retaining') q.waterproofSqft += face;
        else q.outsideFaceSqft += face;
      }
    }

    for (const o of openings) {
      if (o.flat) continue;
      const host = wallById.get(o.wallId);
      if (o.type === 'door') q.doors += 1;
      else {
        q.windows += 1;
        q.windowSqft += openingSqft(o, mmFt(host?.heightMm ?? wallHeightMm));
      }
    }

    for (const el of els) {
      switch (el.type) {
        case 'slab': {
          // Less the double-height rooms under it.
          const voids = open.map((r) => r.points).filter((v) => within(v, el.points));
          q.slabCft += areaSqft(el.points, [...(el.holes ?? []), ...voids]) * el.thickness * FT;
          break;
        }
        case 'beam':
          q.beamCft += Math.hypot(el.x2 - el.x1, el.y2 - el.y1) * FT * el.width * FT * el.depth * FT;
          break;
        case 'column': {
          const plan = el.shape === 'round' ? Math.PI * ((el.w / 2) * FT) ** 2 : el.w * FT * el.h * FT;
          q.columnCft += plan * mmFt(el.heightMm ?? levelMm + slabMm(doc));
          break;
        }
        case 'stair':
          // A 6" waist slab along the slope plus the steps' own triangles, over the footprint.
          q.stairCft += el.w * FT * el.h * FT * (0.5 * 1.15 + mmFt(el.riserMm || 150) / 2);
          break;
        case 'block':
          if (el.heightMm > 0) q.blockCft += areaSqft(el.points) * mmFt(el.heightMm);
          break;
        case 'roof': {
          // A flat roof is a slab; a pitched one a sloping slab, covered along its slopes.
          const sqft = el.shape === 'flat' ? areaSqft(el.points) : slopedArea(el) * FT * FT;
          q.slabCft += sqft * mmFt(el.thicknessMm);
          if (el.shape !== 'flat') q.roofSqft += sqft;
          // The gable walls up to it, plastered both sides.
          const gable = gableArea(el) * FT * FT;
          q.brickworkCft += gable * mmFt(GABLE_WALL_MM);
          q.insideFaceSqft += gable;
          q.outsideFaceSqft += gable;
          break;
        }
      }
    }

    q.coveredSqft = builtAreaSqFt(doc, level.id);
    if (level.basement) {
      // Dug out to the outside of its walls, down to its floor and the raft under it.
      const outline = outsideOutline(walls);
      const plan = outline ? areaSqft(outline) : q.coveredSqft;
      const depthFt = Math.max(0, mmFt(levelMm + slabMm(doc) - doc.plinthMm)) + RAFT_FT;
      q.excavationCft = plan * depthFt;
      q.raftCft = plan * RAFT_FT;
      q.waterproofSqft += plan;
    }
    if (ground) {
      const earth = siteEarthworks(site);
      q.cutCft = earth.cutM3 * CFT_PER_M3;
      q.fillCft = earth.fillM3 * CFT_PER_M3;
    }
    if (!els.some((el) => el.type === 'slab' || el.type === 'roof'))
      q.slabEstimateCft = Math.max(0, q.coveredSqft - openSqft) * ESTIMATED_SLAB_FT;
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
