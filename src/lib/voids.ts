/**
 * Double-height spaces: a room marked open to above leaves the floor over it open. The slab over it
 * has a void, the floor above shows the void crossed through, and quantities leave it out. Pure.
 */
import { pointInPolygon } from '../geometry';
import { polygonArea } from '../rooms';
import { levelOf, type Id, type PlanDoc, type Point, type Room } from '../types';

/** The floor above this one, if there is one. */
export function levelAbove(doc: Pick<PlanDoc, 'levels'>, levelId: Id): Id | null {
  const i = doc.levels.findIndex((l) => l.id === levelId);
  return i >= 0 && i + 1 < doc.levels.length ? doc.levels[i + 1].id : null;
}

/** The floor below this one, if there is one. */
export function levelBelow(doc: Pick<PlanDoc, 'levels'>, levelId: Id): Id | null {
  const i = doc.levels.findIndex((l) => l.id === levelId);
  return i > 0 ? doc.levels[i - 1].id : null;
}

/** Rooms on this floor that are open to the floor above (none on the top floor). */
export function openRooms(doc: Pick<PlanDoc, 'levels' | 'rooms'>, levelId: Id): Room[] {
  if (!levelAbove(doc, levelId)) return [];
  return doc.rooms.filter((r) => r.openAbove && !r.hidden && levelOf(r) === levelId && r.points.length >= 3);
}

/** The voids in this floor's own floor: the double-height rooms on the floor below, reaching up through it. */
export function voidsOver(doc: Pick<PlanDoc, 'levels' | 'rooms'>, levelId: Id): Room[] {
  const below = levelBelow(doc, levelId);
  return below ? openRooms(doc, below) : [];
}

/** Whether the outline lies wholly inside the other (its corners inside or on it). */
export function within(inner: Point[], outer: Point[]): boolean {
  const c = inner.reduce((m, p) => ({ x: m.x + p.x / inner.length, y: m.y + p.y / inner.length }), { x: 0, y: 0 });
  // A hair towards its own middle, so corners on the other's edge count as inside.
  return inner.every((p) => {
    const q = { x: p.x + (c.x - p.x) * 1e-4, y: p.y + (c.y - p.y) * 1e-4 };
    return pointInPolygon(q, outer);
  });
}

/** Whether two outlines overlap by more than touching: a corner of one well inside the other, or edges crossing. */
export function overlaps(a: Point[], b: Point[]): boolean {
  const inside = (p: Point, poly: Point[]) => pointInPolygon(p, poly) && !onEdge(p, poly);
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return true;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++)
      if (properCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
  // The same outline, or one inside the other with every corner on its edge.
  const mid = (pts: Point[]) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  });
  return pointInPolygon(mid(a), b) && pointInPolygon(mid(b), a);
}

const EDGE = 0.5;

function onEdge(p: Point, poly: Point[]): boolean {
  return poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y) <= EDGE;
  });
}

/** Two segments crossing at a point inside both (not at an end). */
function properCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  const e = 1e-6 * (Math.abs(d1) + Math.abs(d2) + Math.abs(d3) + Math.abs(d4) + 1);
  return ((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e));
}

/** The area (plan units²) of the voids in this floor's own floor. */
export const voidAreaOver = (doc: Pick<PlanDoc, 'levels' | 'rooms'>, levelId: Id): number =>
  voidsOver(doc, levelId).reduce((s, r) => s + polygonArea(r.points), 0);
