/**
 * AutoCAD-style editing of walls: trim, extend, break, join, fillet, chamfer and offset, plus
 * mirror, scale and stretch for any selection. Everything here is pure: plan in, plan out.
 */
import { scaledSize, stretchPlaced } from './resize';
import { mapOutline, placeOnWall, wallParam } from '../geometry';
import {
  arcOf,
  directionAlong,
  distanceToWall,
  isArc,
  offsetWall as offsetArc,
  partOf,
  projectOnWall,
  reversed as reversedArc,
  runLength,
  wallSegments,
  type WallLine,
} from './arc';
import { carrierOf, crossings, footOn, fractionOn, offsetCarrier, sameCarrier, segThrough, withEndAt } from './curves';
import { doorSides, flipsFor } from './openingPlace';
import { thicknessOf } from '../walls';
import {
  hasPoints,
  levelOf,
  type Bounds,
  type Id,
  type Opening,
  type PlanDoc,
  type PlanElement,
  type Point,
  type Room,
  type SketchLine,
  type Wall as WallItem,
} from '../types';
import { newId } from './ids';
import { mapDimension } from './dimLine';
import { remapTies } from './dimensions';

const EPS = 1e-6;
const TAU = Math.PI * 2;
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
/**
 * The straight items the AutoCAD-style tools work on: walls and layout lines alike (only walls
 * carry doors and windows). Lines cut and bound walls in Trim and Extend, and walls cut lines.
 */
type Wall = WallItem | SketchLine;
const wallsOf = (doc: PlanDoc) => doc.elements.filter((el): el is Wall => el.type === 'wall' || el.type === 'line');
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
  const curved = (w: Wall) => isArc(w);
  for (const other of wallsOf(doc)) {
    if (other.id === wall.id || levelOf(other) !== levelOf(wall)) continue;
    if (!curved(wall) && !curved(other)) {
      const hit = segmentHit(start(wall), end(wall), start(other), end(other), tol);
      if (hit && hit.t > EPS && hit.t < 1 - EPS) ts.push(hit.t);
      continue;
    }
    // A curved wall: where the short straight pieces of the two cross, as a place along this wall.
    for (const [a1, a2] of wallSegments(wall))
      for (const [b1, b2] of wallSegments(other)) {
        const hit = segmentHit(a1, a2, b1, b2, tol);
        if (!hit) continue;
        const t = wallParam(wall, add(a1, mul(sub(a2, a1), hit.t)));
        if (t > EPS && t < 1 - EPS) ts.push(t);
      }
  }
  ts.sort((a, b) => a - b);
  return ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-9);
}

