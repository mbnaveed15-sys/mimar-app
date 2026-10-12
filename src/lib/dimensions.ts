/**
 * Dimensions placed with the Dimension tool: where their lines go, what they measure, and how their
 * ends follow the items they were drawn on as the plan changes (`syncDimensions`, run on every
 * change). Pure.
 */
import { fromFurnitureLocal, toFurnitureLocal } from '../geometry';
import type { Dimension, DimTie, Id, PlanDoc, PlanElement, Point } from '../types';
import { arcOf, directionAlong, isArc, paramAlong, pointAlong, runLength } from './arc';
import { outlinePoints } from './plot';
import { thicknessOf } from '../walls';
import { dimEnd, dimStart } from './dimLine';

/** How close (plan units: 0.5 mm) a point must be to count as on an item, or unmoved. */
const EPS = 0.05;

const same = (a: Point, b: Point, tol = EPS) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const rad = (deg: number) => (deg * Math.PI) / 180;

// ---- What each end follows -------------------------------------------------------------------

type LineItem = Extract<PlanElement, { type: 'wall' | 'line' | 'beam' }>;
type FramedItem = Extract<PlanElement, { type: 'furniture' | 'column' | 'stair' }>;
type Outlined = Extract<PlanElement, { type: 'slab' | 'block' | 'roof' | 'pad' | 'plot' }>;

const isLineItem = (el: PlanElement): el is LineItem => el.type === 'wall' || el.type === 'line' || el.type === 'beam';
const isFramed = (el: PlanElement): el is FramedItem =>
  el.type === 'furniture' || el.type === 'column' || el.type === 'stair';
const isOutlined = (el: PlanElement): el is Outlined =>
  el.type === 'slab' || el.type === 'block' || el.type === 'roof' || el.type === 'pad' || el.type === 'plot';

/** Half a wall's thickness or a beam's width, by which a tie's `v` is counted (1 for a line). */
function halfOf(el: LineItem): number {
  if (el.type === 'wall') return thicknessOf(el) / 2;
  if (el.type === 'beam') return el.width / 2;
  return 1;
}

const cornersOf = (el: Outlined): Point[] => (el.type === 'plot' ? outlinePoints(el) : el.points);

/** Where a tie puts its end on the item, or null when the item can't hold it (a corner it lost). */
export function tiePoint(el: PlanElement, tie: DimTie): Point | null {
  if (isLineItem(el)) {
    const base = pointAlong(el, tie.u);
    const dir = directionAlong(el, tie.u);
    const along = tie.d ?? 0;
    const across = tie.v * halfOf(el);
    return { x: base.x + dir.x * along - dir.y * across, y: base.y + dir.y * along + dir.x * across };
  }
  if (isFramed(el)) return fromFurnitureLocal(el, { x: (tie.u * el.w) / 2, y: (tie.v * el.h) / 2 });
  if (el.type === 'door' || el.type === 'window') {
    const a = rad(el.angle);
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    const along = (tie.u * el.width) / 2;
    return { x: el.x + dir.x * along - dir.y * tie.v, y: el.y + dir.y * along + dir.x * tie.v };
  }
  if (isOutlined(el) && tie.i !== undefined) return cornersOf(el)[tie.i] ?? null;
  return null;
}

/** A tie holding p to a wall, line or beam: at its nearer end when p is by one, else part way along. */
function lineTie(el: LineItem, p: Point): DimTie | null {
  const half = halfOf(el);
  const len = runLength(el);
  if (len < 1e-6) return null;
  const t = paramAlong(el, p);
  // Within a thickness of an end (a corner of the wall where it meets another) it keeps to that end.
  const reach = Math.max(half, 1) + EPS;
  for (const u of [0, 1]) {
    const base = pointAlong(el, u);
    const dir = directionAlong(el, u);
    const along = (p.x - base.x) * dir.x + (p.y - base.y) * dir.y;
    const across = -(p.x - base.x) * dir.y + (p.y - base.y) * dir.x;
    if (Math.abs(along) > reach || Math.abs(across) > half + EPS) continue;
    const tie: DimTie = { id: el.id, u, v: across / half, ...(Math.abs(along) > 1e-6 && { d: along }) };
    if (same(tiePoint(el, tie)!, p)) return tie;
  }
  if (t < 0 || t > 1) return null;
  const tie: DimTie = { id: el.id, u: t, v: 0 };
  const base = pointAlong(el, t);
  const dir = directionAlong(el, t);
  tie.v = (-(p.x - base.x) * dir.y + (p.y - base.y) * dir.x) / half;
  if (Math.abs(tie.v) > 1 + EPS / half) return null;
  return same(tiePoint(el, tie)!, p) ? tie : null;
}

