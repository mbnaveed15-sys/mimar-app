import { wallLength, wallParam } from '../geometry';
import { MM_PER_UNIT } from '../lib/scale';
import { stairLayout } from '../lib/site';
import {
  levelOf,
  type Beam,
  type Column,
  type Furniture,
  type Opening,
  type PlanDoc,
  type Point,
  type Stair,
  type Wall,
} from '../types';
import { thicknessOf, wallExtensions, wallsOf } from '../walls';

/** Scene units are metres; plan units are 10 mm. */
export const M_PER_UNIT = MM_PER_UNIT / 1000;

export const DOOR_HEAD_MM = 2134; // 7 ft
export const WINDOW_SILL_MM = 914; // 3 ft
export const WINDOW_HEAD_MM = 2134; // 7 ft
export const DEFAULT_WALL_HEIGHT_MM = 3048; // 10 ft
/** Floor slab between storeys: 6". */
export const SLAB_MM = 152.4;

/**
 * A box in the scene. x/z are the centre on the ground (metres, z = plan y), y0 is the height of
 * its base, w runs along its own x axis, d along its own z axis, rotY turns it about the vertical.
 */
export interface Solid {
  x: number;
  z: number;
  y0: number;
  w: number;
  d: number;
  h: number;
  rotY: number;
  color: string;
  opacity?: number;
  /** What it is, for tests and for picking materials. */
  role: 'wall' | 'glass' | 'door' | 'furniture' | 'column' | 'beam' | 'stair';
}

/** A flat floor area at height y, as [x, z] points in metres. */
export interface Floor {
  points: [number, number][];
  y: number;
  color: string;
}

/** A slab: an outline extruded upward from y0 by h, in metres. */
export interface Slab3D {
  points: [number, number][];
  y0: number;
  h: number;
  color: string;
}

export interface Model3D {
  solids: Solid[];
  floors: Floor[];
  slabs: Slab3D[];
  /** Centre and size of the building, for positioning the camera. */
  centre: { x: number; z: number };
  size: number;
}

export interface ModelOptions {
  wallHeightMm: number;
  showFurniture: boolean;
}

const WALL_COLOR = '#eceae4';
const GLASS_COLOR = '#9fd3f0';
const DOOR_COLOR = '#8b5e3c';
const DEFAULT_FLOOR = '#f1f5f9';
const CONCRETE = '#c9c6bf';
const LAWN = '#a7c48a';

const m = (units: number) => units * M_PER_UNIT;
const mmToM = (mm: number) => mm / 1000;

/** Plan point `local` (in the frame of an item at `origin` turned by `angleDeg`) in scene metres. */
function toScene(origin: Point, angleDeg: number, local: Point): { x: number; z: number } {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: m(origin.x + local.x * Math.cos(a) - local.y * Math.sin(a)),
    z: m(origin.y + local.x * Math.sin(a) + local.y * Math.cos(a)),
  };
}

function wallSolids(wall: Wall, walls: Wall[], openings: Opening[], heightMm: number): Solid[] {
  const len = wallLength(wall);
  if (len === 0) return [];
  const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
  const origin = { x: wall.x1, y: wall.y1 };
  const thickness = m(thicknessOf(wall));
  const top = mmToM(heightMm);
  const { start, end } = wallExtensions(wall, walls);

  /** A piece of wall from s0 to s1 along it (plan units), between two heights (metres). */
  const piece = (s0: number, s1: number, y0: number, y1: number, role: Solid['role'] = 'wall', depth = thickness) => {
    const c = toScene(origin, angle, { x: (s0 + s1) / 2, y: 0 });
    return { ...c, y0, h: y1 - y0, w: m(s1 - s0), d: depth, rotY: (-angle * Math.PI) / 180, color: WALL_COLOR, role };
  };

  const gaps = openings
    .map((o) => {
      const mid = wallParam(wall, o) * len;
      return { o, s0: Math.max(0, mid - o.width / 2), s1: Math.min(len, mid + o.width / 2) };
    })
    .sort((a, b) => a.s0 - b.s0);

  const solids: Solid[] = [];
  let cursor = -start;
  for (const { o, s0, s1 } of gaps) {
    if (s0 > cursor) solids.push(piece(cursor, s0, 0, top));
    const head = Math.min(top, mmToM(o.type === 'door' ? DOOR_HEAD_MM : WINDOW_HEAD_MM));
    // A gate is open to the sky: no lintel over it.
    if (top > head && !o.gate) solids.push(piece(s0, s1, head, top));
    if (o.type === 'window') {
      const sill = Math.min(head, mmToM(WINDOW_SILL_MM));
      solids.push(piece(s0, s1, 0, sill));
      solids.push({ ...piece(s0, s1, sill, head, 'glass', 0.012), color: GLASS_COLOR, opacity: 0.35 });
    }
    cursor = Math.max(cursor, s1);
  }
  if (len + end > cursor) solids.push(piece(cursor, len + end, 0, top));
  return solids;
}

