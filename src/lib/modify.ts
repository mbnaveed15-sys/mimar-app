/**
 * AutoCAD-style editing of walls: trim, extend, break, join, fillet, chamfer and offset, plus
 * mirror, scale and stretch for any selection. Everything here is pure: plan in, plan out.
 */
import { placeOnWall, wallParam } from '../geometry';
import {
  levelOf,
  type Bounds,
  type Id,
  type Opening,
  type PlanDoc,
  type PlanElement,
  type Point,
  type Room,
  type Wall,
} from '../types';
import { newId } from './ids';

const EPS = 1e-6;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number) => ({ x: a.x * k, y: a.y * k });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const len = (a: Point) => Math.hypot(a.x, a.y);
const start = (w: Wall): Point => ({ x: w.x1, y: w.y1 });
const end = (w: Wall): Point => ({ x: w.x2, y: w.y2 });
const at = (w: Wall, t: number): Point => ({ x: w.x1 + t * (w.x2 - w.x1), y: w.y1 + t * (w.y2 - w.y1) });
const withEnds = (w: Wall, a: Point, b: Point): Wall => ({ ...w, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
const wallsOf = (doc: PlanDoc) => doc.elements.filter((el): el is Wall => el.type === 'wall');
const isOpening = (el: PlanElement): el is Opening => el.type === 'door' || el.type === 'window';

/** Where segment a1–a2 meets segment b1–b2: t along a, u along b (each 0–1), or null. */
export function segmentHit(a1: Point, a2: Point, b1: Point, b2: Point, tol = EPS) {
  const r = sub(a2, a1);
  const s = sub(b2, b1);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const q = sub(b1, a1);
  const t = cross(q, s) / denom;
  const u = cross(q, r) / denom;
  const tt = tol / (len(r) || 1);
  const tu = tol / (len(s) || 1);
  if (t < -tt || t > 1 + tt || u < -tu || u > 1 + tu) return null;
  return { t, u };
}

/** Where the infinite lines through two walls cross, or null if they are parallel. */
export function lineCross(a: Wall, b: Wall): Point | null {
  const r = sub(end(a), start(a));
  const s = sub(end(b), start(b));
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS * len(r) * len(s)) return null;
  const t = cross(sub(start(b), start(a)), s) / denom;
  return at(a, t);
}

/** Points along a wall (0–1) where other walls cross it or end on it, in order. */
export function wallCuts(doc: PlanDoc, wall: Wall, tol: number): number[] {
  const ts: number[] = [];
  for (const other of wallsOf(doc)) {
    if (other.id === wall.id || levelOf(other) !== levelOf(wall)) continue;
    const hit = segmentHit(start(wall), end(wall), start(other), end(other), tol);
    if (hit && hit.t > EPS && hit.t < 1 - EPS) ts.push(hit.t);
  }
  ts.sort((a, b) => a - b);
  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-9);
}

/** An opening kept at its place on a changed wall, or null if it no longer fits there. */
function refit(o: Opening, wall: Wall): Opening | null {
  const L = len(sub(end(wall), start(wall)));
  const t = wallParam(wall, o);
  const half = o.width / 2;
  if (t * L < half - EPS || t * L > L - half + EPS) return null;
  return { ...o, wallId: wall.id, ...placeOnWall(wall, o, o.width) };
}

/**
 * Replace a wall by the pieces of it between the given ranges (0–1 along it). The first piece keeps
 * the wall's id; doors and windows move to the piece they sit on, or go if it was removed.
 */
export function keepPieces(doc: PlanDoc, wallId: Id, ranges: [number, number][]): PlanDoc {
  const wall = wallsOf(doc).find((w) => w.id === wallId);
  if (!wall) return doc;
  const pieces = ranges
    .filter(([a, b]) => b - a > EPS)
    .map(([a, b], i) => withEnds({ ...wall, id: i === 0 ? wall.id : newId() }, at(wall, a), at(wall, b)));
  const elements: PlanElement[] = [];
  for (const el of doc.elements) {
    if (el.id === wallId) {
      elements.push(...pieces);
    } else if (isOpening(el) && el.wallId === wallId) {
      const t = wallParam(wall, el);
      const i = ranges.findIndex(([a, b]) => t >= a - EPS && t <= b + EPS);
      const fitted = i >= 0 && pieces[i] ? refit(el, pieces[i]) : null;
      if (fitted) elements.push(fitted);
    } else {
      elements.push(el);
    }
  }
  return { ...doc, elements };
}

