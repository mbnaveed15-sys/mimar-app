import { wallLength, wallParam } from '../geometry';
import { patternSpanMm } from '../lib/patterns';
import { MM_PER_UNIT } from '../lib/scale';
import { doorKindOf } from '../lib/openingKinds';
import { openingProfileMm } from '../lib/shapes';
import { buildableArea, stairLayout } from '../lib/site';
import { outlinePoints } from '../lib/plot';
import { basementOf, groundIndex, levelWallMm, slabMm } from '../lib/levels';
import { outsideOutline } from '../lib/outline';
import { openRooms, voidsOver, within } from '../lib/voids';
import {
  GROUND_LEVEL,
  levelOf,
  type Beam,
  type Column,
  type Furniture,
  type Opening,
  type Pattern,
  type PlanDoc,
  type Point,
  type Slab,
  type Stair,
  type Wall,
} from '../types';
import { isBuildingWall, thicknessOf, wallExtensions, wallsOf } from '../walls';
import { straightPieces } from '../lib/arc';
import { groundBeside, lowestAlong, lowestUnder, siteOf, stepOnGround, type TerrainMesh } from './terrain3d';

export type { TerrainKind, TerrainMesh } from './terrain3d';

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
/** A surface pattern and how far (in metres) one drawing of it spans. */
export interface Finish {
  pattern: Pattern;
  spanM: number;
  /** The material's name, when one was chosen (used to name materials in exports). */
  name?: string;
}

/** How a surface looks. */
export interface Look {
  color: string;
  finish?: Finish;
}

/** A wall piece's own looks for its two big faces: `plus` on its own +z side (a wall's side A), `minus` the other. */
export interface Sides {
  plus?: Look;
  minus?: Look;
}

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
  finish?: Finish;
  sides?: Sides;
  /** The plan item it was made from, and its floor, for picking in 3D. */
  id?: string;
  level?: string;
  /** What it is, for tests and for picking materials. */
  role: 'wall' | 'glass' | 'door' | 'furniture' | 'column' | 'beam' | 'stair';
}

/**
 * An upright flat outline pushed through a depth: the piece of wall round a shaped opening, its
 * glass, or a flat shape drawn on a wall. Placed like a box: centred at x/z, from y0, turned by
 * rotY; the outline is [along, up] in metres from that centre (along its own x axis) and base.
 */
export interface Panel {
  outline: [number, number][];
  holes?: [number, number][][];
  x: number;
  z: number;
  y0: number;
  rotY: number;
  depth: number;
  color: string;
  opacity?: number;
  finish?: Finish;
  sides?: Sides;
  id?: string;
  level?: string;
  role: 'wall' | 'glass' | 'shape';
}

/** A flat floor area at height y, as [x, z] points in metres. */
export interface Floor {
  points: [number, number][];
  y: number;
  color: string;
  finish?: Finish;
  /** Less than 1 to let the drawing grid show through (the plot's grass). */
  opacity?: number;
  /** Openings in it (the lawn over a basement). */
  holes?: [number, number][][];
  id?: string;
  level?: string;
}

/** A slab (or block): an outline, less any voids, extruded upward from y0 by h, in metres. */
export interface Slab3D {
  points: [number, number][];
  holes?: [number, number][][];
  y0: number;
  h: number;
  color: string;
  opacity?: number;
  finish?: Finish;
  id?: string;
  level?: string;
  /** A flat shape waiting for Push/Pull, which isn't built (or exported). */
  role?: 'slab' | 'block' | 'shape';
}

export interface Model3D {
  solids: Solid[];
  floors: Floor[];
  slabs: Slab3D[];
  /** Blocks, and flat shapes on floors (role 'shape'). */
  blocks: Slab3D[];
  /** Pieces of wall round shaped openings, their glass, and flat shapes on walls. */
  panels: Panel[];
  /**
   * Lines drawn on the ground (a plot's setback line), as closed outlines of [x, z] points, at
   * height y, or at each point's own height in `ys` when they follow the ground.
   */
  guides?: { points: [number, number][]; y: number; ys?: number[]; level?: string }[];
  /**
   * The ground, when it isn't flat at ±0: the plot's lawn where it follows the ground, the natural
   * ground round it, levelled areas, the banks between them, and roads. Missing on a flat site.
   */
  terrain?: TerrainMesh[];
  /** Neighbouring buildings, as blocks standing on the ground. */
  context?: Slab3D[];
  /** Where the big ground plane lies (m): just under the lowest ground; 0 when missing. */
  groundY?: number;
  /** Centre and size of the building, for positioning the camera. */
  centre: { x: number; z: number };
  size: number;
}

