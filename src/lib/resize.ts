/**
 * Resizing in one direction: side grips (one side moves, the opposite side stays), Scale with its own
 * factor across and up and down, Stretch taking in one side of an item, and Reset size. Pure.
 */
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { fromFurnitureLocal, pointInPolygon, toFurnitureLocal } from '../geometry';
import { insetPolygon } from './plot';
import { MM_PER_UNIT } from './scale';
import { stairLayout } from './site';
import type { Block, Column, Furniture, Pad, PlanElement, Point, Roof, Slab, Stair } from '../types';

/** Which way the Scale tool stretches: both ways, or only across (x) or only up and down (y). */
export type ScaleAxis = 'both' | 'x' | 'y';

/** Items placed by their centre and turned about it, with a box footprint. */
type Placed = Furniture | Column | Stair;
/** Items drawn as an outline whose sides can be pushed out or pulled in. */
type Outlined = Slab | Pad | Block | Roof;

/** The four sides of a placed item, in its own frame: right, left, top (back) and bottom (front). */
const SIDES = { 'side-r': ['x', 1], 'side-l': ['x', -1], 'side-t': ['y', -1], 'side-b': ['y', 1] } as const;
type SideName = keyof typeof SIDES;

/** Outlines with more corners than this are round: no side grips (as for corner grips). */
const MAX_SIDES = 24;

/** The smallest an item can be made: 50 mm. */
const MIN_SIZE = 50 / MM_PER_UNIT;

const u = (mm: number) => mm / MM_PER_UNIT;

/** Whether a stair's side can move: straight stairs both ways, ramps only across (their slope sets the length). */
function stairSides(st: Stair): SideName[] {
  if (st.shape === 'straight') return ['side-r', 'side-l', 'side-t', 'side-b'];
  if (st.shape === 'ramp') return ['side-r', 'side-l'];
  return [];
}

function placedSides(el: Placed): SideName[] {
  if (el.type === 'stair') return stairSides(el);
  return ['side-r', 'side-l', 'side-t', 'side-b'];
}

function isPlaced(el: PlanElement): el is Placed {
  return el.type === 'furniture' || el.type === 'column' || el.type === 'stair';
}

function isOutlined(el: PlanElement): el is Outlined {
  if (el.type !== 'slab' && el.type !== 'pad' && el.type !== 'block' && el.type !== 'roof') return false;
  if ('curve' in el && el.curve) return false;
  if (el.type === 'block' && el.path) return false;
  return el.points.length >= 3 && el.points.length <= MAX_SIDES;
}

/** A unit vector square to the outline's edge `i`, pointing out of the shape. */
function outward(points: Point[], i: number): Point {
  const a = points[i];
  const b = points[(i + 1) % points.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const probe = { x: mid.x + n.x * 0.5, y: mid.y + n.y * 0.5 };
  return pointInPolygon(probe, points) ? { x: -n.x, y: -n.y } : n;
}

/** A side grip: its name (the handle's), where it sits, and which way is out. */
export interface SideGrip {
  name: string;
  at: Point;
  out: Point;
}

/** The side grips a selected item shows (none for items that can't be resized this way). */
export function sideGrips(el: PlanElement): SideGrip[] {
  if (el.locked) return [];
  if (isPlaced(el)) {
    const a = ((el.rotation ?? 0) * Math.PI) / 180;
    const turn = (v: Point) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });
    return placedSides(el).map((name) => {
      const [axis, sign] = SIDES[name];
      const local = axis === 'x' ? { x: (sign * el.w) / 2, y: 0 } : { x: 0, y: (sign * el.h) / 2 };
      return {
        name,
        at: fromFurnitureLocal(el, local),
        out: turn(axis === 'x' ? { x: sign, y: 0 } : { x: 0, y: sign }),
      };
    });
  }
  if (isOutlined(el))
    return el.points.map((a, i) => {
      const b = el.points[(i + 1) % el.points.length];
      return { name: `side-edge-${i}`, at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, out: outward(el.points, i) };
    });
  return [];
}

/** Whether `name` is a side grip's handle name. */
export const isSideGrip = (name: string) => name in SIDES || name.startsWith('side-edge-');

/** Corner grips of furniture and straight stairs: the two sides each one moves. */
const CORNERS = {
  'corner-rb': ['side-r', 'side-b'],
  'corner-rt': ['side-r', 'side-t'],
  'corner-lb': ['side-l', 'side-b'],
  'corner-lt': ['side-l', 'side-t'],
} as const;
type CornerName = keyof typeof CORNERS;

/** Whether `name` is a corner grip's handle name. */
export const isCornerGrip = (name: string) => name in CORNERS;

/**
 * The corner grips a selected item shows: furniture and straight stairs, whose corners can be
 * dragged with the opposite corner staying put. Columns keep their own size grip.
 */
