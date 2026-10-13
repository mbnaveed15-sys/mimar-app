import { boxOf, cellFor, GridIndex } from './lib/spatial';
import { pointInPolygon } from './geometry';
import { directionAlong, distanceToWall, isArc, offsetPath, pointAlong, radiusOf, wallPath } from './lib/arc';
import { MM_PER_UNIT } from './lib/scale';
import type { PlanElement, Point, Units, Wall } from './types';

/** Standard brick wall: 9 inches. */
export const DEFAULT_WALL_THICKNESS_MM = 228.6;
export const DEFAULT_WALL_THICKNESS = DEFAULT_WALL_THICKNESS_MM / MM_PER_UNIT;

/** Common wall thicknesses: half brick (partition), one brick, one and a half bricks. */
export const WALL_PRESETS_MM: Record<Units, { label: string; mm: number }[]> = {
  imperial: [
    { label: `4½" partition`, mm: 114.3 },
    { label: `9" brick`, mm: 228.6 },
    { label: `13½" brick`, mm: 342.9 },
  ],
  metric: [
    { label: '115 mm partition', mm: 115 },
    { label: '230 mm brick', mm: 230 },
    { label: '345 mm brick', mm: 345 },
  ],
};

/** Round metric thicknesses for free projects and buildings (blockwork, partitions, concrete). */
export const METRIC_WALL_PRESETS_MM: { label: string; mm: number }[] = [
  { label: '100 mm', mm: 100 },
  { label: '150 mm', mm: 150 },
  { label: '200 mm', mm: 200 },
  { label: '230 mm', mm: 230 },
];

export const thicknessOf = (w: Wall) => w.thickness ?? DEFAULT_WALL_THICKNESS;

/** Part of the building itself: an ordinary wall or a glass curtain wall (not a boundary wall, parapet or retaining wall). */
export const isBuildingWall = (w: Wall) => !w.kind || w.kind === 'curtain';

/** A glass curtain wall: 4" in plan. */
export const CURTAIN_MM = 101.6;

/**
 * How thick a door or window of this width has to cover its wall on the plan: a curved wall bows
 * out past the straight opening, by the arc's rise over the opening's width, on both sides to be safe.
 */
export function openingCover(w: Wall, width: number): number {
  const r = radiusOf(w);
  const rise = r ? r - Math.sqrt(Math.max(0, r * r - (width * width) / 4)) : 0;
  return thicknessOf(w) + 2 * rise;
}

const JOIN_EPS = 0.5;

// A spatial index per list of walls, so finding the walls at a point doesn't scan them all.
const joinIndex = new WeakMap<Wall[], GridIndex<Wall>>();
function indexFor(walls: Wall[]): GridIndex<Wall> {
  let index = joinIndex.get(walls);
  if (!index) {
    const boxes = walls.map((w) => {
      const b = boxOf(wallPath(w));
      return { minX: b.minX - JOIN_EPS, minY: b.minY - JOIN_EPS, maxX: b.maxX + JOIN_EPS, maxY: b.maxY + JOIN_EPS };
    });
    index = new GridIndex<Wall>(cellFor(boxes));
    walls.forEach((w, i) => index!.add(w, boxes[i]));
    joinIndex.set(walls, index);
  }
  return index;
}

/** True when another wall ends at, or runs through, this point. */
function isJoined(p: Point, self: Wall, walls: Wall[]): boolean {
  return indexFor(walls)
    .at(p)
    .some((w) => w.id !== self.id && distanceToWall(w, p) <= JOIN_EPS);
}

/** How far each end of the wall reaches past its end point (half the thickness where it meets another wall). */
export function wallExtensions(wall: Wall, walls: Wall[]): { start: number; end: number } {
  const half = thicknessOf(wall) / 2;
  return {
    start: isJoined({ x: wall.x1, y: wall.y1 }, wall, walls) ? half : 0,
    end: isJoined({ x: wall.x2, y: wall.y2 }, wall, walls) ? half : 0,
  };
}

/**
 * Where two straight walls meet end to end at an angle that isn't square (a 45° corner, say): the
 * mitred corners at this wall's end, [on its +normal face, on its -normal face], so both faces run
 * cleanly into the other wall's. Null for a square corner, a straight run, a T-junction, three or
 * more walls, or a corner so sharp the mitre would stick out far.
 */
