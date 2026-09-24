import type { Opening, PlanElement, Point, Wall } from './types';

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

export function elementCenter(el: PlanElement): Point {
  if (el.type === 'wall') return { x: (el.x1 + el.x2) / 2, y: (el.y1 + el.y2) / 2 };
  return { x: el.x, y: el.y };
}

export function isNear(el: PlanElement, p: Point, threshold: number): boolean {
  switch (el.type) {
    case 'wall':
      return pointToSegmentDistance(p, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < threshold;
    case 'furniture':
      return Math.abs(p.x - el.x) <= el.w / 2 && Math.abs(p.y - el.y) <= el.h / 2;
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