export function cornerGrips(el: PlanElement): { name: string; at: Point }[] {
  if (el.locked || (el.type !== 'furniture' && el.type !== 'stair')) return [];
  const sides = placedSides(el);
  return (Object.keys(CORNERS) as CornerName[])
    .filter((name) => CORNERS[name].every((side) => sides.includes(side)))
    .map((name) => {
      const [x, y] = CORNERS[name];
      return {
        name,
        at: fromFurnitureLocal(el, { x: (SIDES[x][1] * el.w) / 2, y: (SIDES[y][1] * el.h) / 2 }),
      };
    });
}

/**
 * Drag the corner grip `name` of a furniture item or straight stair to `p`: the two sides at that
 * corner follow the pointer and the opposite corner stays. `round` rounds the new sizes.
 */
export function dragCorner(
  el: PlanElement,
  name: string,
  p: Point,
  round?: (size: number) => number,
): PlanElement | null {
  if (!(name in CORNERS) || !cornerGrips(el).some((g) => g.name === name)) return null;
  const [x, y] = CORNERS[name as CornerName];
  const across = dragSide(el, x, p, round);
  return across && dragSide(across, y, p, round);
}

/** A placed item made `size` across the axis of `name`, its opposite side where it was. */
function resizePlaced<T extends Placed>(el: T, name: SideName, size: number): T {
  const [axis, sign] = SIDES[name];
  let next: Placed;
  const made = Math.max(MIN_SIZE, size);
  if (el.type === 'stair') {
    if (axis === 'x') {
      const l = stairLayout({ ...el, width: made });
      next = { ...el, width: made, riserMm: l.riserMm, w: l.w, h: l.h };
    } else {
      // Along the climb: the same risers, with deeper or shallower treads.
      const treads = Math.max(1, stairLayout(el).risers - 1);
      const treadMm = Math.max(150, Math.round(((made / treads) * MM_PER_UNIT) / 5) * 5);
      const l = stairLayout({ ...el, treadMm });
      next = { ...el, treadMm, riserMm: l.riserMm, w: l.w, h: l.h };
    }
  } else if (el.type === 'column' && el.shape === 'round') next = { ...el, w: made, h: made };
  else next = axis === 'x' ? { ...el, w: made } : { ...el, h: made };
  const half = axis === 'x' ? el.w / 2 : el.h / 2;
  const fixed = -sign * half;
  const along = fixed + (sign * (axis === 'x' ? next.w : next.h)) / 2;
  const centre = fromFurnitureLocal(el, axis === 'x' ? { x: along, y: 0 } : { x: 0, y: along });
  return { ...next, x: centre.x, y: centre.y } as T;
}

/** An outline with edge `i` moved `d` out (in, for a negative `d`), its neighbours keeping their lines. */
function pushEdge<T extends Outlined>(el: T, i: number, d: number): T | null {
  const n = el.points.length;
  const dist = el.points.map((_, j) => (j === i ? -d : 0));
  const res = insetPolygon(el.points, dist);
  if (res.points.length !== n) return null;
  const start = res.edges.indexOf(0);
  if (start < 0 || res.edges.some((e, j) => e !== (j - start + n) % n)) return null;
  const points = res.points.map((_, j) => res.points[(j + start) % n]);
  return { ...el, points };
}

/** How deep an outline is behind its edge `i` (square to it): its size in that direction. */
function depthBehind(points: Point[], i: number): number {
  const a = points[i];
  const out = outward(points, i);
  return Math.max(...points.map((p) => (a.x - p.x) * out.x + (a.y - p.y) * out.y));
}

/**
 * Drag the side grip `name` of `el` to `p`: that side follows the pointer and the opposite side
 * stays. `round` rounds a placed item's new size (to 50 mm, say). Null when it can't go there.
 */
export function dragSide(
  el: PlanElement,
  name: string,
  p: Point,
  round?: (size: number) => number,
): PlanElement | null {
  if (isPlaced(el) && name in SIDES) {
    const side = name as SideName;
    const [axis, sign] = SIDES[side];
    const local = toFurnitureLocal(el, p);
    const half = axis === 'x' ? el.w / 2 : el.h / 2;
    const raw = sign * ((axis === 'x' ? local.x : local.y) + sign * half);
    return resizePlaced(el, side, round ? round(raw) : raw);
  }
  const i = edgeIndex(name);
  if (i === null || !isOutlined(el) || i >= el.points.length) return null;
  const a = el.points[i];
  const out = outward(el.points, i);
  const d = (p.x - a.x) * out.x + (p.y - a.y) * out.y;
  // Not so far in that the shape turns inside out.
  if (d <= -depthBehind(el.points, i) + MIN_SIZE) return null;
  return pushEdge(el, i, d);
}

function edgeIndex(name: string): number | null {
  if (!name.startsWith('side-edge-')) return null;
  const i = Number(name.slice('side-edge-'.length));
  return Number.isInteger(i) && i >= 0 ? i : null;
}