/** Trim: remove the piece of a wall between the crossings on either side of p (or the whole wall). */
export function trimAt(doc: PlanDoc, wallId: Id, p: Point, tol: number): PlanDoc {
  const wall = wallsOf(doc).find((w) => w.id === wallId);
  if (!wall) return doc;
  const cuts = wallCuts(doc, wall, tol);
  const t = Math.max(0, Math.min(1, wallParam(wall, p)));
  const before = cuts.filter((c) => c < t).pop() ?? 0;
  const after = cuts.find((c) => c > t) ?? 1;
  return keepPieces(doc, wallId, [
    [0, before],
    [after, 1],
  ]);
}

/** Break: split a wall at t1, or cut out the gap between t1 and t2. */
export function breakWall(doc: PlanDoc, wallId: Id, t1: number, t2 = t1): PlanDoc {
  const [a, b] = [Math.max(0, Math.min(t1, t2)), Math.min(1, Math.max(t1, t2))];
  return keepPieces(doc, wallId, [
    [0, a],
    [b, 1],
  ]);
}

/** Extend: lengthen a wall from its end nearest p until it meets another wall. Null if nothing is in the way. */
export function extendWall(doc: PlanDoc, wallId: Id, p: Point): PlanDoc | null {
  const wall = wallsOf(doc).find((w) => w.id === wallId);
  if (!wall) return null;
  const fromEnd = len(sub(p, end(wall))) <= len(sub(p, start(wall)));
  const tip = fromEnd ? end(wall) : start(wall);
  const dir = fromEnd ? sub(end(wall), start(wall)) : sub(start(wall), end(wall));
  const L = len(dir);
  const ray = add(tip, mul(dir, 1e4 / (L || 1)));
  let best: Point | null = null;
  let bestD = Infinity;
  for (const other of wallsOf(doc)) {
    if (other.id === wall.id || levelOf(other) !== levelOf(wall)) continue;
    const hit = segmentHit(tip, ray, start(other), end(other));
    if (!hit || hit.t * 1e4 < 1e-3) continue;
    const d = hit.t * 1e4;
    if (d < bestD) {
      bestD = d;
      best = add(tip, mul(dir, d / L));
    }
  }
  if (!best) return null;
  const next = fromEnd ? withEnds(wall, start(wall), best) : withEnds(wall, best, end(wall));
  return replaceWall(doc, wall, next);
}

/** Swap a wall for a changed copy, keeping its doors and windows where they are (or dropping them). */
function replaceWall(doc: PlanDoc, old: Wall, next: Wall): PlanDoc {
  return {
    ...doc,
    elements: doc.elements.flatMap((el) => {
      if (el.id === old.id) return [next];
      if (isOpening(el) && el.wallId === old.id) {
        const fitted = refit(el, next);
        return fitted ? [fitted] : [];
      }
      return [el];
    }),
  };
}

/** Join: two walls in a straight line become one. Null if they aren't in line with each other. */
export function joinWalls(doc: PlanDoc, idA: Id, idB: Id, tol: number): PlanDoc | null {
  const a = wallsOf(doc).find((w) => w.id === idA);
  const b = wallsOf(doc).find((w) => w.id === idB);
  if (!a || !b || a.id === b.id) return null;
  const dir = sub(end(a), start(a));
  const L = len(dir);
  const u = mul(dir, 1 / L);
  const off = (p: Point) => Math.abs(cross(u, sub(p, start(a))));
  const parallel = Math.abs(cross(u, sub(end(b), start(b)))) / len(sub(end(b), start(b))) < 0.01;
  if (!parallel || off(start(b)) > tol || off(end(b)) > tol) return null;
  const ts = [0, L, dot(sub(start(b), start(a)), u), dot(sub(end(b), start(a)), u)];
  const merged = withEnds(a, add(start(a), mul(u, Math.min(...ts))), add(start(a), mul(u, Math.max(...ts))));
  const elements = doc.elements
    .filter((el) => el.id !== b.id)
    .map((el) => {
      if (el.id === a.id) return merged;
      if (isOpening(el) && (el.wallId === a.id || el.wallId === b.id))
        return refit({ ...el, wallId: a.id }, merged) ?? el;
      return el;
    });
  return { ...doc, elements };
}