/** A tie holding p to this item, or null when p isn't on it. */
export function tieOn(el: PlanElement, p: Point): DimTie | null {
  if (isLineItem(el)) return lineTie(el, p);
  if (isFramed(el)) {
    const local = toFurnitureLocal(el, p);
    if (Math.abs(local.x) > el.w / 2 + EPS || Math.abs(local.y) > el.h / 2 + EPS || !el.w || !el.h) return null;
    return { id: el.id, u: (local.x * 2) / el.w, v: (local.y * 2) / el.h };
  }
  if (el.type === 'door' || el.type === 'window') {
    const a = rad(el.angle);
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    const rel = { x: p.x - el.x, y: p.y - el.y };
    const along = dot(rel, dir);
    const across = -rel.x * dir.y + rel.y * dir.x;
    // On the opening: within its width, and no further across than a thick wall's face.
    if (!el.width || Math.abs(along) > el.width / 2 + EPS || Math.abs(across) > 40) return null;
    return { id: el.id, u: (along * 2) / el.width, v: across };
  }
  if (isOutlined(el)) {
    const i = cornersOf(el).findIndex((c) => same(c, p));
    return i < 0 ? null : { id: el.id, u: 0, v: 0, i };
  }
  return null;
}

/** Which items a dimension end prefers to follow, when several are under it: the smallest first. */
function rank(el: PlanElement): number {
  if (el.type === 'door' || el.type === 'window') return 0;
  if (isFramed(el)) return 1;
  if (isLineItem(el)) return 2;
  return 3;
}

/**
 * The item a dimension end at p should follow, among `elements` (those on the floor being drawn):
 * a door or window first, then furniture, columns and stairs, then walls, lines and beams (an end
 * of one before a point part way along), then corners of outlines.
 */
export function tieFor(elements: PlanElement[], p: Point): DimTie | undefined {
  let best: { tie: DimTie; score: number } | null = null;
  for (const el of elements) {
    if (el.type === 'dimension' || el.hidden) continue;
    const tie = tieOn(el, p);
    if (!tie) continue;
    // Ends of walls beat points part way along.
    const score = rank(el) * 2 + (isLineItem(el) && tie.u !== 0 && tie.u !== 1 ? 1 : 0);
    if (!best || score < best.score) best = { tie, score };
  }
  return best?.tie;
}

/** A radius dimension's centre and point from the curved wall or line it follows, or null when straight. */
export function radiusPoints(el: PlanElement, tie: DimTie): { centre: Point; at: Point } | null {
  if (el.type !== 'wall' && el.type !== 'line') return null;
  const arc = arcOf(el);
  if (!arc) return null;
  return { centre: { x: arc.cx, y: arc.cy }, at: pointAlong(el, tie.u) };
}

/** A radius dimension on a curved wall or line, at the point of it nearest p. */
export function radiusDimension(el: PlanElement, p: Point): Omit<Dimension, 'id'> | null {
  if ((el.type !== 'wall' && el.type !== 'line') || !isArc(el)) return null;
  const t = Math.max(0, Math.min(1, paramAlong(el, p)));
  const tie: DimTie = { id: el.id, u: t, v: 0 };
  const pts = radiusPoints(el, tie)!;
  return {
    type: 'dimension',
    radius: true,
    x1: pts.centre.x,
    y1: pts.centre.y,
    x2: pts.at.x,
    y2: pts.at.y,
    lx: pts.at.x,
    ly: pts.at.y,
    tie2: tie,
    ...(el.levelId && { levelId: el.levelId }),
  };
}