/** An open door leaf (or a gate's two leaves), standing where the 2D swing lines are drawn. */
function doorLeaves(door: Opening, heightMm: number): Solid[] {
  const sy = door.flipSide ? -1 : 1;
  if (door.gate) {
    const half = door.width / 2;
    return [-1, 1].map((side) => ({
      ...toScene(door, door.angle, { x: (side * door.width) / 2, y: (-half / 2) * sy }),
      y0: 0,
      h: Math.min(mmToM(DOOR_HEAD_MM), mmToM(heightMm)) - 0.01,
      w: 0.05,
      d: m(half),
      rotY: (-door.angle * Math.PI) / 180,
      color: DOOR_COLOR,
      role: 'door' as const,
    }));
  }
  return [doorLeaf(door, heightMm)];
}

function doorLeaf(door: Opening, heightMm: number): Solid {
  const hx = door.flipHinge ? -1 : 1;
  const sy = door.flipSide ? -1 : 1;
  const c = toScene(door, door.angle, { x: (-door.width / 2) * hx, y: (-door.width / 2) * sy });
  return {
    ...c,
    y0: 0,
    h: Math.min(mmToM(DOOR_HEAD_MM), mmToM(heightMm)) - 0.01,
    w: 0.04,
    d: m(door.width),
    rotY: (-door.angle * Math.PI) / 180,
    color: DOOR_COLOR,
    role: 'door',
  };
}

const FABRIC = '#b9a38a';
const WOOD = '#9b7653';
const WHITE = '#f8fafc';
const COUNTER = '#d6d3d1';