function mitreAt(wall: Wall, atStart: boolean, walls: Wall[]): [Point, Point] | null {
  const p = atStart ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 };
  const others = indexFor(walls)
    .at(p)
    .filter((w) => w.id !== wall.id && distanceToWall(w, p) <= JOIN_EPS);
  if (others.length !== 1 || isArc(others[0])) return null;
  const other = others[0];
  const near = (q: Point) => Math.hypot(q.x - p.x, q.y - p.y) <= JOIN_EPS;
  const otherStart = near({ x: other.x1, y: other.y1 });
  if (!otherStart && !near({ x: other.x2, y: other.y2 })) return null;
  // Each wall's direction going away from the corner.
  const away = (w: Wall, fromStart: boolean) => {
    const dx = (w.x2 - w.x1) * (fromStart ? 1 : -1);
    const dy = (w.y2 - w.y1) * (fromStart ? 1 : -1);
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  };
  const u = away(wall, atStart);
  const v = away(other, otherStart);
  const cross = u.x * v.y - u.y * v.x;
  const dot = u.x * v.x + u.y * v.y;
  // Square corners keep the plain overlap; nearly straight runs have nothing to mitre.
  if (Math.abs(dot) < 0.02 || Math.abs(cross) < 0.05) return null;
  const hw = thicknessOf(wall) / 2;
  const hv = thicknessOf(other) / 2;
  // This wall's face on side σ (of its normal going away) runs into the other wall's face on side -σ.
  const corner = (sigma: 1 | -1): Point => {
    const a = { x: p.x - u.y * hw * sigma, y: p.y + u.x * hw * sigma };
    const b = { x: p.x + v.y * hv * sigma, y: p.y - v.x * hv * sigma };
    // a + t·u = b + s·v
    const t = ((b.x - a.x) * v.y - (b.y - a.y) * v.x) / cross;
    return { x: a.x + u.x * t, y: a.y + u.y * t };
  };
  const plus = corner(1);
  const minus = corner(-1);
  const reach = 4 * Math.max(hw, hv);
  if (Math.hypot(plus.x - p.x, plus.y - p.y) > reach || Math.hypot(minus.x - p.x, minus.y - p.y) > reach) return null;
  // Going away from the start the normal is the wall's own; from the end it is reversed.
  return atStart ? [plus, minus] : [minus, plus];
}

/**
 * How far a box standing for the wall (in 3D) reaches past each end: as `wallExtensions`, but at a
 * mitred corner just to its outer corner, so the two walls' boxes close the corner with no notch.
 */
export function wallReach(wall: Wall, walls: Wall[]): { start: number; end: number } {
  const ext = wallExtensions(wall, walls);
  if (isArc(wall)) return ext;
  const len = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) || 1;
  const along = (q: Point) => ((q.x - wall.x1) * (wall.x2 - wall.x1) + (q.y - wall.y1) * (wall.y2 - wall.y1)) / len;
  const start = ext.start && mitreAt(wall, true, walls);
  const end = ext.end && mitreAt(wall, false, walls);
  return {
    start: start ? Math.max(0, -Math.min(...start.map(along))) : ext.start,
    end: end ? Math.max(0, Math.max(...end.map(along)) - len) : ext.end,
  };
}

/**
 * Outline of a wall with its thickness. Ends that meet another wall are extended by half the
 * thickness so corners close; the extension is hidden inside the neighbouring wall. Two walls meeting
 * end to end at an angle (not square) are mitred, so the corner has no step or notch.
 */
export function wallPolygon(wall: Wall, walls: Wall[]): Point[] {
  if (isArc(wall)) return arcWallPolygon(wall, walls);
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const half = thicknessOf(wall) / 2;
  const { start, end } = wallExtensions(wall, walls);
  const a = { x: wall.x1 - ux * start, y: wall.y1 - uy * start };
  const b = { x: wall.x2 + ux * end, y: wall.y2 + uy * end };
  const nx = -uy * half;
  const ny = ux * half;
  const [a1, a2] = (start && mitreAt(wall, true, walls)) || [
    { x: a.x + nx, y: a.y + ny },
    { x: a.x - nx, y: a.y - ny },
  ];
  const [b1, b2] = (end && mitreAt(wall, false, walls)) || [
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
  ];
  return [a1, b1, b2, a2];
}

/** A curved wall's outline: its two faces as arcs, each end reaching on along the curve's end direction. */
function arcWallPolygon(wall: Wall, walls: Wall[]): Point[] {
  const half = thicknessOf(wall) / 2;
  const { start, end } = wallExtensions(wall, walls);
  const [d0, d1] = [directionAlong(wall, 0), directionAlong(wall, 1)];
  const reach = (pts: Point[]) => {
    const out = [...pts];
    const [a, b] = [out[0], out[out.length - 1]];
    out[0] = { x: a.x - d0.x * start, y: a.y - d0.y * start };
    out[out.length - 1] = { x: b.x + d1.x * end, y: b.y + d1.y * end };
    return out;
  };
  return [...reach(offsetPath(wall, half)), ...reach(offsetPath(wall, -half)).reverse()];
}

export const wallsOf = (elements: PlanElement[]) => elements.filter((el): el is Wall => el.type === 'wall');

export interface WallDimensionPlacement {
  /** Side for the dimension line: 1 = left of the drawing direction, -1 = right. */
  side: 1 | -1;
  /** Outside walls (or walls not yet enclosing anything) always show a dimension. */
  exterior: boolean;
}

/**
 * Decide where each wall's dimension goes, using the enclosed areas (faces) of the plan:
 * an outside wall has open space on one side, and the dimension goes there.
 */
export function placeWallDimension(wall: Wall, faces: Point[][], centre: Point): WallDimensionPlacement {
  const u = directionAlong(wall, 0.5);
  const nx = u.y;
  const ny = -u.x;
  const off = thicknessOf(wall) / 2 + 2;
  const mid = pointAlong(wall, 0.5);
  const inside = (p: Point) => faces.some((f) => pointInPolygon(p, f));
  const left = inside({ x: mid.x + nx * off, y: mid.y + ny * off });
  const right = inside({ x: mid.x - nx * off, y: mid.y - ny * off });
  if (left !== right) return { side: left ? -1 : 1, exterior: true };
  // Free-standing or interior wall: face away from the middle of the plan.
  const side = (mid.x - centre.x) * nx + (mid.y - centre.y) * ny >= 0 ? 1 : -1;
  return { side, exterior: !left };
}