// ---- Keeping up with the plan ----------------------------------------------------------------

/** Point k (1 or 2) of a dimension. */
const endOf = (d: Dimension, k: 1 | 2): Point => (k === 1 ? dimStart(d) : dimEnd(d));

/**
 * After a change: each dimension end that follows an item moves with it (and the dimension line
 * with them when both ends moved alike). An end follows the same spot through a split or a join of
 * walls; it lets go when its item is deleted, can't hold it any more, or the dimension itself was
 * moved off it.
 */
export function syncDimensions(prev: PlanDoc, next: PlanDoc): PlanDoc {
  if (prev === next) return next;
  if (!next.elements.some((el) => el.type === 'dimension' && (el.tie1 || el.tie2))) return next;
  const nextById = new Map(next.elements.map((el) => [el.id, el]));
  const prevById = new Map(prev.elements.map((el) => [el.id, el]));
  let changed = false;
  const elements = next.elements.map((el) => {
    if (el.type !== 'dimension' || (!el.tie1 && !el.tie2)) return el;
    const out = el.radius ? syncRadius(el, nextById) : syncLinear(el, prevById, nextById, prev);
    if (out !== el) changed = true;
    return out;
  });
  return changed ? { ...next, elements } : next;
}

function syncRadius(d: Dimension, nextById: Map<Id, PlanElement>): Dimension {
  const tie = d.tie2;
  const el = tie && nextById.get(tie.id);
  const pts = el && tie ? radiusPoints(el, tie) : null;
  if (!pts) {
    const rest = { ...d };
    delete rest.tie2;
    return rest;
  }
  if (same(pts.centre, dimStart(d)) && same(pts.at, dimEnd(d))) return d;
  return { ...d, x1: pts.centre.x, y1: pts.centre.y, x2: pts.at.x, y2: pts.at.y, lx: pts.at.x, ly: pts.at.y };
}

function syncLinear(
  d: Dimension,
  prevById: Map<Id, PlanElement>,
  nextById: Map<Id, PlanElement>,
  prev: PlanDoc,
): Dimension {
  const prevD = prevById.get(d.id) as Dimension | undefined;
  // Whether this change moved the dimension itself (with its items, or on its own).
  const itself = !prevD || !sameSpot(prevD, d);
  const moved: (Point | null)[] = [null, null];
  let out: Dimension = d;
  for (const k of [1, 2] as const) {
    const key = k === 1 ? 'tie1' : 'tie2';
    const tie = d[key];
    if (!tie) continue;
    const q = endOf(d, k);
    const el = nextById.get(tie.id);
    const keep = (t: DimTie | undefined, at?: Point) => {
      out = { ...out, [key]: t };
      if (!t) delete out[key];
      if (at && !same(at, q)) {
        moved[k - 1] = { x: at.x - q.x, y: at.y - q.y };
        out = k === 1 ? { ...out, x1: at.x, y1: at.y } : { ...out, x2: at.x, y2: at.y };
      }
    };
    if (!el) {
      keep(undefined);
      continue;
    }
    const tp = tiePoint(el, tie);
    if (tp && same(tp, q)) continue;
    const prevEl = prevById.get(tie.id);
    const prevTp = prevEl ? tiePoint(prevEl, tie) : null;
    const wasFollowing = !!prevD && !!prevTp && same(endOf(prevD, k), prevTp);
    if (!wasFollowing || itself) {
      // The dimension was changed too (moved with its items, or on its own): it holds to whatever
      // of the same item is now under its end, or lets go.
      keep(tieOn(el, q) ?? undefined);
      continue;
    }
    // Only the item changed under the end.
    const split = splitPiece(freshLines(prevById, nextById), el, q, tie);
    if (split) keep(split);
    else if (joinedThrough(prev, nextById, el, q, tie)) keep(tieOn(el, q) ?? undefined);
    else if (!tp) keep(undefined);
    else keep(tie, tp);
  }
  // Both ends moved the same way: the dimension line goes with them.
  const [m1, m2] = moved;
  if (m1 && m2 && same(m1, m2)) out = { ...out, lx: d.lx + m1.x, ly: d.ly + m1.y };
  return out;
}

