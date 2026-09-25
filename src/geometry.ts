import type { Bounds, Mask, Opening, PlanElement, Point, Wall } from './types';

/** Anything placed by its centre, with a size and an optional rotation (furniture, columns). */
type Placed = { x: number; y: number; rotation?: number };

/** 9" in plan units; duplicated from walls.ts to avoid a circular import. */
const DEFAULT_THICKNESS = 22.86;

export function snap(p: Point, grid: number): Point {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
}

export function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const C = b.x - a.x;
  const D = b.y - a.y;
  const lenSq = C * C + D * D;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * C + (p.y - a.y) * D) / lenSq));
  return Math.hypot(p.x - (a.x + t * C), p.y - (a.y + t * D));
}

/** Ray-casting point-in-polygon test. */
export function pointInPolygon(pt: Point, vs: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x,
      yi = vs[i].y,
      xj = vs[j].x,
      yj = vs[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function openingEndpoints(o: Opening): [Point, Point] {
  const a = (o.angle * Math.PI) / 180;
  const dx = (Math.cos(a) * o.width) / 2;
  const dy = (Math.sin(a) * o.width) / 2;
  return [
    { x: o.x - dx, y: o.y - dy },
    { x: o.x + dx, y: o.y + dy },
  ];
}

/** Average of a polygon's corners. */
export function centroid(points: Point[]): Point {
  const n = points.length || 1;
  return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
}

export function elementCenter(el: PlanElement): Point {
  if (el.type === 'wall' || el.type === 'beam') return { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
  if (el.type === 'slab' || el.type === 'plot') return centroid(el.points);
  return { x: el.x, y: el.y };
}

export function isNear(el: PlanElement, p: Point, threshold: number): boolean {
  switch (el.type) {
    case 'wall': {
      // Anywhere on the wall's thickness counts, as well as near its centre line.
      const reach = Math.max(threshold, (el.thickness ?? DEFAULT_THICKNESS) / 2);
      return pointToSegmentDistance(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < reach;
    }
    case 'furniture':
    case 'column':
    case 'stair': {
      const local = toFurnitureLocal(el, p);
      if (el.type === 'column' && el.shape === 'round') return Math.hypot(local.x, local.y) <= el.w / 2 + threshold / 2;
      return Math.abs(local.x) <= el.w / 2 && Math.abs(local.y) <= el.h / 2;
    }
    case 'beam':
      return (
        pointToSegmentDistance(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < Math.max(threshold, el.width / 2)
      );
    case 'slab':
    case 'plot': {
      // A slab is picked by its edge, so rooms and furniture on it stay clickable.
      return el.points.some((a, i) => pointToSegmentDistance(p, a, el.points[(i + 1) % el.points.length]) < threshold);
    }
    case 'door':
    case 'window': {
      const [a, b] = openingEndpoints(el);
      return pointToSegmentDistance(p, a, b) < threshold;
    }
  }
}

/** Topmost (last drawn) element near the point, or null. */
export function findElementNear(elements: PlanElement[], p: Point, threshold: number): PlanElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (isNear(elements[i], p, threshold)) return elements[i];
  }
  return null;
}

export function nearestWall(elements: PlanElement[], p: Point, maxDistance: number): Wall | null {
  let best: Wall | null = null;
  let bestD = maxDistance;
  for (const el of elements) {
    if (el.type !== 'wall') continue;
    const d = pointToSegmentDistance(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
    if (d < bestD) {
      best = el;
      bestD = d;
    }
  }
  return best;
}

/**
 * Centre an opening of the given width on the wall at the point nearest p,
 * clamped so it stays within the wall. The width is capped at the wall length.
 */
export function placeOnWall(
  wall: Wall,
  p: Point,
  width: number,
): { x: number; y: number; angle: number; width: number } {
  const C = wall.x2 - wall.x1;
  const D = wall.y2 - wall.y1;
  const len = Math.hypot(C, D);
  const w = Math.min(width, len);
  const half = w / 2 / len;
  const t = Math.max(half, Math.min(1 - half, ((p.x - wall.x1) * C + (p.y - wall.y1) * D) / (len * len)));
  return { x: wall.x1 + t * C, y: wall.y1 + t * D, angle: (Math.atan2(D, C) * 180) / Math.PI, width: w };
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Point p in the furniture's own frame (origin at its centre, unrotated). */
export function toFurnitureLocal(f: Placed, p: Point): Point {
  const a = -rad(f.rotation ?? 0);
  const dx = p.x - f.x;
  const dy = p.y - f.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}

/** A point given in the furniture's own frame, in plan coordinates. */
export function fromFurnitureLocal(f: Placed, local: Point): Point {
  const a = rad(f.rotation ?? 0);
  return {
    x: f.x + local.x * Math.cos(a) - local.y * Math.sin(a),
    y: f.y + local.x * Math.sin(a) + local.y * Math.cos(a),
  };
}

/** Position of p along the wall: 0 at the start, 1 at the end. */
export function wallParam(wall: Wall, p: Point): number {
  const C = wall.x2 - wall.x1;
  const D = wall.y2 - wall.y1;
  const lenSq = C * C + D * D;
  return lenSq === 0 ? 0 : ((p.x - wall.x1) * C + (p.y - wall.y1) * D) / lenSq;
}

/** Keep an opening at the same relative position after its wall moved or changed length. */
export function reattachOpening(opening: Opening, oldWall: Wall, newWall: Wall): Opening {
  const t = wallParam(oldWall, opening);
  const p = { x: newWall.x1 + t * (newWall.x2 - newWall.x1), y: newWall.y1 + t * (newWall.y2 - newWall.y1) };
  return { ...opening, ...placeOnWall(newWall, p, opening.width) };
}

/** Wall with the same start point and direction but a new length. */
export function withWallLength(wall: Wall, length: number): Wall {
  const len = wallLength(wall);
  const ux = len ? (wall.x2 - wall.x1) / len : 1;
  const uy = len ? (wall.y2 - wall.y1) / len : 0;
  return { ...wall, x2: wall.x1 + ux * length, y2: wall.y1 + uy * length };
}

export function translateElement<T extends PlanElement>(el: T, dx: number, dy: number): T {
  if (el.type === 'wall' || el.type === 'beam')
    return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  if (el.type === 'slab' || el.type === 'plot')
    return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  return { ...el, x: el.x + dx, y: el.y + dy };
}

/** Turn p about centre c by the given degrees (clockwise on screen, as y points down). */
export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** Turn any plan item about centre c. */
export function rotateElement<T extends PlanElement>(el: T, c: Point, degrees: number): T {
  if (el.type === 'wall' || el.type === 'beam') {
    const a = rotatePoint({ x: el.x1, y: el.y1 }, c, degrees);
    const b = rotatePoint({ x: el.x2, y: el.y2 }, c, degrees);
    return { ...el, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  }
  if (el.type === 'slab' || el.type === 'plot')
    return { ...el, points: el.points.map((p) => rotatePoint(p, c, degrees)) };
  if (el.type === 'furniture' || el.type === 'column' || el.type === 'stair') {
    const p = rotatePoint({ x: el.x, y: el.y }, c, degrees);
    return { ...el, x: p.x, y: p.y, rotation: ((((el.rotation ?? 0) + degrees) % 360) + 360) % 360 };
  }
  const p = rotatePoint({ x: el.x, y: el.y }, c, degrees);
  return { ...el, x: p.x, y: p.y, angle: el.angle + degrees };
}

/** Corner points of an item, for its extent on the plan. */
export function elementOutline(el: PlanElement): Point[] {
  return elementPoints(el);
}

function elementPoints(el: PlanElement): Point[] {
  switch (el.type) {
    case 'wall':
    case 'beam':
      return [
        { x: el.x1, y: el.y1 },
        { x: el.x2, y: el.y2 },
      ];
    case 'slab':
    case 'plot':
      return el.points;
    case 'furniture':
    case 'column':
    case 'stair':
      return [
        { x: -el.w / 2, y: -el.h / 2 },
        { x: el.w / 2, y: -el.h / 2 },
        { x: el.w / 2, y: el.h / 2 },
        { x: -el.w / 2, y: el.h / 2 },
      ].map((c) => fromFurnitureLocal(el, c));
    case 'door':
    case 'window':
      // A door's swing reaches one width away from the wall.
      return [
        { x: el.x - el.width, y: el.y - el.width },
        { x: el.x + el.width, y: el.y + el.width },
      ];
  }
}

/** Smallest box around everything in the plan, or null if it is empty. */
export function planBounds(elements: PlanElement[], masks: Mask[]): Bounds | null {
  const pts = [...elements.flatMap(elementPoints), ...masks.flatMap((m) => m.points)];
  if (!pts.length) return null;
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}

/** Nearest wall end point within maxDistance of p, for snapping walls together. */
export function nearestWallEnd(
  elements: PlanElement[],
  p: Point,
  maxDistance: number,
  ignoreId?: string,
): Point | null {
  let best: Point | null = null;
  let bestD = maxDistance;
  for (const el of elements) {
    if (el.type !== 'wall' || el.id === ignoreId) continue;
    for (const q of [
      { x: el.x1, y: el.y1 },
      { x: el.x2, y: el.y2 },
    ]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) {
        best = q;
        bestD = d;
      }
    }
  }
  return best;
}