/** Simple 3D shapes for each furniture item, from boxes placed by fractions of its footprint. */
function furnitureSolids(f: Furniture, color?: string): Solid[] {
  const parts: Solid[] = [];
  /** Box covering a share of the footprint (0,0 = back left), from height y0 for h metres. */
  const part = (fx: number, fy: number, fw: number, fd: number, y0: number, h: number, c: string, keep = false) => {
    const centre = toScene(f, f.rotation ?? 0, {
      x: -f.w / 2 + (fx + fw / 2) * f.w,
      y: -f.h / 2 + (fy + fd / 2) * f.h,
    });
    parts.push({
      ...centre,
      y0,
      h,
      w: m(fw * f.w),
      d: m(fd * f.h),
      rotY: (-(f.rotation ?? 0) * Math.PI) / 180,
      color: keep ? c : (color ?? c),
      role: 'furniture',
    });
  };
  // Parts passed `keep` (screens, hobs, sinks) keep their own colour when the item is painted.

  switch (f.kind) {
    case 'bed-single':
    case 'bed-double':
    case 'bed-king':
      part(0, 0.03, 1, 0.97, 0, 0.45, FABRIC);
      part(0, 0, 1, 0.04, 0, 1.0, WOOD);
      if (f.kind === 'bed-single') part(0.15, 0.05, 0.7, 0.12, 0.45, 0.1, WHITE);
      else [0.06, 0.54].forEach((fx) => part(fx, 0.05, 0.4, 0.12, 0.45, 0.1, WHITE));
      break;
    case 'wardrobe':
      part(0, 0, 1, 1, 0, 2.1, WOOD);
      break;
    case 'side-table':
      part(0, 0, 1, 1, 0, 0.55, WOOD);
      break;
    case 'sofa-3':
    case 'sofa-2':
    case 'armchair': {
      const arm = f.kind === 'armchair' ? 0.18 : 0.1;
      part(arm, 0.25, 1 - 2 * arm, 0.75, 0, 0.45, FABRIC);
      part(0, 0, 1, 0.25, 0, 0.85, FABRIC);
      part(0, 0.25, arm, 0.75, 0, 0.62, FABRIC);
      part(1 - arm, 0.25, arm, 0.75, 0, 0.62, FABRIC);
      break;
    }
    case 'coffee-table':
      part(0, 0, 1, 1, 0, 0.42, WOOD);
      break;
    case 'tv-unit':
      part(0, 0, 1, 1, 0, 0.5, WOOD);
      part(0.2, 0.3, 0.6, 0.1, 0.5, 0.62, '#111827', true);
      break;
    case 'dining-4':
    case 'dining-6':
    case 'dining-8': {
      const perSide = f.kind === 'dining-4' ? 2 : 3;
      const ends = f.kind === 'dining-8';
      const chairD = 0.27;
      const endW = ends ? 450 / 2700 : 0;
      const tableW = 1 - 2 * endW;
      part(endW, chairD, tableW, 1 - 2 * chairD, 0, 0.75, WOOD);
      const cw = (tableW / perSide) * 0.62;
      for (let i = 0; i < perSide; i++) {
        const cx = endW + (tableW / perSide) * (i + 0.5) - cw / 2;
        part(cx, 0.02, cw, chairD * 0.85, 0, 0.45, FABRIC);
        part(cx, 1 - 0.02 - chairD * 0.85, cw, chairD * 0.85, 0, 0.45, FABRIC);
      }
      if (ends) {
        part(0.01, 0.37, endW * 0.85, 0.26, 0, 0.45, FABRIC);
        part(1 - 0.01 - endW * 0.85, 0.37, endW * 0.85, 0.26, 0, 0.45, FABRIC);
      }
      break;
    }
    case 'counter':
    case 'sink':
    case 'stove':
      part(0, 0, 1, 1, 0, 0.9, COUNTER);
      if (f.kind === 'stove') part(0.05, 0.05, 0.9, 0.9, 0.9, 0.02, '#1f2937', true);
      if (f.kind === 'sink') part(0.15, 0.15, 0.7, 0.62, 0.9, 0.01, '#94a3b8', true);
      break;
    case 'fridge':
      part(0, 0, 1, 1, 0, 1.8, '#e5e7eb');
      break;
    case 'wc':
      part(0.05, 0, 0.9, 0.25, 0, 0.75, WHITE);
      part(0.1, 0.25, 0.8, 0.7, 0, 0.4, WHITE);
      break;
    case 'wc-indian':
      part(0, 0, 1, 1, 0, 0.06, WHITE);
      break;
    case 'basin':
      part(0.35, 0.2, 0.3, 0.4, 0, 0.7, WHITE);
      part(0, 0, 1, 1, 0.7, 0.15, WHITE);
      break;
    case 'shower':
      part(0, 0, 1, 1, 0, 0.05, WHITE);
      break;
    case 'bathtub':
      part(0, 0, 1, 1, 0, 0.55, WHITE);
      break;
    case 'stairs': {
      const steps = Math.max(3, Math.round(f.h / (f.w * 0.28)));
      const rise = Math.min(0.18, 3 / steps);
      // The arrow in 2D points up the stairs towards the back (top), so steps rise towards it.
      for (let i = 0; i < steps; i++) part(0, 1 - (i + 1) / steps, 1, 1 / steps, 0, (i + 1) * rise, color ?? COUNTER);
      break;
    }
    case 'car':
      part(0, 0, 1, 1, 0.2, 0.6, '#1e3a8a');
      part(0.1, 0.28, 0.8, 0.42, 0.8, 0.5, '#1e3a8a');
      break;
    default:
      part(0, 0, 1, 1, 0, 0.75, '#cbd5e1');
  }
  return parts;
}

const RAMP_SLICES = 12;

/** A stair's treads and landings as solid blocks from the floor up; a ramp as a run of thin slices. */
function stairSolids(st: Stair, color?: string): Solid[] {
  const layout = stairLayout(st);
  const solids: Solid[] = [];
  const block = (x: number, y: number, w: number, h: number, topMm: number) =>
    solids.push({
      ...toScene(st, st.rotation ?? 0, { x: x + w / 2, y: y + h / 2 }),
      y0: 0,
      h: Math.max(0.01, mmToM(topMm)),
      w: m(w),
      d: m(h),
      rotY: (-(st.rotation ?? 0) * Math.PI) / 180,
      color: color ?? CONCRETE,
      role: 'stair',
    });
  for (const part of layout.parts) {
    if (part.kind !== 'ramp') {
      block(part.x, part.y, part.w, part.h, part.topMm);
      continue;
    }
    // The ramp rises from its bottom edge (+y) to its top edge (-y).
    const slice = part.h / RAMP_SLICES;
    for (let i = 0; i < RAMP_SLICES; i++)
      block(part.x, part.y + part.h - (i + 1) * slice, part.w, slice, (part.topMm * (i + 1)) / RAMP_SLICES);
  }
  return solids;
}

function columnSolid(c: Column, top: number, color?: string): Solid {
  return {
    ...toScene(c, 0, { x: 0, y: 0 }),
    y0: 0,
    h: top,
    w: m(c.w),
    d: m(c.h),
    rotY: (-(c.rotation ?? 0) * Math.PI) / 180,
    color: color ?? CONCRETE,
    role: 'column',
  };
}

