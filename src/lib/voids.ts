/**
 * Double-height spaces: a room marked open to above leaves the floor over it open. The slab over it
 * has a void, the floor above shows the void crossed through, and quantities leave it out. Pure.
 */
import { elementOutline, pointInPolygon } from '../geometry';
import { buildingLevels } from './levels';
import { visibleShapes } from './itemShape';
import { joinOutlines } from './slabOutline';
import { polygonArea } from '../rooms';
import { levelOf, type Id, type PlanDoc, type Point, type Room, type Stair } from '../types';

/** The floor above this one, if there is one (the Ground (site) level isn't a floor of the building). */
export function levelAbove(doc: Pick<PlanDoc, 'levels'>, levelId: Id): Id | null {
  const levels = buildingLevels(doc);
  const i = levels.findIndex((l) => l.id === levelId);
  return i >= 0 && i + 1 < levels.length ? levels[i + 1].id : null;
}

/** The floor below this one, if there is one (the Ground (site) level isn't a floor of the building). */
export function levelBelow(doc: Pick<PlanDoc, 'levels'>, levelId: Id): Id | null {
  const levels = buildingLevels(doc);
  const i = levels.findIndex((l) => l.id === levelId);
  return i > 0 ? levels[i - 1].id : null;
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

/** A stair climbing at least this far (mm) goes up a whole floor: one up to the plinth doesn't. */
const FLOOR_CLIMB_MM = 1500;

/** The opening a stair needs in the floor above: its own outline (an L, a circle), or its footprint. */
function stairHole(st: Stair): Point[] {
  if (st.shape === 'straight' || st.shape === 'U' || st.shape === 'ramp') return elementOutline(st);
  const joined = joinOutlines(visibleShapes(st, []));
  const biggest = joined.reduce<Point[] | null>(
    (best, j) => (!best || polygonArea(j.outline) > polygonArea(best) ? j.outline : best),
    null,
  );
  return biggest ?? elementOutline(st);
}

/**
 * Stairwells: each stair on this floor that climbs to the floor above cuts its own opening in the
 * slab over it. Worked out from the stairs as they are, so an opening follows its stair's shape and
 * closes again when the stair goes. As rooms (open to above), with ids `stair-<id>`.
 */
export function stairOpenings(doc: Pick<PlanDoc, 'levels' | 'elements'>, levelId: Id): Room[] {
  if (!levelAbove(doc, levelId)) return [];
  return doc.elements
    .filter(
      (el): el is Stair => el.type === 'stair' && !el.hidden && levelOf(el) === levelId && el.riseMm >= FLOOR_CLIMB_MM,
    )
    .map((st) => ({ id: `stair-${st.id}`, name: 'Stair opening', points: stairHole(st), levelId }));
}

/** Everything left open in the slab over this floor: double-height rooms and stairwells. */
export function slabVoids(doc: Pick<PlanDoc, 'levels' | 'rooms' | 'elements'>, levelId: Id): Room[] {
  const open = openRooms(doc, levelId);
  // A stair in a room already open to the floor above (a stairwell drawn as a room) needs no hole of its own.
  const stairs = stairOpenings(doc, levelId).filter((h) => !open.some((r) => within(h.points, r.points)));
  return [...open, ...stairs];
}

/** Everything open in this floor's own floor: double-height rooms and stairwells from the floor below. */
export function floorVoids(doc: Pick<PlanDoc, 'levels' | 'rooms' | 'elements'>, levelId: Id): Room[] {
  const below = levelBelow(doc, levelId);
  return below ? slabVoids(doc, below) : [];
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

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Whether an outline is convex (either way round). */
export function isConvex(pts: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const c = cross(pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length]);
    if (Math.abs(c) < 1e-9) continue;
    if (sign && Math.sign(c) !== sign) return false;
    sign = Math.sign(c);
  }
  return true;
}

/**
 * The part of `subject` inside a convex outline `clip` (Sutherland–Hodgman), or null when they don't overlap.
 * A room's floor gets the part of a stairwell over it as a hole, when the stairwell lies under two rooms.
 */
export function clipToConvex(subject: Point[], clip: Point[]): Point[] | null {
  const ccw = clip.reduce((a, p, i) => a + cross(clip[0], p, clip[(i + 1) % clip.length]), 0) > 0;
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const inside = (p: Point) => (ccw ? cross(a, b, p) : -cross(a, b, p)) >= -1e-9;
    const cut = (p: Point, q: Point): Point => {
      const dp = cross(a, b, p);
      const dq = cross(a, b, q);
      const t = dp / (dp - dq);
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j];
      const q = input[(j + 1) % input.length];
      if (inside(q)) {
        if (!inside(p)) out.push(cut(p, q));
        out.push(q);
      } else if (inside(p)) out.push(cut(p, q));
    }
  }
  if (out.length < 3) return null;
  const area = Math.abs(out.reduce((a, p, i) => a + cross(out[0], p, out[(i + 1) % out.length]), 0)) / 2;
  return area > 1e-6 ? out : null;
}