/** The part of a wall on the picked side of the corner point c: [far end, direction towards c]. */
function keptSide(w: Wall, c: Point, pick: Point): { far: Point; toCorner: Point; ends: (p: Point) => Wall } {
  const tc = wallParam(w, c);
  const tp = wallParam(w, pick);
  const keepStart = tp < tc;
  const far = keepStart ? start(w) : end(w);
  // The new corner point replaces whichever end was cut off, so the wall keeps its direction.
  return { far, toCorner: sub(c, far), ends: (p) => (keepStart ? withEnds(w, far, p) : withEnds(w, p, far)) };
}

/**
 * Fillet: make two walls meet in a clean corner, keeping the parts that were clicked. With a radius,
 * the corner is rounded with short wall pieces.
 */
export function filletWalls(doc: PlanDoc, idA: Id, pickA: Point, idB: Id, pickB: Point, radius = 0): PlanDoc | null {
  const a = wallsOf(doc).find((w) => w.id === idA);
  const b = wallsOf(doc).find((w) => w.id === idB);
  if (!a || !b || a.id === b.id) return null;
  const c = lineCross(a, b);
  if (!c) return null;
  const A = keptSide(a, c, pickA);
  const B = keptSide(b, c, pickB);
  if (radius <= 0) {
    return replaceWall(replaceWall(doc, a, A.ends(c)), b, B.ends(c));
  }
  // Tangent points sit back from the corner by r / tan(θ/2), where θ is the angle between the walls.
  const ua = mul(A.toCorner, 1 / len(A.toCorner));
  const ub = mul(B.toCorner, 1 / len(B.toCorner));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(mul(ua, -1), mul(ub, -1)))));
  const back = radius / Math.tan(theta / 2);
  if (back >= len(A.toCorner) || back >= len(B.toCorner)) return null;
  const ta = sub(c, mul(ua, back));
  const tb = sub(c, mul(ub, back));
  const bis = add(mul(ua, -1), mul(ub, -1));
  const centre = add(c, mul(bis, radius / Math.sin(theta / 2) / len(bis)));
  const a0 = Math.atan2(ta.y - centre.y, ta.x - centre.x);
  let sweep = Math.atan2(tb.y - centre.y, tb.x - centre.x) - a0;
  if (sweep > Math.PI) sweep -= 2 * Math.PI;
  if (sweep < -Math.PI) sweep += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(sweep) * 180) / Math.PI / 15));
  const arc: Point[] = Array.from({ length: steps + 1 }, (_, i) => {
    const ang = a0 + (sweep * i) / steps;
    return { x: centre.x + radius * Math.cos(ang), y: centre.y + radius * Math.sin(ang) };
  });
  let next = replaceWall(replaceWall(doc, a, A.ends(ta)), b, B.ends(tb));
  const pieces = arc.slice(0, -1).map((p, i) => withEnds({ ...a, id: newId(), material: a.material }, p, arc[i + 1]));
  next = { ...next, elements: [...next.elements, ...pieces] };
  return next;
}

/** Chamfer: cut the corner of two walls with an angled wall, d1 back along the first and d2 along the second. */
export function chamferWalls(
  doc: PlanDoc,
  idA: Id,
  pickA: Point,
  idB: Id,
  pickB: Point,
  d1: number,
  d2: number,
): PlanDoc | null {
  const a = wallsOf(doc).find((w) => w.id === idA);
  const b = wallsOf(doc).find((w) => w.id === idB);
  if (!a || !b || a.id === b.id) return null;
  const c = lineCross(a, b);
  if (!c) return null;
  const A = keptSide(a, c, pickA);
  const B = keptSide(b, c, pickB);
  if (d1 >= len(A.toCorner) || d2 >= len(B.toCorner)) return null;
  const pa = sub(c, mul(A.toCorner, d1 / len(A.toCorner)));
  const pb = sub(c, mul(B.toCorner, d2 / len(B.toCorner)));
  const next = replaceWall(replaceWall(doc, a, A.ends(pa)), b, B.ends(pb));
  return { ...next, elements: [...next.elements, withEnds({ ...a, id: newId() }, pa, pb)] };
}