/** Whether two versions of a dimension sit in the same place. */
function sameSpot(a: Dimension, b: Dimension): boolean {
  return (
    same(dimStart(a), dimStart(b)) &&
    same(dimEnd(a), dimEnd(b)) &&
    same({ x: a.lx, y: a.ly }, { x: b.lx, y: b.ly }) &&
    a.angle === b.angle
  );
}

/** Walls, lines and beams that weren't in the plan before (the far half of a split one). */
function freshLines(prevById: Map<Id, PlanElement>, nextById: Map<Id, PlanElement>): LineItem[] {
  return [...nextById.values()].filter((el): el is LineItem => !prevById.has(el.id) && isLineItem(el));
}

/**
 * A wall (or line) split in two: the end the tie held went to the new piece. Returns the tie on the
 * new piece that holds the end where it is, or null.
 */
function splitPiece(fresh: LineItem[], el: PlanElement, q: Point, tie: DimTie): DimTie | null {
  if (!isLineItem(el) || (tie.u !== 0 && tie.u !== 1)) return null;
  for (const other of fresh) {
    if (other.type !== el.type) continue;
    const t = tieOn(other, q);
    if (t && (t.u === 0 || t.u === 1)) return t;
  }
  return null;
}

/**
 * Two walls joined into one: the end the tie held is now part way along it, and the other wall,
 * whose end met it there, is gone.
 */
function joinedThrough(prev: PlanDoc, nextById: Map<Id, PlanElement>, el: PlanElement, q: Point, tie: DimTie): boolean {
  if (!isLineItem(el) || (tie.u !== 0 && tie.u !== 1)) return false;
  const on = tieOn(el, q);
  if (!on || on.u === 0 || on.u === 1) return false;
  return prev.elements.some(
    (o) =>
      o.id !== el.id &&
      !nextById.has(o.id) &&
      isLineItem(o) &&
      [pointAlong(o, 0), pointAlong(o, 1)].some((e) => same(e, q, Math.max(halfOf(o), halfOf(el)) * 1.5 + EPS)),
  );
}

/**
 * Ties copied with items point at the originals: point them at the copies (`idMap`), or drop them
 * when the item they followed wasn't copied. The next change checks them against the copies.
 */
export function remapTies<T extends PlanElement>(el: T, idMap: Map<Id, Id>): T {
  if (el.type !== 'dimension') return el;
  const map = (t: DimTie | undefined) => (t && idMap.has(t.id) ? { ...t, id: idMap.get(t.id)! } : undefined);
  const out = { ...el, tie1: map(el.tie1), tie2: map(el.tie2) };
  if (!out.tie1) delete out.tie1;
  if (!out.tie2) delete out.tie2;
  return out;
}

/**
 * A dimension dragged by `dx, dy` from where it was (`orig`): its line moves (the points it measures
 * stay); a radius dimension slides round its curve to the point nearest the pointer.
 */
export function dragDimension(doc: PlanDoc, orig: Dimension, dx: number, dy: number, pointer: Point): Dimension {
  if (!orig.radius) return { ...orig, lx: orig.lx + dx, ly: orig.ly + dy };
  const el = orig.tie2 && doc.elements.find((e) => e.id === orig.tie2!.id);
  if (!el || (el.type !== 'wall' && el.type !== 'line') || !isArc(el)) return orig;
  const t = Math.max(0, Math.min(1, paramAlong(el, pointer)));
  const tie = { ...orig.tie2!, u: t };
  const pts = radiusPoints(el, tie)!;
  return {
    ...orig,
    tie2: tie,
    x1: pts.centre.x,
    y1: pts.centre.y,
    x2: pts.at.x,
    y2: pts.at.y,
    lx: pts.at.x,
    ly: pts.at.y,
  };
}