/** An opening kept at its place on a changed wall, or null if it no longer fits there. */
function refit(o: Opening, wall: Wall): Opening | null {
  const L = runLength(wall);
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
    .map(([a, b], i) => partOf({ ...wall, id: i === 0 ? wall.id : newId() }, a, b));
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

/**
 * Extend: lengthen a wall from its end nearest p until it meets another wall (a curved wall carries
 * on round its circle). Null if nothing is in the way.
 */
export function extendWall(doc: PlanDoc, wallId: Id, p: Point): PlanDoc | null {
  const wall = wallsOf(doc).find((w) => w.id === wallId);
  if (!wall) return null;
  const fromEnd = len(sub(p, end(wall))) <= len(sub(p, start(wall)));
  // The far end stays; the near end moves out along the wall's line or circle.
  const keepStart = fromEnd;
  const own = carrierOf(wall);
  const arc = arcOf(wall);
  const L = runLength(wall);
  let best: Point | null = null;
  let bestU = Infinity;
  for (const other of wallsOf(doc)) {
    if (other.id === wall.id || levelOf(other) !== levelOf(wall)) continue;
    for (const h of crossings(own, carrierOf(other))) {
      if (!onPiece(other, h)) continue;
      const u = fromKept(wall, keepStart, h);
      // Past the moving end (by at least a millimetre or so), and short of a whole circle.
      if (u * L <= 0.1 + L || (arc && u * Math.abs(arc.sweep) >= Math.PI * 2 - 0.01)) continue;
      if (u < bestU) {
        bestU = u;
        best = h;
      }
    }
  }
  if (!best) return null;
  return replaceWall(doc, wall, withEndAt(wall, keepStart ? 'start' : 'end', best));
}

/** Whether a point on a wall's line or circle lies on the wall itself (within a millimetre). */
function onPiece(w: Wall, p: Point): boolean {
  const t = fractionOn(w, p);
  const L = runLength(w) || 1;
  if (t >= -0.1 / L && t <= 1 + 0.1 / L) return true;
  // Just before the start of a curve counts too.
  return isArc(w) && -fractionOn(w, p, true) * L <= 0.1;
}

/**
 * How far along a wall p is, as a fraction of the wall, counted from the end that is kept
 * (its start, or its end) going into the wall: past 1 is beyond the other end (round the circle
 * for a curved wall), below 0 behind the kept end (straight walls only).
 */
function fromKept(w: Wall, keepStart: boolean, p: Point): number {
  const arc = arcOf(w);
  if (!arc) {
    const t = fractionOn(w, p);
    return keepStart ? t : 1 - t;
  }
  const far = keepStart ? start(w) : end(w);
  const a0 = Math.atan2(far.y - arc.cy, far.x - arc.cx);
  const dir = (keepStart ? 1 : -1) * Math.sign(arc.sweep);
  const a1 = Math.atan2(p.y - arc.cy, p.x - arc.cx);
  const turned = ((((a1 - a0) * dir) % TAU) + TAU) % TAU;
  return turned / Math.abs(arc.sweep);
}

/** The point a fraction u along a wall from its kept end (on round the circle for a curved wall). */
function atFromKept(w: Wall, keepStart: boolean, u: number): Point {
  const arc = arcOf(w);
  if (!arc) return at(w, keepStart ? u : 1 - u);
  const far = keepStart ? start(w) : end(w);
  const a0 = Math.atan2(far.y - arc.cy, far.x - arc.cx);
  const dir = (keepStart ? 1 : -1) * Math.sign(arc.sweep);
  const a = a0 + dir * u * Math.abs(arc.sweep);
  return { x: arc.cx + arc.r * Math.cos(a), y: arc.cy + arc.r * Math.sin(a) };
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
  // A wall joins a wall, a line a line; a curved one joins one on the same circle.
  if (!a || !b || a.id === b.id || a.type !== b.type) return null;
  if (isArc(a) || isArc(b)) return isArc(a) && isArc(b) ? joinArcs(doc, a, b, tol) : null;
  const dir = sub(end(a), start(a));
  const L = len(dir);
  const u = mul(dir, 1 / L);
  const off = (p: Point) => Math.abs(cross(u, sub(p, start(a))));
  const parallel = Math.abs(cross(u, sub(end(b), start(b)))) / len(sub(end(b), start(b))) < 0.01;
  if (!parallel || off(start(b)) > tol || off(end(b)) > tol) return null;
  const ts = [0, L, dot(sub(start(b), start(a)), u), dot(sub(end(b), start(a)), u)];
  const merged = withEnds(a, add(start(a), mul(u, Math.min(...ts))), add(start(a), mul(u, Math.max(...ts))));
  // A wall drawn the other way round: its doors keep their swing and hinge, and its shapes their face.
  const reversed = dot(sub(end(b), start(b)), u) < 0;
  const turned = (o: Opening): Opening =>
    reversed && o.wallId === b.id
      ? {
          ...o,
          flipSide: !o.flipSide,
          flipHinge: !o.flipHinge,
          ...(o.face && { face: o.face === 1 ? -1 : 1 }),
          // A drawn outline runs along the wall from its centre: mirror it end for end.
          ...(o.profile && { profile: o.profile.map((p) => ({ x: -p.x, y: p.y })) }),
        }
      : o;
  const elements = doc.elements
    .filter((el) => el.id !== b.id)
    .map((el) => {
      if (el.id === a.id) return merged;
      if (isOpening(el) && (el.wallId === a.id || el.wallId === b.id))
        return refit({ ...turned(el), wallId: a.id }, merged) ?? el;
      return el;
    });
  return { ...doc, elements };
}

/**
 * Two curved walls on the same circle that meet end to end become one arc. Null if they aren't on
 * one circle, don't meet, or would go all the way round.
 */
function joinArcs(doc: PlanDoc, a: Wall, b: Wall, tol: number): PlanDoc | null {
  if (!sameCarrier(a, b, tol)) return null;
  const near = (p: Point, q: Point) => len(sub(p, q)) <= tol;
  // Turn b round if needed so it runs on from a's end, or up to a's start, the same way round.
  let flipped = false;
  let bb = b;
  if (near(end(a), end(b)) || near(start(a), start(b))) {
    bb = reversedArc(b);
    flipped = true;
  }
  const sa = Math.sign(arcOf(a)!.sweep);
  const sb = Math.sign(arcOf(bb)!.sweep);
  if (sa !== sb) return null;
  const total = Math.abs(arcOf(a)!.sweep) + Math.abs(arcOf(bb)!.sweep);
  if (total >= Math.PI * 2 - 0.01) return null;
  let merged: Wall;
  if (near(end(a), start(bb))) merged = withEndAt(a, 'start', end(bb));
  else if (near(start(a), end(bb))) merged = withEndAt(a, 'end', start(bb));
  else return null;
  const turned = (o: Opening): Opening =>
    flipped && o.wallId === b.id
      ? {
          ...o,
          flipSide: !o.flipSide,
          flipHinge: !o.flipHinge,
          ...(o.face && { face: o.face === 1 ? -1 : 1 }),
          ...(o.profile && { profile: o.profile.map((p) => ({ x: -p.x, y: p.y })) }),
        }
      : o;
  const elements = doc.elements
    .filter((el) => el.id !== b.id)
    .map((el) => {
      if (el.id === a.id) return merged;
      if (isOpening(el) && (el.wallId === a.id || el.wallId === b.id))
        return refit({ ...turned(el), wallId: a.id }, merged) ?? el;
      return el;
    });
  return { ...doc, elements };
}

/** Where the lines or circles of two walls cross: the crossing nearest p, or null if they don't. */
function cornerOf(a: Wall, b: Wall, p: Point): Point | null {
  const hits = crossings(carrierOf(a), carrierOf(b));
  if (!hits.length) return null;
  return hits.reduce((best, h) => (len(sub(h, p)) < len(sub(best, p)) ? h : best));
}

/**
 * Which end of a wall is kept when it is cut (or carried on) to the corner c: the start when the
 * part clicked lies between its start and c. A corner past one end of a curved wall keeps the
 * other end.
 */
function keepsStart(w: Wall, c: Point, pick: Point): boolean {
  const arc = arcOf(w);
  if (!arc) return wallParam(w, pick) < wallParam(w, c);
  const tc = fromKept(w, true, c);
  if (tc <= 1) return projectOnWall(w, pick).t < tc;
  // Beyond the end round the circle: whichever end the corner is nearer to (round the circle).
  const full = (Math.PI * 2) / Math.abs(arc.sweep);
  return tc - 1 < full - tc;
}

/** A wall given the line or curve of `seg`, keeping everything else about it (a new id when asked). */
function shaped(w: Wall, seg: WallLine, id = w.id): Wall {
  const next = { ...w, id, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2 };
  if (seg.bow) next.bow = seg.bow;
  else delete next.bow;
  return next;
}

/**
 * Fillet: make two walls meet in a clean corner, keeping the parts that were clicked. With a radius,
 * the corner is rounded with a curved wall touching both. Either wall may be curved.
 */
export function filletWalls(doc: PlanDoc, idA: Id, pickA: Point, idB: Id, pickB: Point, radius = 0): PlanDoc | null {
  const a = wallsOf(doc).find((w) => w.id === idA);
  const b = wallsOf(doc).find((w) => w.id === idB);
  if (!a || !b || a.id === b.id) return null;
  const c = cornerOf(a, b, mul(add(pickA, pickB), 0.5));
  if (!c) return null;
  const keepA = keepsStart(a, c, pickA);
  const keepB = keepsStart(b, c, pickB);
  const side = (k: boolean) => (k ? 'start' : 'end');
  if (radius <= 0) {
    if (fromKept(a, keepA, c) <= 0 || fromKept(b, keepB, c) <= 0) return null;
    return replaceWall(replaceWall(doc, a, withEndAt(a, side(keepA), c)), b, withEndAt(b, side(keepB), c));
  }
  // The centre is a radius away from both: where the lines (or circles) moved over by the radius cross.
  const ka = carrierOf(a);
  const kb = carrierOf(b);
  const uc = { a: fromKept(a, keepA, c), b: fromKept(b, keepB, c) };
  let best: { centre: Point; ta: Point; tb: Point } | null = null;
  let bestD = Infinity;
  for (const sa of [1, -1])
    for (const sb of [1, -1]) {
      const oa = offsetCarrier(ka, sa * radius);
      const ob = offsetCarrier(kb, sb * radius);
      if (!oa || !ob) continue;
      for (const centre of crossings(oa, ob)) {
        const ta = footOn(ka, centre);
        const tb = footOn(kb, centre);
        // Each touching point between the kept end and the corner.
        const ua = fromKept(a, keepA, ta);
        const ub = fromKept(b, keepB, tb);
        if (!(ua > EPS && ua < uc.a + EPS && ub > EPS && ub < uc.b + EPS)) continue;
        const d = len(sub(centre, c));
        if (d < bestD) {
          bestD = d;
          best = { centre, ta, tb };
        }
      }
    }
  if (!best) return null;
  const { centre, ta, tb } = best;
  // The short way round between the touching points, bulging towards the corner.
  const ra = sub(ta, centre);
  const rb = sub(tb, centre);
  let bis = add(mul(ra, 1 / len(ra)), mul(rb, 1 / len(rb)));
  if (len(bis) < 1e-9) bis = sub(c, centre);
  const mid = add(centre, mul(bis, radius / len(bis)));
  const round = shaped({ ...a, groupId: undefined, defKey: undefined }, segThrough(ta, mid, tb), newId());
  const next = replaceWall(replaceWall(doc, a, withEndAt(a, side(keepA), ta)), b, withEndAt(b, side(keepB), tb));
  return { ...next, elements: [...next.elements, round] };
}

/**
 * Chamfer: cut the corner of two walls with a straight wall, d1 back along the first and d2 along
 * the second (along the curve for a curved wall).
 */
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
  const c = cornerOf(a, b, mul(add(pickA, pickB), 0.5));
  if (!c) return null;
  const keepA = keepsStart(a, c, pickA);
  const keepB = keepsStart(b, c, pickB);
  const La = runLength(a);
  const Lb = runLength(b);
  const ua = fromKept(a, keepA, c) - d1 / La;
  const ub = fromKept(b, keepB, c) - d2 / Lb;
  if (ua <= EPS || ub <= EPS) return null;
  const pa = atFromKept(a, keepA, ua);
  const pb = atFromKept(b, keepB, ub);
  const next = replaceWall(
    replaceWall(doc, a, withEndAt(a, keepA ? 'start' : 'end', pa)),
    b,
    withEndAt(b, keepB ? 'start' : 'end', pb),
  );
  const cut = shaped(
    { ...a, groupId: undefined, defKey: undefined },
    { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y },
    newId(),
  );
  return { ...next, elements: [...next.elements, cut] };
}