/** The size that the side grip `name` changes: an item's width or depth, or an outline's depth behind that side. */
export function sideSize(el: PlanElement, name: string): number | null {
  if (isPlaced(el) && name in SIDES) return SIDES[name as SideName][0] === 'x' ? el.w : el.h;
  const i = edgeIndex(name);
  if (i === null || !isOutlined(el) || i >= el.points.length) return null;
  return depthBehind(el.points, i);
}

/** Make the size the side grip `name` changes exactly `size`, moving only that side. */
export function setSideSize(el: PlanElement, name: string, size: number): PlanElement | null {
  if (!(size > 0)) return null;
  if (isPlaced(el) && name in SIDES) return resizePlaced(el, name as SideName, size);
  const i = edgeIndex(name);
  if (i === null || !isOutlined(el) || i >= el.points.length) return null;
  return pushEdge(el, i, size - depthBehind(el.points, i));
}

/**
 * A furniture item scaled `fx` across and `fy` up and down the plan: its width and depth grow by
 * how much its own sides line up with each (a turned item takes some of each).
 */
export function scaledSize(
  f: Pick<Furniture, 'w' | 'h' | 'rotation'>,
  fx: number,
  fy: number,
): { w: number; h: number } {
  const a = ((f.rotation ?? 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { w: f.w * Math.hypot(fx * c, fy * s), h: f.h * Math.hypot(fx * s, fy * c) };
}

/** The factors across and up and down for a factor `f` with the Scale tool set to `axis`. */
export const axisFactors = (f: number, axis: ScaleAxis): { x: number; y: number } =>
  axis === 'x' ? { x: f, y: 1 } : axis === 'y' ? { x: 1, y: f } : { x: f, y: f };

/**
 * Stretch taking in some of a furniture item's, column's or stair's corners: the sides with corners
 * in the box move by dx, dy (as seen along the item's own sides), the others stay. Null when no
 * corner is in the box; all four in, it just moves.
 */
export function stretchPlaced<T extends Placed>(el: T, inBox: (p: Point) => boolean, dx: number, dy: number): T | null {
  const hw = el.w / 2;
  const hh = el.h / 2;
  const corners = [
    { x: hw, y: hh },
    { x: hw, y: -hh },
    { x: -hw, y: hh },
    { x: -hw, y: -hh },
  ];
  // Stairs that can't be resized (L, U, curved, spiral) move when their middle is in the box, as before.
  if (!placedSides(el).length) return inBox(el) ? { ...el, x: el.x + dx, y: el.y + dy } : null;
  const inside = corners.map((c) => inBox(fromFurnitureLocal(el, c)));
  const count = inside.filter(Boolean).length;
  if (!count) return null;
  if (count === 4) return { ...el, x: el.x + dx, y: el.y + dy };
  const a = (-(el.rotation ?? 0) * Math.PI) / 180;
  const local = { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
  const right = inside[0] || inside[1];
  const left = inside[2] || inside[3];
  const front = inside[0] || inside[2];
  const back = inside[1] || inside[3];
  let next: T = el;
  const sides = placedSides(el);
  // A side moving with its opposite one too just moves the item that way.
  const shift = { x: right && left ? local.x : 0, y: front && back ? local.y : 0 };
  if (right !== left) {
    const name: SideName = right ? 'side-r' : 'side-l';
    if (sides.includes(name)) next = resizePlaced(next, name, next.w + (right ? local.x : -local.x));
  }
  if (front !== back) {
    const name: SideName = front ? 'side-b' : 'side-t';
    if (sides.includes(name)) next = resizePlaced(next, name, next.h + (front ? local.y : -local.y));
  }
  if (shift.x || shift.y) {
    const c = fromFurnitureLocal(next, shift);
    next = { ...next, x: c.x, y: c.y };
  }
  return next;
}

/** The column size set in Structure options. */
export interface ColumnSize {
  columnW: number;
  columnH: number;
  columnShape: 'rect' | 'round';
}

/**
 * An item at its usual size: library furniture at the library's width, depth and height, a column
 * at the Structure options' size (keeping its own shape). Same centre and angle. Unchanged for
 * anything else, or when it is that size already.
 */
export function resetElementSize(el: PlanElement, columns: ColumnSize): PlanElement {
  if (el.type === 'furniture' && el.kind) {
    const size = FURNITURE_CATALOG[el.kind];
    const w = u(size.w);
    const h = u(size.d);
    if (Math.abs(el.w - w) < 1e-6 && Math.abs(el.h - h) < 1e-6 && el.heightMm === undefined) return el;
    const next: Furniture = { ...el, w, h };
    delete next.heightMm;
    return next;
  }
  if (el.type === 'column') {
    const w = columns.columnW;
    const h = el.shape === 'round' ? columns.columnW : columns.columnH;
    if (Math.abs(el.w - w) < 1e-6 && Math.abs(el.h - h) < 1e-6) return el;
    return { ...el, w, h };
  }
  return el;
}

/** Whether Reset size can do anything for `el`: library furniture and columns. */
export const canResetSize = (el: PlanElement) => (el.type === 'furniture' && !!el.kind) || el.type === 'column';