/** Offset: a parallel copy of a wall, `dist` away on the side of `side`. */
export function offsetWall(wall: Wall, dist: number, side: Point): Wall {
  const d = sub(end(wall), start(wall));
  let n = { x: -d.y / len(d), y: d.x / len(d) };
  if (dot(n, sub(side, start(wall))) < 0) n = mul(n, -1);
  const shift = mul(n, dist);
  return withEnds(
    { ...wall, id: newId(), groupId: undefined, defKey: undefined },
    add(start(wall), shift),
    add(end(wall), shift),
  );
}

/** Distance from a wall's line to p (for a live offset preview). */
export function distanceToLine(wall: Wall, p: Point): number {
  const d = sub(end(wall), start(wall));
  return Math.abs(cross(d, sub(p, start(wall)))) / len(d);
}

/** Reflect p across the line through a and b. */
export function reflect(p: Point, a: Point, b: Point): Point {
  const d = sub(b, a);
  const t = dot(sub(p, a), d) / dot(d, d);
  const foot = add(a, mul(d, t));
  return sub(mul(foot, 2), p);
}

/** Items that move with walls: their doors and windows. */
function withOpenings(doc: PlanDoc, ids: Id[]): Set<Id> {
  const set = new Set(ids);
  for (const el of doc.elements) if (isOpening(el) && set.has(el.wallId)) set.add(el.id);
  return set;
}

/**
 * Mirror items across the line a–b. By default the mirrored items are copies (the originals stay);
 * with `flip` the originals are flipped in place. Returns the new plan and the mirrored items' ids.
 */