export interface ModelOptions {
  wallHeightMm: number;
  showFurniture: boolean;
  /** Doors shut in their openings (for sections and elevations), rather than standing open. */
  closedDoors?: boolean;
  /** Build the ground and the neighbours (on unless false; off for a preview of what is being drawn). */
  terrain?: boolean;
}

const WALL_COLOR = '#eceae4';
const GLASS_COLOR = '#9fd3f0';
const DOOR_COLOR = '#8b5e3c';
const SHUTTER_COLOR = '#8a9099';
/** Window frames and mullions (aluminium). */
const FRAME_COLOR = '#6b7078';
const M_PER_UNIT_LOCAL = MM_PER_UNIT / 1000;
const DEFAULT_FLOOR = '#f1f5f9';
const CONCRETE = '#c9c6bf';
/** Flat shapes waiting for Push/Pull. */
export const SHAPE_COLOR = '#3b82f6';
const SHAPE_OPACITY = 0.35;
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

/** Pieces of a wall: boxes, plus panels round shaped openings and flat shapes drawn on it. */
interface WallParts {
  solids: Solid[];
  panels: Panel[];
}

/** Room left beside and above a shaped opening inside its panel, so the outline never touches the edge. */
const PANEL_PAD = 2; // plan units (20 mm)
const PANEL_EDGE_M = 0.005;

/**
 * The parts of a wall: a curved wall is built as short straight pieces (each door or window in a
 * piece of its own, flat on the curve), joined so the outside of the bend is closed.
 */
function curvedWallParts(wall: Wall, walls: Wall[], openings: Opening[], heightMm: number): WallParts {
  const pieces = straightPieces(wall, openings, thicknessOf(wall) / 2);
  const out: WallParts = { solids: [], panels: [] };
  for (const p of pieces) {
    const parts = wallParts(p.wall, walls, p.openings, heightMm, p);
    out.solids.push(...parts.solids);
    out.panels.push(...parts.panels);
  }
  return out;
}