function beamSolid(b: Beam, top: number, color?: string): Solid | null {
  const len = Math.hypot(b.x2 - b.x1, b.y2 - b.y1);
  if (!len) return null;
  const angle = (Math.atan2(b.y2 - b.y1, b.x2 - b.x1) * 180) / Math.PI;
  const depth = Math.min(m(b.depth), top);
  return {
    ...toScene({ x: b.x1, y: b.y1 }, angle, { x: len / 2, y: 0 }),
    y0: top - depth,
    h: depth,
    w: m(len),
    d: m(b.width),
    rotY: (-angle * Math.PI) / 180,
    color: color ?? CONCRETE,
    role: 'beam',
  };
}

/**
 * Everything needed to draw the plan in 3D, in metres. Floors stack upward from the plinth: each
 * storey is the wall height plus a slab. Ground-floor walls also run down through the plinth.
 */
export function buildModel(doc: PlanDoc, options: ModelOptions): Model3D {
  const colorOf = (id?: string) => doc.materials.find((mat) => mat.id === id)?.color;
  const solids: Solid[] = [];
  const floors: Floor[] = [];
  const slabs: Slab3D[] = [];
  const plinth = mmToM(doc.plinthMm);
  const wallTop = mmToM(options.wallHeightMm);
  const storey = mmToM(options.wallHeightMm + SLAB_MM);
  const levels = doc.levels.length ? doc.levels : [{ id: 'ground', name: 'Ground floor' }];

  levels.forEach((level, i) => {
    const base = plinth + i * storey;
    const lift = (s: Solid): Solid => ({ ...s, y0: s.y0 + base });
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const walls = wallsOf(els);
    const openings = els.filter((el): el is Opening => el.type === 'door' || el.type === 'window');

    for (const wall of walls) {
      const own = openings.filter((o) => o.wallId === wall.id);
      const color = colorOf(wall.material);
      const paint = (s: Solid) => (color && s.role === 'wall' ? { ...s, color } : s);
      const height = wall.heightMm ?? options.wallHeightMm;
      // A boundary wall stands on the natural ground, not on the plinth.
      if (wall.kind === 'boundary' && i === 0) {
        solids.push(...wallSolids(wall, walls, own, height).map(paint));
        continue;
      }
      solids.push(...wallSolids(wall, walls, own, height).map(paint).map(lift));
      if (wall.kind) continue;
      // The plinth: ground-floor walls carry on down to the ground.
      if (i === 0 && plinth > 0) solids.push(...wallSolids(wall, walls, [], doc.plinthMm).map(paint));
    }
    for (const door of openings) {
      const host = walls.find((w) => w.id === door.wallId);
      if (door.type !== 'door' || !host) continue;
      const leaves = doorLeaves(door, host.heightMm ?? options.wallHeightMm);
      solids.push(...(host.kind === 'boundary' && i === 0 ? leaves : leaves.map(lift)));
    }
    for (const el of els) {
      if (el.type === 'furniture' && options.showFurniture)
        solids.push(...furnitureSolids(el, colorOf(el.material)).map(lift));
      if (el.type === 'column') solids.push(lift(columnSolid(el, wallTop, colorOf(el.material))));
      if (el.type === 'beam') {
        const b = beamSolid(el, wallTop, colorOf(el.material));
        if (b) solids.push(lift(b));
      }
      if (el.type === 'stair') {
        // Steps up the plinth start from the natural ground; others from the floor they are on.
        const fromGround = i === 0 && Math.abs(el.riseMm - doc.plinthMm) < 1;
        const parts = stairSolids(el, colorOf(el.material));
        solids.push(...(fromGround ? parts : parts.map(lift)));
      }
      if (el.type === 'plot' && i === 0)
        floors.push({
          points: el.points.map((p) => [m(p.x), m(p.y)] as [number, number]),
          y: 0,
          color: colorOf(el.material) ?? LAWN,
        });
      if (el.type === 'slab')
        slabs.push({
          points: el.points.map((p) => [m(p.x), m(p.y)] as [number, number]),
          y0: base + wallTop,
          h: m(el.thickness),
          color: colorOf(el.material) ?? CONCRETE,
        });
    }
    for (const r of doc.rooms.filter((room) => levelOf(room) === level.id)) {
      floors.push({
        points: r.points.map((p) => [m(p.x), m(p.y)] as [number, number]),
        y: base,
        color: colorOf(r.material) ?? DEFAULT_FLOOR,
      });
    }
  });

  const flat = [...floors, ...slabs].flatMap((f) => f.points);
  const xs = [...solids.map((s) => s.x), ...flat.map((p) => p[0])];
  const zs = [...solids.map((s) => s.z), ...flat.map((p) => p[1])];
  const centre = xs.length
    ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    : { x: 8, z: 5 };
  const size = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4) : 16;
  return { solids, floors, slabs, centre, size };
}