export function mirrorItems(doc: PlanDoc, ids: Id[], a: Point, b: Point, flip: boolean): { doc: PlanDoc; ids: Id[] } {
  const set = withOpenings(doc, ids);
  const lineDeg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const idMap = new Map<Id, Id>([...set].map((id) => [id, flip ? id : newId()]));
  const mirrored = new Map<Id, PlanElement>();
  for (const el of doc.elements) {
    if (!set.has(el.id) || isOpening(el)) continue;
    const id = idMap.get(el.id)!;
    const fresh = flip ? {} : { groupId: undefined, defKey: undefined };
    if (el.type === 'wall') {
      // Swap the ends so the wall still runs the same way round a room.
      mirrored.set(el.id, withEnds({ ...el, ...fresh, id }, reflect(end(el), a, b), reflect(start(el), a, b)));
    } else if (el.type === 'beam') {
      const p1 = reflect({ x: el.x1, y: el.y1 }, a, b);
      const p2 = reflect({ x: el.x2, y: el.y2 }, a, b);
      mirrored.set(el.id, { ...el, ...fresh, id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    } else if (el.type === 'slab' || el.type === 'plot') {
      mirrored.set(el.id, { ...el, ...fresh, id, points: el.points.map((p) => reflect(p, a, b)).reverse() });
    } else {
      const p = reflect(el, a, b);
      mirrored.set(el.id, {
        ...el,
        ...fresh,
        id,
        x: p.x,
        y: p.y,
        rotation: (((2 * lineDeg - (el.rotation ?? 0)) % 360) + 360) % 360,
      });
    }
  }
  for (const el of doc.elements) {
    if (!set.has(el.id) || !isOpening(el)) continue;
    const wall = mirrored.get(el.wallId) as Wall | undefined;
    if (!wall) continue;
    const p = reflect(el, a, b);
    mirrored.set(el.id, {
      ...el,
      id: idMap.get(el.id)!,
      wallId: wall.id,
      ...placeOnWall(wall, p, el.width),
      flipHinge: !el.flipHinge,
      ...(flip ? {} : { groupId: undefined, defKey: undefined }),
    });
  }
  const rooms = doc.rooms
    .filter((r) => set.has(r.id))
    .map((r): Room => ({ ...r, id: idMap.get(r.id)!, points: r.points.map((p) => reflect(p, a, b)).reverse() }));
  const outIds = [...mirrored.values(), ...rooms].map((it) => it.id);
  if (flip) {
    return {
      doc: {
        ...doc,
        elements: doc.elements.map((el) => mirrored.get(el.id) ?? el),
        rooms: doc.rooms.map((r) => rooms.find((x) => x.id === r.id) ?? r),
      },
      ids: outIds,
    };
  }
  return {
    doc: { ...doc, elements: [...doc.elements, ...mirrored.values()], rooms: [...doc.rooms, ...rooms] },
    ids: outIds,
  };
}

/** Scale items about `base` by `factor`. Wall thickness and door and window widths stay the same. */
export function scaleItems(doc: PlanDoc, ids: Id[], base: Point, factor: number): PlanDoc {
  if (!(factor > 0) || factor === 1) return doc;
  const set = withOpenings(doc, ids);
  const sc = (p: Point) => add(base, mul(sub(p, base), factor));
  const walls = new Map<Id, Wall>();
  const elements = doc.elements.map((el) => {
    if (!set.has(el.id) || isOpening(el)) return el;
    if (el.type === 'wall') {
      const w = withEnds(el, sc(start(el)), sc(end(el)));
      walls.set(w.id, w);
      return w;
    }
    if (el.type === 'beam') {
      const p1 = sc({ x: el.x1, y: el.y1 });
      const p2 = sc({ x: el.x2, y: el.y2 });
      return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    if (el.type === 'slab' || el.type === 'plot') return { ...el, points: el.points.map(sc) };
    const p = sc(el);
    // Furniture scales; columns and stairs keep their (structural) size.
    return el.type === 'furniture'
      ? { ...el, x: p.x, y: p.y, w: el.w * factor, h: el.h * factor }
      : { ...el, x: p.x, y: p.y };
  });
  return {
    ...doc,
    elements: elements.flatMap((el) => {
      if (!isOpening(el) || !set.has(el.id)) return [el];
      const wall = walls.get(el.wallId);
      if (!wall) return [el];
      return [{ ...el, ...placeOnWall(wall, sc(el), el.width) }];
    }),
    rooms: doc.rooms.map((r) => (set.has(r.id) ? { ...r, points: r.points.map(sc) } : r)),
  };
}

const inBox = (p: Point, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/**
 * Stretch: move everything inside the box by dx, dy. Walls with one end in the box stretch; walls
 * and items fully inside move; doors and windows inside the box move along their wall.
 */
export function stretchItems(doc: PlanDoc, box: Bounds, dx: number, dy: number): PlanDoc {
  if (!dx && !dy) return doc;
  const move = (p: Point) => (inBox(p, box) ? { x: p.x + dx, y: p.y + dy } : p);
  const walls = new Map<Id, Wall>();
  const elements = doc.elements.map((el) => {
    if (el.type === 'wall') {
      const w = withEnds(el, move(start(el)), move(end(el)));
      walls.set(w.id, w);
      return w;
    }
    if (el.type === 'furniture' || el.type === 'column' || el.type === 'stair')
      return inBox(el, box) ? { ...el, x: el.x + dx, y: el.y + dy } : el;
    if (el.type === 'beam') {
      const p1 = move({ x: el.x1, y: el.y1 });
      const p2 = move({ x: el.x2, y: el.y2 });
      return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    }
    if (el.type === 'slab' || el.type === 'plot') return { ...el, points: el.points.map(move) };
    return el;
  });
  return {
    ...doc,
    elements: elements.flatMap((el): PlanElement[] => {
      if (!isOpening(el)) return [el];
      const wall = walls.get(el.wallId);
      if (!wall) return [el];
      return [{ ...el, ...placeOnWall(wall, move(el), el.width) }];
    }),
    rooms: doc.rooms.map((r) => ({ ...r, points: r.points.map(move) })),
  };
}