function wallParts(
  wall: Wall,
  walls: Wall[],
  openings: Opening[],
  heightMm: number,
  ends: { start?: number; end?: number } = {},
): WallParts {
  const len = wallLength(wall);
  if (len === 0) return { solids: [], panels: [] };
  const angle = (Math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1) * 180) / Math.PI;
  const rotY = (-angle * Math.PI) / 180;
  const origin = { x: wall.x1, y: wall.y1 };
  const thickness = m(thicknessOf(wall));
  const top = mmToM(heightMm);
  const joins = wallExtensions(wall, walls);
  const start = ends.start ?? joins.start;
  const end = ends.end ?? joins.end;

  /** A piece of wall from s0 to s1 along it (plan units), between two heights (metres). */
  const piece = (s0: number, s1: number, y0: number, y1: number, role: Solid['role'] = 'wall', depth = thickness) => {
    const c = toScene(origin, angle, { x: (s0 + s1) / 2, y: 0 });
    return { ...c, y0, h: y1 - y0, w: m(s1 - s0), d: depth, rotY, color: WALL_COLOR, role };
  };
  /** An opening's outline, [along, up] in metres from its centre and the wall's foot. */
  const outline = (o: Opening): [number, number][] =>
    openingProfileMm(o).map((p) => [
      p.x / 1000,
      Math.min(top - PANEL_EDGE_M, Math.max(PANEL_EDGE_M, (p.y + (o.sillMm ?? WINDOW_SILL_MM)) / 1000)),
    ]);

  const panels: Panel[] = [];
  const tUnits = thicknessOf(wall);
  // Flat shapes are only drawn on the face (a thin see-through skin); they don't cut the wall.
  for (const o of openings.filter((x) => x.flat && !x.depthMm)) {
    const mid = wallParam(wall, o) * len;
    const c = toScene(origin, angle, { x: mid, y: (o.face ?? 1) * (thicknessOf(wall) / 2 + 0.3) });
    panels.push({
      ...c,
      y0: 0,
      rotY,
      outline: outline(o),
      depth: 0.004,
      color: SHAPE_COLOR,
      opacity: SHAPE_OPACITY,
      id: o.id,
      role: 'shape',
    });
  }

  // A projection (chajja, ledge, pilaster): the shape pushed out from the face, in the wall's colour.
  for (const o of openings.filter((x) => x.flat && (x.depthMm ?? 0) > 0)) {
    const out = o.depthMm! / MM_PER_UNIT;
    const mid = wallParam(wall, o) * len;
    const c = toScene(origin, angle, { x: mid, y: (o.face ?? 1) * (tUnits / 2 + out / 2) });
    panels.push({ ...c, y0: 0, rotY, outline: outline(o), depth: m(out), color: WALL_COLOR, id: o.id, role: 'wall' });
  }

  const isNiche = (o: Opening) => !!o.flat && (o.depthMm ?? 0) < 0;
  const gaps = openings
    .filter((o) => !o.flat || isNiche(o))
    .map((o) => {
      const mid = wallParam(wall, o) * len;
      const pad = o.shape || isNiche(o) ? PANEL_PAD : 0;
      return {
        o,
        mid,
        s0: Math.max(-start, mid - o.width / 2 - pad),
        s1: Math.min(len + end, mid + o.width / 2 + pad),
      };
    })
    .sort((a, b) => a.s0 - b.s0);

  const solids: Solid[] = [];
  let cursor = -start;
  for (const { o, mid, s0, s1 } of gaps) {
    if (s0 > cursor) solids.push(piece(cursor, s0, 0, top));
    cursor = Math.max(cursor, s1);
    if (isNiche(o)) {
      // A niche: the wall behind it (which picks as the niche, so its back can be pushed and pulled),
      // and in front a layer as deep as the niche with the outline cut out of it.
      const face = o.face ?? 1;
      const deep = Math.min(-o.depthMm! / MM_PER_UNIT, tUnits - 1);
      const shift = m(mid - (s0 + s1) / 2);
      const hole = outline(o).map(([u, v]): [number, number] => [u + shift, v]);
      const [l, r] = [-m(s1 - s0) / 2, m(s1 - s0) / 2];
      const rect: [number, number][] = [
        [l, 0],
        [r, 0],
        [r, top],
        [l, top],
      ];
      const at = (across: number) => toScene(origin, angle, { x: (s0 + s1) / 2, y: across });
      panels.push({
        ...at((-face * deep) / 2),
        y0: 0,
        rotY,
        outline: rect,
        depth: m(tUnits - deep),
        color: WALL_COLOR,
        id: o.id,
        role: 'wall',
      });
      panels.push({
        ...at(face * (tUnits / 2 - deep / 2)),
        y0: 0,
        rotY,
        outline: rect,
        holes: [hole],
        depth: m(deep),
        color: WALL_COLOR,
        role: 'wall',
      });
      continue;
    }
    if (o.type === 'window' && o.shape) {
      // A shaped opening: the wall round it is one upright panel with the outline cut out of it.
      const c = toScene(origin, angle, { x: (s0 + s1) / 2, y: 0 });
      const shift = m(mid - (s0 + s1) / 2);
      const hole = outline(o).map(([u, v]): [number, number] => [u + shift, v]);
      const [l, r] = [-m(s1 - s0) / 2, m(s1 - s0) / 2];
      panels.push({
        ...c,
        y0: 0,
        rotY,
        outline: [
          [l, 0],
          [r, 0],
          [r, top],
          [l, top],
        ],
        holes: [hole],
        depth: thickness,
        color: WALL_COLOR,
        role: 'wall',
      });
      if (!o.open)
        panels.push({
          ...c,
          y0: 0,
          rotY,
          outline: hole,
          depth: 0.012,
          color: GLASS_COLOR,
          opacity: 0.35,
          id: o.id,
          role: 'glass',
        });
      continue;
    }
    // A window keeps its height when its sill is raised or lowered.
    const sillMm = o.sillMm ?? WINDOW_SILL_MM;
    const headMm = o.type === 'door' ? DOOR_HEAD_MM : sillMm + (o.heightMm ?? WINDOW_HEAD_MM - WINDOW_SILL_MM);
    const head = Math.min(top, mmToM(headMm));
    // A gate is open to the sky: no lintel over it.
    if (top > head && !o.gate) solids.push(piece(s0, s1, head, top));
    if (o.type === 'window') {
      const sill = Math.min(head, mmToM(sillMm));
      solids.push(piece(s0, s1, 0, sill));
      if (!o.open) solids.push(...windowPanes(o, s0, s1, sill, head));
    }
  }
  if (len + end > cursor) solids.push(piece(cursor, len + end, 0, top));
  return { solids, panels };

  /**
   * A window's glass by its type: sliding panes one behind the other with a meeting rail, two
   * casement sashes either side of a mullion, or a single pane (casement, fixed, ventilator).
   */
  function windowPanes(o: Opening, s0: number, s1: number, sill: number, head: number): Solid[] {
    const glass = (a: number, b: number, across = 0): Solid => ({
      ...toScene(origin, angle, { x: (a + b) / 2, y: across }),
      y0: sill,
      h: head - sill,
      w: m(b - a),
      d: 0.012,
      rotY,
      color: GLASS_COLOR,
      opacity: 0.35,
      id: o.id,
      role: 'glass',
    });
    const mullion = (at: number): Solid => ({
      ...piece(at - 3, at + 3, sill, head, 'door', Math.min(thickness, 0.08)),
      color: FRAME_COLOR,
      id: o.id,
    });
    const mid = (s0 + s1) / 2;
    const span = s1 - s0;
    if (o.windowKind === 'sliding')
      return [glass(s0, mid + span / 10, -tUnits / 6), glass(mid - span / 10, s1, tUnits / 6), mullion(mid)];
    if (o.windowKind === 'casement2') return [glass(s0, mid), glass(mid, s1), mullion(mid)];
    return [glass(s0, s1)];
  }
}

