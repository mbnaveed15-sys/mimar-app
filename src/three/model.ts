import { wallLength, wallParam } from '../geometry';
import { MM_PER_UNIT } from '../lib/scale';
import type { Furniture, Opening, PlanDoc, Point, Wall } from '../types';
import { thicknessOf, wallExtensions, wallsOf } from '../walls';

/** Scene units are metres; plan units are 10 mm. */
export const M_PER_UNIT = MM_PER_UNIT / 1000;

export const DOOR_HEAD_MM = 2134; // 7 ft
export const WINDOW_SILL_MM = 914; // 3 ft
export const WINDOW_HEAD_MM = 2134; // 7 ft
export const DEFAULT_WALL_HEIGHT_MM = 3048; // 10 ft

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
  role: 'wall' | 'glass' | 'door' | 'furniture';
}

/** A flat floor area at ground level, as [x, z] points in metres. */
export interface Floor {
  points: [number, number][];
  color: string;
}

export interface Model3D {
  solids: Solid[];
  floors: Floor[];
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
    if (top > head) solids.push(piece(s0, s1, head, top));
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

/** An open door leaf, standing where the 2D swing line is drawn. */
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

/** Everything needed to draw the plan in 3D, in metres. */
export function buildModel(doc: PlanDoc, options: ModelOptions): Model3D {
  const colorOf = (id?: string) => doc.materials.find((mat) => mat.id === id)?.color;
  const walls = wallsOf(doc.elements);
  const openings = doc.elements.filter((el): el is Opening => el.type === 'door' || el.type === 'window');
  const solids: Solid[] = [];

  for (const wall of walls) {
    const own = openings.filter((o) => o.wallId === wall.id);
    const color = colorOf(wall.material);
    solids.push(
      ...wallSolids(wall, walls, own, options.wallHeightMm).map((s) =>
        color && s.role === 'wall' ? { ...s, color } : s,
      ),
    );
  }
  for (const door of openings) {
    if (door.type === 'door' && walls.some((w) => w.id === door.wallId))
      solids.push(doorLeaf(door, options.wallHeightMm));
  }
  if (options.showFurniture) {
    for (const el of doc.elements) {
      if (el.type === 'furniture') solids.push(...furnitureSolids(el, colorOf(el.material)));
    }
  }

  const floors: Floor[] = doc.rooms.map((r) => ({
    points: r.points.map((p) => [m(p.x), m(p.y)] as [number, number]),
    color: colorOf(r.material) ?? DEFAULT_FLOOR,
  }));

  const xs = [...solids.map((s) => s.x), ...floors.flatMap((f) => f.points.map((p) => p[0]))];
  const zs = [...solids.map((s) => s.z), ...floors.flatMap((f) => f.points.map((p) => p[1]))];
  const centre = xs.length
    ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 }
    : { x: 8, z: 5 };
  const size = xs.length ? Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4) : 16;
  return { solids, floors, centre, size };
}
