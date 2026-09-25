/**
 * Push/Pull, SketchUp style: grab a face of an item and push it in or pull it out. Everything here
 * is pure: which face was grabbed (from the 3D hit), and the plan after moving that face.
 */
import { centroid, wallLength } from '../geometry';
import { MM_PER_UNIT } from './scale';
import { signedArea } from './shapes';
import type { Block, Column, Id, Opening, PlanDoc, PlanElement, Point, PushFace, Slab, Vec3, Wall } from '../types';
import { thicknessOf } from '../walls';

/** Plan units per scene metre (scene metres are x, z; plan units are 10 mm). */
const UNITS_PER_M = 1000 / MM_PER_UNIT;

/** What a push did: changed a size, cut an opening, made a void, or nothing (not far enough yet). */
export type PushResult = 'changed' | 'cut' | 'void' | 'none';

export interface PushContext {
  /** The usual wall height, for walls and columns that don't have their own. */
  wallHeightMm: number;
}

/** Which face of an item a 3D hit is on, or null when that face can't be pushed or pulled. */
export function faceOf(el: PlanElement, normal: Vec3, point: Vec3): PushFace | null {
  const [nx, ny, nz] = normal;
  const up = ny > 0.7;
  const down = ny < -0.7;
  switch (el.type) {
    case 'wall':
    case 'beam': {
      if (up) return el.type === 'wall' ? { part: 'top' } : null;
      if (down) return el.type === 'beam' ? { part: 'bottom' } : null;
      const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1;
      const [ux, uy] = [(el.x2 - el.x1) / len, (el.y2 - el.y1) / len];
      const along = nx * ux + nz * uy;
      if (Math.abs(along) > 0.7) return { part: 'end', end: along > 0 ? 2 : 1 };
      // Sign 1 is the side the wall's left normal (-uy, ux) points to.
      return { part: 'side', sign: nx * -uy + nz * ux > 0 ? 1 : -1 };
    }
    case 'column': {
      if (up) return { part: 'top' };
      if (down) return null;
      const a = ((el.rotation ?? 0) * Math.PI) / 180;
      const alongX = nx * Math.cos(a) + nz * Math.sin(a);
      const alongY = -nx * Math.sin(a) + nz * Math.cos(a);
      return Math.abs(alongX) >= Math.abs(alongY)
        ? { part: 'side', axis: 'x', sign: alongX > 0 ? 1 : -1 }
        : { part: 'side', axis: 'y', sign: alongY > 0 ? 1 : -1 };
    }
    case 'slab':
    case 'block': {
      // A flat shape has only the one face.
      if (el.type === 'block' && el.heightMm <= 0) return { part: 'top' };
      if (up) return { part: 'top' };
      if (down) return { part: 'bottom' };
      return { part: 'edge', index: nearestEdge(el.points, { x: point[0] * UNITS_PER_M, y: point[2] * UNITS_PER_M }) };
    }
    case 'window': {
      // A shape on a wall is pushed in or pulled out by its face, not its sides.
      const a = (el.angle * Math.PI) / 180;
      return el.flat && Math.abs(-nx * Math.sin(a) + nz * Math.cos(a)) > 0.7 ? { part: 'into' } : null;
    }
    default:
      return null;
  }
}