/**
 * A door as it stands where its plan symbol is drawn: an open leaf (or two), sliding panels, a
 * folding door part open, a closed rolling shutter with its box above, or nothing for a doorway.
 * `thicknessM` is the host wall's thickness.
 */
function doorLeaves(door: Opening, heightMm: number, thicknessM = 0.23): Solid[] {
  const sy = door.flipSide ? -1 : 1;
  const hx = door.flipHinge ? -1 : 1;
  const kind = doorKindOf(door);
  const head = Math.min(mmToM(DOOR_HEAD_MM), mmToM(heightMm));
  const rotY = (-door.angle * Math.PI) / 180;
  /** A thin panel from a to b in the door's own frame (plan units: x along the wall, y across). */
  const panel = (a: Point, b: Point, color = DOOR_COLOR, y0 = 0, h = head - 0.01, d = 0.04): Solid => {
    const [pa, pb] = [a, b].map((p) => ({ x: p.x * hx, y: p.y * sy }));
    const turn = Math.atan2(pb.y - pa.y, pb.x - pa.x);
    return {
      ...toScene(door, door.angle, { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }),
      y0,
      h,
      w: Math.max(0.01, m(Math.hypot(pb.x - pa.x, pb.y - pa.y))),
      d,
      rotY: rotY - turn,
      color,
      role: 'door',
    };
  };
  const w = door.width;
  const half = w / 2;
  const t = thicknessM / M_PER_UNIT_LOCAL / 2;
  switch (kind) {
    case 'opening':
      return [];
    case 'sliding':
      return [
        panel({ x: -half, y: -t / 3 }, { x: w / 10, y: -t / 3 }),
        panel({ x: -w / 10, y: t / 3 }, { x: half, y: t / 3 }),
      ];
    case 'folding': {
      const n = w > 120 ? 4 : 2;
      const depth = (w / n) * 0.6;
      const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: -half + (i * w) / n, y: i % 2 ? -depth : 0 }));
      return pts.slice(1).map((p, i) => panel(pts[i], p));
    }
    case 'shutter': {
      // Closed, on the inside face, with the roll's box above the opening.
      const box = Math.min(0.35, Math.max(0.1, mmToM(heightMm) - head));
      return [
        panel({ x: -half, y: -t + 1 }, { x: half, y: -t + 1 }, SHUTTER_COLOR, 0, head, 0.03),
        panel({ x: -half, y: -t - 12 }, { x: half, y: -t - 12 }, SHUTTER_COLOR, head - box, box, 0.25),
      ];
    }
  }
  if (kind === 'double' || door.gate) {
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

/** A door shut in its opening: a leaf (or two, with a small gap between) across it, as drawn in elevation. */
function closedDoor(door: Opening, heightMm: number): Solid[] {
  const kind = doorKindOf(door);
  if (kind === 'opening') return [];
  const head = Math.min(mmToM(DOOR_HEAD_MM), mmToM(heightMm)) - 0.01;
  const rotY = (-door.angle * Math.PI) / 180;
  const leaf = (a: number, b: number): Solid => ({
    ...toScene(door, door.angle, { x: (a + b) / 2, y: 0 }),
    y0: 0,
    h: head,
    w: m(b - a),
    d: 0.04,
    rotY,
    color: kind === 'shutter' ? SHUTTER_COLOR : DOOR_COLOR,
    role: 'door',
  });
  const half = door.width / 2;
  const gap = 0.3; // plan units (3 mm)
  const pair = kind === 'double' || kind === 'sliding' || kind === 'folding' || door.gate;
  return pair ? [leaf(-half, -gap), leaf(gap, half)] : [leaf(-half, half)];
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
const LEAF = '#5b8c3e';
const DARK_LEAF = '#3f6b2f';
const TRUNK = '#6b4f3a';
const POT = '#b86b3c';
const SOIL = '#6b5140';
const STONE = '#c9c2b8';
const WATER = '#8fc9e8';
const FLOWERS = ['#e11d48', '#f59e0b', '#a855f7', '#f472b6'];

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
  /** Leaves as a rounded mass (three stacked boxes, widest in the middle) of radius r metres about height yc. */
  const foliage = (fx: number, fy: number, r: number, yc: number) => {
    const size = m(Math.min(f.w, f.h));
    for (const [share, y0, h] of [
      [0.7, yc - r, r * 0.6],
      [1, yc - r * 0.4, r * 0.8],
      [0.65, yc + r * 0.4, r * 0.6],
    ]) {
      const fr = (r * share) / size;
      part(fx - fr, fy - fr, 2 * fr, 2 * fr, Math.max(0, y0), h, LEAF);
    }
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
    case 'plant-small':
      part(0.2, 0.2, 0.6, 0.6, 0, 0.35, POT, true);
      foliage(0.5, 0.5, 0.2, 0.65);
      break;
    case 'plant-large':
      part(0.25, 0.25, 0.5, 0.5, 0, 0.5, POT, true);
      foliage(0.5, 0.5, 0.33, 1.15);
      break;
    case 'planter':
      part(0, 0, 1, 1, 0, 0.45, POT, true);
      part(0.04, 0.1, 0.92, 0.8, 0.45, 0.25, LEAF);
      break;
    case 'tree-small':
    case 'tree-large': {
      const big = f.kind === 'tree-large';
      const trunk = (big ? 0.35 : 0.2) / m(Math.min(f.w, f.h));
      part(0.5 - trunk / 2, 0.5 - trunk / 2, trunk, trunk, 0, big ? 3 : 1.7, TRUNK, true);
      foliage(0.5, 0.5, m(Math.min(f.w, f.h)) / 2, big ? 5 : 2.6);
      break;
    }
    case 'palm': {
      const size = m(Math.min(f.w, f.h));
      const trunk = 0.25 / size;
      part(0.5 - trunk / 2, 0.5 - trunk / 2, trunk, trunk, 0, 4.2, TRUNK, true);
      // Fronds: two long flat leaves crossed, and a crown.
      part(0, 0.46, 1, 0.08, 4.1, 0.05, LEAF);
      part(0.46, 0, 0.08, 1, 4.1, 0.05, LEAF);
      part(0.4, 0.4, 0.2, 0.2, 4.0, 0.4, DARK_LEAF);
      break;
    }
    case 'shrub':
      foliage(0.5, 0.5, m(Math.min(f.w, f.h)) / 2, 0.5);
      break;
    case 'hedge':
      part(0, 0, 1, 1, 0, 1.2, LEAF);
      break;
    case 'flower-bed':
      part(0, 0, 1, 1, 0, 0.15, SOIL, true);
      part(0.05, 0.1, 0.9, 0.8, 0.15, 0.12, LEAF);
      [0.15, 0.4, 0.65, 0.85].forEach((fx, i) =>
        part(fx - 0.05, i % 2 ? 0.25 : 0.55, 0.1, 0.2, 0.27, 0.08, FLOWERS[i % FLOWERS.length], true),
      );
      break;
    case 'bench':
      part(0, 0.3, 1, 0.7, 0.4, 0.06, WOOD);
      part(0, 0, 1, 0.12, 0.46, 0.4, WOOD);
      [0.05, 0.9].forEach((fx) => part(fx, 0.35, 0.05, 0.6, 0, 0.4, '#374151', true));
      break;
    case 'fountain':
      part(0, 0, 1, 1, 0, 0.45, STONE);
      part(0.1, 0.1, 0.8, 0.8, 0.45, 0.02, WATER, true);
      part(0.42, 0.42, 0.16, 0.16, 0.45, 0.65, STONE);
      part(0.3, 0.3, 0.4, 0.4, 1.1, 0.1, STONE);
      break;
    case 'jhoola':
      part(0, 0.4, 0.05, 0.2, 0, 2.2, WOOD);
      part(0.95, 0.4, 0.05, 0.2, 0, 2.2, WOOD);
      part(0, 0.45, 1, 0.1, 2.1, 0.1, WOOD);
      part(0.25, 0.3, 0.5, 0.4, 0.5, 0.06, WOOD);
      part(0.25, 0.3, 0.5, 0.06, 0.56, 0.4, WOOD);
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

/** Anything placed at a height and picked by the item it came from. */
type Part = { y0: number; id?: string; level?: string };

const toXZ = (p: Point): [number, number] => [m(p.x), m(p.y)];

/**
 * Height (metres) of a floor's finished level: the plinth plus a storey (walls and slab) per floor
 * between it and the ground floor; a basement is below the ground floor by its slab and its height.
 */
export function levelBaseM(doc: PlanDoc, levelId: string, wallHeightMm: number): number {
  const g = groundIndex(doc);
  const found = doc.levels.findIndex((l) => l.id === levelId);
  const i = found < 0 ? g : found;
  const slab = slabMm(doc);
  let base = mmToM(doc.plinthMm);
  // Up a floor's walls and its slab for each floor between it and the ground floor; down for a basement.
  for (let k = g; k < i; k++) base += mmToM(levelWallMm(doc, doc.levels[k].id, wallHeightMm) + slab);
  for (let k = g - 1; k >= i; k--) base -= mmToM(slab + levelWallMm(doc, doc.levels[k].id, wallHeightMm));
  return base;
}

/**
 * Everything needed to draw the plan in 3D, in metres. Floors stack upward from the plinth: each
 * storey is the wall height plus a slab. Ground-floor walls also run down through the plinth.
 */
export function buildModel(doc: PlanDoc, options: ModelOptions): Model3D {
  const colorOf = (id?: string) => doc.materials.find((mat) => mat.id === id)?.color;
  const finishOf = (id?: string, fallback?: Pattern): Finish | undefined => {
    const mat = doc.materials.find((x) => x.id === id);
    const pattern = mat?.pattern ?? (mat ? undefined : fallback);
    if (!pattern) return undefined;
    const spanM = mmToM(patternSpanMm({ pattern, sizeMm: mat?.sizeMm }));
    return mat ? { pattern, spanM, name: mat.name } : { pattern, spanM };
  };
  /** Give solids the element's material pattern (only those drawn in its colour). */
  const withFinish = (id: string | undefined, fallback?: Pattern) => {
    const finish = finishOf(id, fallback);
    const color = colorOf(id);
    return (s: Solid): Solid => (finish && (!color || s.color === color) ? { ...s, finish } : s);
  };
  const solids: Solid[] = [];
  const floors: Floor[] = [];
  const guides: NonNullable<Model3D['guides']> = [];
  const slabs: Slab3D[] = [];
  const blocks: Slab3D[] = [];
  const panels: Panel[] = [];
  const plinth = mmToM(doc.plinthMm);
  const levels = doc.levels.length ? doc.levels : [{ id: 'ground', name: 'Ground floor' }];
  // The lawn opens over the basement, round the outside of its walls.
  const basement = basementOf(doc);
  const pitOutline = basement
    ? outsideOutline(
        doc.elements.filter((el): el is Wall => el.type === 'wall' && !el.hidden && levelOf(el) === basement.id),
      )
    : null;
  const pit = pitOutline ? [pitOutline.map((p) => [m(p.x), m(p.y)] as [number, number])] : [];
  // The ground and the neighbours; null on a flat site with none, where everything stands at ±0.
  const plotEl = doc.elements.find((el) => el.type === 'plot' && levelOf(el) === GROUND_LEVEL);
  const site =
    options.terrain === false
      ? null
      : siteOf(
          doc,
          pitOutline && pitOutline.length >= 3 ? pitOutline : null,
          { color: colorOf(plotEl?.material) ?? LAWN, finish: finishOf(plotEl?.material, 'grass') },
          (id, color) => ({ color: colorOf(id) ?? color, finish: finishOf(id) }),
        );
  /** The ground where walls and steps stand (null on a flat site: they stand at ±0). */
  const terrain = site && !site.flat ? site.ground : null;

  levels.forEach((level) => {
    const base = doc.levels.length ? levelBaseM(doc, level.id, options.wallHeightMm) : plinth;
    const ground = level.id === GROUND_LEVEL;
    // A basement's walls, columns and slab over it go to its own height.
    const levelMm = levelWallMm(doc, level.id, options.wallHeightMm);
    const wallTop = mmToM(levelMm);
    const lift = <T extends Part>(s: T): T => ({ ...s, y0: s.y0 + base });
    /** Raise an item's parts by its height above the floor. */
    const raise =
      (el: { elevMm?: number }) =>
      <T extends Part>(s: T): T =>
        el.elevMm ? { ...s, y0: s.y0 + mmToM(el.elevMm) } : s;
    /** Mark parts with the item they came from (a window's glass keeps the window's id). */
    const from =
      (id: string) =>
      <T extends Part>(s: T): T => ({ ...s, id: s.id ?? id, level: level.id });
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const walls = wallsOf(els);
    const openings = els.filter((el): el is Opening => el.type === 'door' || el.type === 'window');

    for (const wall of walls) {
      const own = openings.filter((o) => o.wallId === wall.id);
      // A retaining wall looks like concrete until it is painted.
      const retaining = wall.kind === 'retaining';
      const color = colorOf(wall.material) ?? (retaining ? CONCRETE : undefined);
      const finish = finishOf(wall.material, retaining ? 'concrete' : undefined);
      const look = (id?: string): Look | undefined => {
        const c = colorOf(id);
        return c ? { color: c, finish: finishOf(id) } : undefined;
      };
      const [a, b] = [look(wall.materialA), look(wall.materialB)];
      const sides: Sides | undefined = a || b ? { plus: a, minus: b } : undefined;
      const paint = <T extends Solid | Panel>(s: T): T =>
        s.role === 'wall' && (color || sides) ? { ...s, ...(color && { color, finish }), ...(sides && { sides }) } : s;
      const height = wall.heightMm ?? levelMm;
      // A boundary wall stands on the natural ground, not on the plinth.
      const onGround = wall.kind === 'boundary' && ground;
      const place = <T extends Part>(s: T): T => from(wall.id)(raise(wall)(onGround ? s : lift(s)));
      const parts = curvedWallParts(wall, walls, own, height);
      // On sloping or levelled ground it steps down the slope; parts of it over openings rise with the ground.
      const stepped = onGround && terrain ? parts.solids.flatMap((s) => stepOnGround(s, terrain)) : parts.solids;
      const panelsOf =
        onGround && terrain
          ? parts.panels.map((p) => ({
              ...p,
              y0:
                p.y0 +
                groundBeside(
                  terrain,
                  { x: p.x / M_PER_UNIT, y: p.z / M_PER_UNIT },
                  p.rotY,
                  thicknessOf(wall) * M_PER_UNIT,
                ) /
                  1000,
            }))
          : parts.panels;
      solids.push(...stepped.map(paint).map(place));
      panels.push(...panelsOf.map(paint).map(place));
      if (!isBuildingWall(wall)) continue;
      // The plinth: ground-floor walls carry on down to the ground (not under a raised wall), to the
      // lowest finished ground along them.
      const footMm =
        ground && terrain ? lowestAlong(terrain, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }) : 0;
      if (ground && doc.plinthMm - footMm > 0.5 && !wall.elevMm)
        solids.push(
          ...curvedWallParts(wall, walls, [], doc.plinthMm - footMm)
            .solids.map((s) => (footMm ? { ...s, y0: s.y0 + mmToM(footMm) } : s))
            .map(paint)
            .map(from(wall.id)),
        );
    }
    for (const door of openings) {
      const host = walls.find((w) => w.id === door.wallId);
      if (door.type !== 'door' || !host) continue;
      const leaves = (
        options.closedDoors
          ? closedDoor(door, host.heightMm ?? levelMm)
          : doorLeaves(door, host.heightMm ?? levelMm, m(thicknessOf(host)))
      ).map(raise(host));
      const onGround = host.kind === 'boundary' && ground;
      // A gate in a wall on sloping ground rises with the ground at it.
      const rise =
        onGround && terrain
          ? mmToM(groundBeside(terrain, door, (-door.angle * Math.PI) / 180, m(thicknessOf(host))))
          : 0;
      const placed = onGround ? leaves.map((s) => (rise ? { ...s, y0: s.y0 + rise } : s)) : leaves.map(lift);
      solids.push(...placed.map(from(door.id)));
    }
    for (const el of els) {
      if (el.type === 'furniture' && options.showFurniture)
        solids.push(
          ...furnitureSolids(el, colorOf(el.material))
            .map(withFinish(el.material))
            .map(lift)
            .map(raise(el))
            .map(from(el.id)),
        );
      if (el.type === 'column')
        solids.push(
          from(el.id)(
            raise(el)(
              lift(
                withFinish(
                  el.material,
                  'concrete',
                )(columnSolid(el, el.heightMm ? mmToM(el.heightMm) : wallTop, colorOf(el.material))),
              ),
            ),
          ),
        );
      if (el.type === 'beam') {
        const b = beamSolid(el, wallTop, colorOf(el.material));
        if (b) solids.push(from(el.id)(raise(el)(lift(withFinish(el.material, 'concrete')(b)))));
      }
      if (el.type === 'stair') {
        // Steps up the plinth start from the natural ground; others from the floor they are on.
        const fromGround = ground && Math.abs(el.riseMm - doc.plinthMm) < 1 && !el.elevMm;
        let parts = stairSolids(el, colorOf(el.material)).map(withFinish(el.material, 'concrete'));
        // On sloping or levelled ground each step reaches down to (or starts from) the ground under it.
        if (fromGround && terrain)
          parts = parts.map((s) => {
            const top = s.y0 + s.h;
            const h = Math.max(0.01, top - mmToM(lowestUnder(terrain, s)));
            return { ...s, y0: top - h, h };
          });
        solids.push(...(fromGround ? parts : parts.map(lift)).map(raise(el)).map(from(el.id)));
      }
      // The plot's lawn: a floor where it is flat, else a mesh following the ground (in the terrain).
      const lawnY = el.type === 'plot' && ground ? (el.id === plotEl?.id ? site?.lawnY : 0) : undefined;
      if (el.type === 'plot' && ground) {
        const line = buildableArea(el);
        if (line.length >= 3 && lawnY === null) {
          // Draped over the ground, a point every 0.5 m.
          const pts = densify(line, 50);
          guides.push({
            points: pts.map(toXZ),
            y: 0.012,
            ys: pts.map((p) => mmToM(site!.lawnAt(p.x, p.y)) + 0.012),
            level: level.id,
          });
        } else if (line.length >= 3)
          guides.push({ points: line.map((p) => [m(p.x), m(p.y)]), y: (lawnY ?? 0) + 0.012, level: level.id });
      }
      if (el.type === 'plot' && ground && lawnY !== null)
        floors.push({
          points: outlinePoints(el).map((p) => [m(p.x), m(p.y)] as [number, number]),
          y: lawnY ?? 0,
          color: colorOf(el.material) ?? LAWN,
          finish: finishOf(el.material, 'grass'),
          opacity: 0.82,
          ...(pit.length ? { holes: pit } : {}),
          id: el.id,
          level: level.id,
        });
      if (el.type === 'slab') {
        // Double-height rooms under it leave it open over them.
        const open = openRooms(doc, level.id)
          .map((r) => r.points)
          .filter((pts) => within(pts, el.points));
        const holes = [...(el.holes ?? []), ...open];
        slabs.push({
          points: el.points.map(toXZ),
          ...(holes.length ? { holes: holes.map((h) => h.map(toXZ)) } : {}),
          y0: base + wallTop + mmToM(el.elevMm ?? 0),
          h: m(el.thickness),
          color: colorOf(el.material) ?? CONCRETE,
          finish: finishOf(el.material, 'concrete'),
          id: el.id,
          level: level.id,
          role: 'slab',
        });
      }
      if (el.type === 'block') {
        // On a slab it stands on the slab's top; otherwise on the floor.
        const host = el.slabId ? els.find((x): x is Slab => x.type === 'slab' && x.id === el.slabId) : undefined;
        const foot = host ? base + wallTop + mmToM(host.elevMm ?? 0) + m(host.thickness) : base;
        const flatShape = el.heightMm <= 0;
        blocks.push({
          points: el.points.map(toXZ),
          // A flat shape floats just over the floor finish (drawn 5 mm up) so it shows.
          y0: foot + mmToM(el.elevMm ?? 0) + (flatShape ? 0.007 : 0),
          h: flatShape ? 0.003 : mmToM(el.heightMm),
          color: flatShape ? SHAPE_COLOR : (colorOf(el.material) ?? CONCRETE),
          ...(flatShape ? { opacity: SHAPE_OPACITY } : { finish: finishOf(el.material, 'concrete') }),
          id: el.id,
          level: level.id,
          role: flatShape ? 'shape' : 'block',
        });
      }
    }
    const voids = voidsOver(doc, level.id).map((v) => v.points);
    for (const r of doc.rooms.filter((room) => levelOf(room) === level.id)) {
      // No floor over a double-height room below.
      if (voids.some((v) => within(r.points, v))) continue;
      const holes = voids.filter((v) => within(v, r.points));
      floors.push({
        points: r.points.map((p) => [m(p.x), m(p.y)] as [number, number]),
        ...(holes.length ? { holes: holes.map((h) => h.map((p) => [m(p.x), m(p.y)] as [number, number])) } : {}),
        y: base,
        color: colorOf(r.material) ?? DEFAULT_FLOOR,
        finish: finishOf(r.material),
        id: r.id,
        level: level.id,
      });
    }
  });

  const flat = [...floors, ...slabs, ...blocks].flatMap((f) => f.points);
  const xs = [...solids.map((s) => s.x), ...flat.map((p) => p[0])];
  const zs = [...solids.map((s) => s.z), ...flat.map((p) => p[1])];
  // Not Math.min(...xs): a big plan has too many values to spread into one call.
  const lo = (v: number[]) => v.reduce((m, x) => (x < m ? x : m), Infinity);
  const hi = (v: number[]) => v.reduce((m, x) => (x > m ? x : m), -Infinity);
  const centre = xs.length ? { x: (lo(xs) + hi(xs)) / 2, z: (lo(zs) + hi(zs)) / 2 } : { x: 8, z: 5 };
  const size = xs.length ? Math.max(hi(xs) - lo(xs), hi(zs) - lo(zs), 4) : 16;
  const model: Model3D = { solids, floors, slabs, blocks, panels, guides, centre, size };
  if (!site) return model;
  return { ...model, terrain: site.terrain, context: site.context, groundY: site.groundY };
}

/** A closed outline with points added so none are more than `step` apart. */
function densify(ring: Point[], step: number): Point[] {
  return ring.flatMap((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
  });
}