/** Offset: a parallel copy of a wall, `dist` away on the side of `side`. */
export function offsetWall(wall: Wall, dist: number, side: Point): Wall {
  if (isArc(wall)) {
    // A curved wall: an arc on the same centre, on the side of `side`.
    const on = projectOnWall(wall, side);
    const u = directionAlong(wall, on.t);
    const sign = dot({ x: -u.y, y: u.x }, sub(side, on.point)) >= 0 ? 1 : -1;
    return { ...offsetArc(wall, sign * dist), id: newId(), groupId: undefined, defKey: undefined };
  }
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
  if (isArc(wall)) return projectOnWall(wall, p).dist;
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
export function mirrorItems(
  doc: PlanDoc,
  ids: Id[],
  a: Point,
  b: Point,
  flip: boolean,
  fitLone?: (o: Opening, doc: PlanDoc) => Opening | null,
): { doc: PlanDoc; ids: Id[] } {
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
    } else if (el.type === 'beam' || el.type === 'line' || el.type === 'section') {
      const p1 = reflect({ x: el.x1, y: el.y1 }, a, b);
      const p2 = reflect({ x: el.x2, y: el.y2 }, a, b);
      // A curved line bows the mirror way.
      const bow = el.type === 'line' && el.bow ? { bow: -el.bow } : {};
      mirrored.set(el.id, { ...el, ...fresh, id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...bow });
    } else if (hasPoints(el)) {
      mirrored.set(el.id, { ...mapOutline(el, (p) => reflect(p, a, b), true), ...fresh, id });
    } else if (el.type === 'level') {
      mirrored.set(el.id, { ...el, ...fresh, id, ...reflect(el, a, b) });
    } else if (el.type === 'dimension') {
      const out = mapDimension(
        el,
        (p) => reflect(p, a, b),
        (deg) => 2 * lineDeg - deg,
      );
      mirrored.set(el.id, remapTies({ ...out, ...fresh, id }, idMap));
    } else if (el.type === 'stair' && (el.shape === 'curved' || el.shape === 'spiral')) {
      // A curved stair turns the other way: its own frame turned half round and flipped across.
      const p = reflect(el, a, b);
      mirrored.set(el.id, {
        ...el,
        ...fresh,
        id,
        x: p.x,
        y: p.y,
        rotation: (((2 * lineDeg - (el.rotation ?? 0) + 180) % 360) + 360) % 360,
        turn: el.turn === 'right' ? 'left' : 'right',
      });
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
    if (!wall) {
      // On its own: it goes where its mirror image falls on a wall, opening and hinged the mirror way.
      const lone = mirrorLone(doc, el, a, b, idMap.get(el.id)!, flip, fitLone);
      if (lone) mirrored.set(el.id, lone);
      continue;
    }
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

/** A direction mirrored in the line a–b. */
function reflectDir(v: Point, a: Point, b: Point): Point {
  const m = sub(b, a);
  const l = len(m) || 1;
  const u = mul(m, 1 / l);
  return sub(mul(u, 2 * dot(v, u)), v);
}

/** A door or window mirrored without its wall: onto the wall its mirror image falls on, if any. */
function mirrorLone(
  doc: PlanDoc,
  el: Opening,
  a: Point,
  b: Point,
  id: Id,
  flip: boolean,
  fit?: (o: Opening, doc: PlanDoc) => Opening | null,
): Opening | null {
  const p = reflect(el, a, b);
  const level = levelOf(el);
  let host: Wall | null = null;
  let best = Infinity;
  for (const w of doc.elements) {
    if (w.type !== 'wall' || levelOf(w) !== level) continue;
    const d = distanceToWall(w, p);
    if (d <= thicknessOf(w) / 2 + 1 && d < best) {
      host = w;
      best = d;
    }
  }
  if (!host) return null;
  const { swing, hinge } = doorSides(el);
  const pos = placeOnWall(host, p, el.width);
  const turned = flipsFor(pos.angle, reflectDir(swing, a, b), reflectDir(hinge, a, b));
  const next: Opening = {
    ...el,
    id,
    wallId: host.id,
    x: pos.x,
    y: pos.y,
    angle: pos.angle,
    flipSide: turned.flipSide || undefined,
    flipHinge: turned.flipHinge || undefined,
    ...(flip ? {} : { groupId: undefined, defKey: undefined }),
  };
  return fit ? fit(next, doc) : next;
}

/**
 * Scale items about `base` by `factor`, or by its own factor across (x) and up and down (y). Wall
 * thickness and door and window widths stay the same; columns and stairs keep their size too.
 */
export function scaleItems(doc: PlanDoc, ids: Id[], base: Point, factor: number | { x: number; y: number }): PlanDoc {
  const fx = typeof factor === 'number' ? factor : factor.x;
  const fy = typeof factor === 'number' ? factor : factor.y;
  if (!(fx > 0) || !(fy > 0) || (fx === 1 && fy === 1)) return doc;
  const set = withOpenings(doc, ids);
  const sc = (p: Point) => ({ x: base.x + (p.x - base.x) * fx, y: base.y + (p.y - base.y) * fy });
  /** How much a bow (square to the line a–b) grows: the factor along the line's normal. */
  const bowFactor = (a: Point, b: Point) => {
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
    return Math.hypot(n.x * fx, n.y * fy);
  };
  const walls = new Map<Id, Wall>();
  const elements = doc.elements.map((el) => {
    if (!set.has(el.id) || isOpening(el)) return el;
    if (el.type === 'wall') {
      const w = withEnds(el, sc(start(el)), sc(end(el))) as WallItem;
      if (el.bow) w.bow = el.bow * bowFactor(start(el), end(el));
      walls.set(w.id, w);
      return w;
    }
    if (el.type === 'beam' || el.type === 'line' || el.type === 'section') {
      const p1 = sc({ x: el.x1, y: el.y1 });
      const p2 = sc({ x: el.x2, y: el.y2 });
      const bow =
        el.type === 'line' && el.bow ? { bow: el.bow * bowFactor({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) } : {};
      return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...bow };
    }
    if (el.type === 'plot' && el.sideList?.some((side) => side.bow)) {
      // Curved sides bow out in proportion.
      const n = el.points.length;
      return mapOutline(
        {
          ...el,
          sideList: el.sideList.map((side, i) =>
            side.bow ? { ...side, bow: side.bow * bowFactor(el.points[i], el.points[(i + 1) % n]) } : side,
          ),
        },
        sc,
      );
    }
    if (hasPoints(el)) return mapOutline(el, sc);
    if (el.type === 'dimension') return mapDimension(el, sc);
    const p = sc(el);
    // Furniture scales; columns and stairs keep their (structural) size.
    return el.type === 'furniture' ? { ...el, x: p.x, y: p.y, ...scaledSize(el, fx, fy) } : { ...el, x: p.x, y: p.y };
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
 * and items fully inside move; doors and windows inside the box move along their wall. Only items
 * `can` allows are touched (those on the floor shown, neither hidden nor locked).
 */
export function stretchItems(
  doc: PlanDoc,
  box: Bounds,
  dx: number,
  dy: number,
  can: (id: Id) => boolean = () => true,
): PlanDoc {
  if (!dx && !dy) return doc;
  const move = (p: Point) => (inBox(p, box) ? { x: p.x + dx, y: p.y + dy } : p);
  const walls = new Map<Id, Wall>();
  const elements = doc.elements.map((el) => {
    if (!can(el.id)) return el;
    if (el.type === 'wall') {
      const w = withEnds(el, move(start(el)), move(end(el))) as WallItem;
      // A curved wall keeps its shape as its ends move apart or together.
      const was = len(sub(end(el), start(el)));
      if (el.bow && was) w.bow = (el.bow * len(sub(end(w), start(w)))) / was;
      walls.set(w.id, w);
      return w;
    }
    // Furniture, columns and stairs with only some corners in the box get bigger or smaller that way.
    if (el.type === 'furniture' || el.type === 'column' || el.type === 'stair')
      return stretchPlaced(el, (p) => inBox(p, box), dx, dy) ?? el;
    if (el.type === 'level') return inBox(el, box) ? { ...el, x: el.x + dx, y: el.y + dy } : el;
    if (el.type === 'beam' || el.type === 'line' || el.type === 'section') {
      const p1 = move({ x: el.x1, y: el.y1 });
      const p2 = move({ x: el.x2, y: el.y2 });
      // A curved line keeps its shape as its ends move apart or together, as a curved wall does.
      const was = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      const bow =
        el.type === 'line' && el.bow && was ? { bow: (el.bow * Math.hypot(p2.x - p1.x, p2.y - p1.y)) / was } : {};
      return { ...el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, ...bow };
    }
    if (hasPoints(el)) return mapOutline(el, move);
    if (el.type === 'dimension') return mapDimension(el, move);
    return el;
  });
  return {
    ...doc,
    elements: elements.flatMap((el): PlanElement[] => {
      if (!isOpening(el) || !can(el.id)) return [el];
      const wall = walls.get(el.wallId);
      if (!wall) return [el];
      return [{ ...el, ...placeOnWall(wall, move(el), el.width) }];
    }),
    rooms: doc.rooms.map((r) => (can(r.id) ? { ...r, points: r.points.map(move) } : r)),
  };
}