function nearestEdge(points: Point[], p: Point): number {
  let best = 0;
  let bestD = Infinity;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Outward unit normal of an outline's edge i (away from the inside, whichever way the outline runs). */
export function edgeNormal(points: Point[], i: number): Point {
  const a = points[i];
  const b = points[(i + 1) % points.length];
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const [ex, ey] = [(b.x - a.x) / len, (b.y - a.y) / len];
  return signedArea(points) > 0 ? { x: ey, y: -ex } : { x: -ey, y: ex };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (mm: number) => Math.round(mm * 10) / 10;

/** Smallest sizes a push can leave (mm). */
const MIN_THICK_MM = 25;
const MIN_HEIGHT_MM = 50;
const MIN_LENGTH = 10; // plan units

/**
 * The plan after pushing (negative) or pulling (positive) a face by `mm` along the way it faces.
 * Pushing a flat shape on a wall through the wall cuts an opening; pushing a flat shape on a slab
 * down through the slab makes a void. Either needs to go at least half-way through.
 */
export function pushPull(
  doc: PlanDoc,
  id: Id,
  face: PushFace,
  mm: number,
  ctx: PushContext,
): { doc: PlanDoc; result: PushResult } {
  const el = doc.elements.find((x) => x.id === id);
  if (!el || !mm) return { doc, result: 'none' };
  const d = mm / MM_PER_UNIT;
  const replace = (next: PlanElement, extra: (x: PlanElement) => PlanElement = (x) => x) => ({
    doc: { ...doc, elements: doc.elements.map((x) => (x.id === id ? next : extra(x))) },
    result: 'changed' as PushResult,
  });

  switch (el.type) {
    case 'wall': {
      if (face.part === 'top')
        return replace({ ...el, heightMm: round(clamp((el.heightMm ?? ctx.wallHeightMm) + mm, 100, 30000)) });
      if (face.part === 'end') return replace(withEnd(el, face.end, d));
      if (face.part === 'side') {
        // The other face stays put: the wall thickens (or thins) towards the face that moved.
        const t = thicknessOf(el);
        const next = Math.max(MIN_THICK_MM / MM_PER_UNIT, t + d);
        const shift = (face.sign * (next - t)) / 2;
        const moved = shiftSideways(el, shift);
        return replace({ ...moved, thickness: next }, (x) =>
          'wallId' in x && x.wallId === el.id ? shiftOpening(x, el, shift) : x,
        );
      }
      return { doc, result: 'none' };
    }
    case 'beam': {
      if (face.part === 'bottom') return replace({ ...el, depth: Math.max(MIN_THICK_MM / MM_PER_UNIT, el.depth + d) });
      if (face.part === 'end') return replace(withEnd(el, face.end, d));
      if (face.part === 'side') {
        const next = Math.max(MIN_THICK_MM / MM_PER_UNIT, el.width + d);
        return replace({ ...shiftSideways(el, (face.sign * (next - el.width)) / 2), width: next });
      }
      return { doc, result: 'none' };
    }
    case 'column':
      return replace(pushColumn(el, face, d, mm, ctx));
    case 'slab': {
      if (face.part === 'top')
        return replace({ ...el, thickness: Math.max(MIN_THICK_MM / MM_PER_UNIT, el.thickness + d) });
      if (face.part === 'bottom') {
        const next = Math.max(MIN_THICK_MM / MM_PER_UNIT, el.thickness + d);
        return replace({
          ...el,
          thickness: next,
          elevMm: round((el.elevMm ?? 0) - (next - el.thickness) * MM_PER_UNIT) || undefined,
        });
      }
      if (face.part === 'edge') return replace({ ...el, points: pushEdge(el.points, face.index, d) });
      return { doc, result: 'none' };
    }
    case 'block':
      return pushBlock(doc, el, face, mm);
    case 'window': {
      if (face.part !== 'into' || !el.flat) return { doc, result: 'none' };
      const wall = doc.elements.find((x): x is Wall => x.type === 'wall' && x.id === el.wallId);
      const next = withShapeDepth(el, wall, (el.depthMm ?? 0) + mm);
      return { ...replace(next.el), result: next.cut ? 'cut' : 'changed' };
    }
    default:
      return { doc, result: 'none' };
  }
}

/** The least wall left behind a niche; pushed deeper than that, a shape cuts right through. */
export const NICHE_BACK_MM = 50;
/** How far a projection (chajja, ledge) can stand out. */
export const MAX_PROJECTION_MM = 3000;

/**
 * A shape on a wall given a depth: a niche (below zero), flat (zero), a projection (above zero),
 * or cut right through as an open hole when pushed to within 2" of the wall's far face.
 */
export function withShapeDepth(win: Opening, wall: Wall | undefined, depthMm: number): { el: Opening; cut: boolean } {
  const through = wall ? thicknessOf(wall) * MM_PER_UNIT : 230;
  const next = { ...win };
  delete next.depthMm;
  if (depthMm <= -(through - NICHE_BACK_MM)) {
    delete next.flat;
    delete next.face;
    return { el: { ...next, open: true }, cut: true };
  }
  const d = round(Math.min(MAX_PROJECTION_MM, depthMm));
  return { el: d ? { ...next, depthMm: d } : next, cut: false };
}

/** A wall or beam with one end moved along it by d (plan units); it can't get shorter than 10 cm. */
function withEnd<T extends { x1: number; y1: number; x2: number; y2: number }>(el: T, end: 1 | 2, d: number): T {
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1;
  const [ux, uy] = [(el.x2 - el.x1) / len, (el.y2 - el.y1) / len];
  const move = Math.max(MIN_LENGTH - len, d);
  return end === 2
    ? { ...el, x2: el.x2 + ux * move, y2: el.y2 + uy * move }
    : { ...el, x1: el.x1 - ux * move, y1: el.y1 - uy * move };
}

/** A wall or beam moved sideways by `shift` plan units towards its left normal (-uy, ux). */
function shiftSideways<T extends { x1: number; y1: number; x2: number; y2: number }>(el: T, shift: number): T {
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1;
  const [nx, ny] = [-(el.y2 - el.y1) / len, (el.x2 - el.x1) / len];
  return { ...el, x1: el.x1 + nx * shift, y1: el.y1 + ny * shift, x2: el.x2 + nx * shift, y2: el.y2 + ny * shift };
}

function shiftOpening<T extends { x: number; y: number }>(o: T, wall: Wall, shift: number): T {
  const len = wallLength(wall) || 1;
  return { ...o, x: o.x - ((wall.y2 - wall.y1) / len) * shift, y: o.y + ((wall.x2 - wall.x1) / len) * shift };
}

function pushColumn(c: Column, face: PushFace, d: number, mm: number, ctx: PushContext): Column {
  if (face.part === 'top') return { ...c, heightMm: round(clamp((c.heightMm ?? ctx.wallHeightMm) + mm, 100, 30000)) };
  if (face.part !== 'side') return c;
  const min = 50 / MM_PER_UNIT;
  const a = ((c.rotation ?? 0) * Math.PI) / 180;
  if (c.shape === 'round') {
    const next = Math.max(min, c.w + d);
    const grow = (next - c.w) / 2;
    const [dx, dy] = face.axis === 'y' ? [-Math.sin(a), Math.cos(a)] : [Math.cos(a), Math.sin(a)];
    return { ...c, w: next, h: next, x: c.x + dx * grow * face.sign, y: c.y + dy * grow * face.sign };
  }
  if (face.axis === 'y') {
    const next = Math.max(min, c.h + d);
    const grow = ((next - c.h) / 2) * face.sign;
    return { ...c, h: next, x: c.x - Math.sin(a) * grow, y: c.y + Math.cos(a) * grow };
  }
  const next = Math.max(min, c.w + d);
  const grow = ((next - c.w) / 2) * face.sign;
  return { ...c, w: next, x: c.x + Math.cos(a) * grow, y: c.y + Math.sin(a) * grow };
}

/** An outline with edge i moved outward by d (plan units). */
export function pushEdge(points: Point[], i: number, d: number): Point[] {
  const n = edgeNormal(points, i);
  const j = (i + 1) % points.length;
  return points.map((p, k) => (k === i || k === j ? { x: p.x + n.x * d, y: p.y + n.y * d } : p));
}

/** A round outline made wider (or narrower) all round by d. */
function growRound(points: Point[], d: number): Point[] {
  const c = centroid(points);
  const r = points.reduce((sum, p) => sum + Math.hypot(p.x - c.x, p.y - c.y), 0) / points.length || 1;
  const f = Math.max(0.05, (r + d) / r);
  return points.map((p) => ({ x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f }));
}

function pushBlock(doc: PlanDoc, b: Block, face: PushFace, mm: number): { doc: PlanDoc; result: PushResult } {
  const d = mm / MM_PER_UNIT;
  const set = (next: Block) => ({
    doc: { ...doc, elements: doc.elements.map((x) => (x.id === b.id ? next : x)) },
    result: 'changed' as PushResult,
  });
  if (b.heightMm <= 0) {
    if (mm > 0) return set({ ...b, heightMm: round(Math.min(30000, mm)) });
    // Pushed down into the slab it's on, at least half-way through: a void in the slab.
    const slab = b.slabId ? doc.elements.find((x): x is Slab => x.type === 'slab' && x.id === b.slabId) : undefined;
    if (!slab || -mm < (slab.thickness * MM_PER_UNIT) / 2) return { doc, result: 'none' };
    return {
      doc: {
        ...doc,
        elements: doc.elements
          .filter((x) => x.id !== b.id)
          .map((x) => (x.id === slab.id ? { ...slab, holes: [...(slab.holes ?? []), b.points] } : x)),
      },
      result: 'void',
    };
  }
  if (face.part === 'top') return set({ ...b, heightMm: round(clamp(b.heightMm + mm, MIN_HEIGHT_MM, 30000)) });
  if (face.part === 'bottom') {
    const next = round(clamp(b.heightMm + mm, MIN_HEIGHT_MM, 30000));
    return set({ ...b, heightMm: next, elevMm: round((b.elevMm ?? 0) - (next - b.heightMm)) || undefined });
  }
  if (face.part === 'edge')
    return set({ ...b, points: b.shape === 'circle' ? growRound(b.points, d) : pushEdge(b.points, face.index, d) });
  return { doc, result: 'none' };
}
