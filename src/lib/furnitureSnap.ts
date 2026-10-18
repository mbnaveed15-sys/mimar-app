/**
 * Furniture that finds its place against a room's walls: near a wall it turns its back to it and
 * sits flush with the wall's face, and near a second wall at right angles it tucks into the corner.
 * Pure.
 */
import { MM_PER_UNIT } from './scale';
import { thicknessOf } from '../walls';
import type { Furniture, Point, Wall } from '../types';

/** How near (plan units) an item's back has to come to a wall's face to snap to it: 2'. */
export const WALL_SNAP = 610 / MM_PER_UNIT;

/** A wall's face: a line, which way is into the room, and how far it runs. */
interface Face {
  a: Point;
  /** Along the face, unit. */
  t: Point;
  /** Square to it, pointing away from the wall. */
  n: Point;
  len: number;
}

/** Both faces of each straight wall (curved walls aren't snapped to). */
function facesOf(walls: Wall[]): Face[] {
  const out: Face[] = [];
  for (const w of walls) {
    if (w.bow) continue;
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const t = { x: dx / len, y: dy / len };
    const half = thicknessOf(w) / 2;
    for (const k of [1, -1]) {
      const n = { x: -t.y * k, y: t.x * k };
      out.push({
        a: { x: w.x1 + n.x * half - t.x * half, y: w.y1 + n.y * half - t.y * half },
        t,
        n,
        len: len + 2 * half,
      });
    }
  }
  return out;
}

const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

/** How far a box w × h turned `deg` reaches from its centre along the unit vector `n`. */
function reach(w: number, h: number, deg: number, n: Point): number {
  const a = (deg * Math.PI) / 180;
  const x = { x: Math.cos(a), y: Math.sin(a) };
  const y = { x: -Math.sin(a), y: Math.cos(a) };
  return (Math.abs(dot(x, n)) * w) / 2 + (Math.abs(dot(y, n)) * h) / 2;
}

/** Where the face's line is nearest `p`, how far `p` is in front of it, and how far along. */
function measure(face: Face, p: Point) {
  const v = { x: p.x - face.a.x, y: p.y - face.a.y };
  return { off: dot(v, face.n), along: dot(v, face.t) };
}

/**
 * Snap a furniture item centred at `p` to the walls: against the nearest wall face within reach,
 * its back to the wall (turned `extra` degrees more, as V turns it), sliding into a corner where a
 * second wall at right angles is within reach of its side. Null when no wall is near.
 */
export function snapToWalls(
  item: Pick<Furniture, 'w' | 'h'>,
  p: Point,
  walls: Wall[],
  extra = 0,
  near = WALL_SNAP,
): { x: number; y: number; rotation: number } | null {
  const faces = facesOf(walls);
  // The wall nearest the pointer wins (not the one the item's edge comes nearest): a bed placed by
  // the top wall backs onto it, even when a side wall is just as close to its far edge.
  let best: { face: Face; off: number; rotation: number; depth: number } | null = null;
  for (const face of faces) {
    const { off, along } = measure(face, p);
    if (off <= 0 || along < 0 || along > face.len) continue;
    // Its back towards the wall: the item's own "up" (its back) points against the face's normal.
    const rotation = ((((Math.atan2(-face.n.x, face.n.y) * 180) / Math.PI + extra) % 360) + 360) % 360;
    const depth = reach(item.w, item.h, rotation, face.n);
    const gap = off - depth;
    if (gap > near || gap < -depth) continue;
    if (!best || off < best.off) best = { face, off, rotation, depth };
  }
  if (!best) return null;
  const { face, rotation, depth } = best;
  const { along } = measure(face, p);
  let centre = { x: face.a.x + face.t.x * along + face.n.x * depth, y: face.a.y + face.t.y * along + face.n.y * depth };

  // A wall square to the first one, beside the item: slide along until its side touches it.
  let corner: { face: Face; gap: number } | null = null;
  for (const other of faces) {
    if (other === face || Math.abs(dot(other.n, face.n)) > 0.05) continue;
    const { off, along: at } = measure(other, centre);
    const side = reach(item.w, item.h, rotation, other.n);
    const gap = off - side;
    if (off <= 0 || gap > near || gap < -side) continue;
    // Only a wall that reaches back to the first one (a corner of the room), not one across the room.
    if (at < -depth - near || at > other.len + depth + near) continue;
    if (!corner || Math.abs(gap) < Math.abs(corner.gap)) corner = { face: other, gap };
  }
  if (corner) centre = { x: centre.x - corner.face.n.x * corner.gap, y: centre.y - corner.face.n.y * corner.gap };
  return { x: centre.x, y: centre.y, rotation: Math.round(rotation * 100) / 100 };
}

/** How near (plan units) an item's side has to come to another item's side to line up with it: 1'. */
export const FURNITURE_SNAP = 305 / MM_PER_UNIT;

/** Turned the same way, or a quarter, half or three-quarter turn apart (within a degree): 0 or 90, else null. */
function squareTo(a: number, b: number): 0 | 90 | null {
  const d = (((a - b) % 180) + 180) % 180;
  if (d < 1 || d > 179) return 0;
  if (Math.abs(d - 90) < 1) return 90;
  return null;
}

/**
 * Snap a furniture item centred at `p` beside other furniture: when one of its sides comes within
 * reach of another item's side (turned square to it), it sits flush against that side and lines up
 * with the other item's front, back or middle when near them (a bedside table beside a bed, chairs
 * in a row). Null when no item is near.
 */
export function snapToFurniture(
  item: Pick<Furniture, 'w' | 'h' | 'rotation'>,
  p: Point,
  others: Furniture[],
  near = FURNITURE_SNAP,
): Point | null {
  const deg = item.rotation ?? 0;
  let best: { at: Point; score: number } | null = null;
  for (const o of others) {
    const turn = squareTo(deg, o.rotation ?? 0);
    if (turn === null) continue;
    const a = ((o.rotation ?? 0) * Math.PI) / 180;
    const ax = { x: Math.cos(a), y: Math.sin(a) };
    const ay = { x: -Math.sin(a), y: Math.cos(a) };
    const v = { x: p.x - o.x, y: p.y - o.y };
    const local = { x: dot(v, ax), y: dot(v, ay) };
    // The item's half size along the other item's own sides.
    const ex = (turn === 0 ? item.w : item.h) / 2;
    const ey = (turn === 0 ? item.h : item.w) / 2;
    const ox = o.w / 2;
    const oy = o.h / 2;
    /** Line up along one side: with the other's near end, far end or middle, when within reach. */
    const lineUp = (at: number, half: number, otherHalf: number) => {
      const options = [otherHalf - half, -otherHalf + half, 0];
      let pick = at;
      let gap = near;
      for (const c of options) {
        if (Math.abs(at - c) <= gap) {
          gap = Math.abs(at - c);
          pick = c;
        }
      }
      return pick;
    };
    // Beside its left or right side.
    if (Math.abs(local.y) < oy + ey) {
      const gap = Math.abs(local.x) - ox - ex;
      if (gap > -ex && gap <= near) {
        const at = { x: Math.sign(local.x || 1) * (ox + ex), y: lineUp(local.y, ey, oy) };
        const score = Math.abs(gap);
        if (!best || score < best.score) best = { at: toWorld(o, ax, ay, at), score };
      }
    }
    // In front of it or behind it.
    if (Math.abs(local.x) < ox + ex) {
      const gap = Math.abs(local.y) - oy - ey;
      if (gap > -ey && gap <= near) {
        const at = { x: lineUp(local.x, ex, ox), y: Math.sign(local.y || 1) * (oy + ey) };
        const score = Math.abs(gap);
        if (!best || score < best.score) best = { at: toWorld(o, ax, ay, at), score };
      }
    }
  }
  return best?.at ?? null;
}

function toWorld(o: Point, ax: Point, ay: Point, l: Point): Point {
  return { x: o.x + ax.x * l.x + ay.x * l.y, y: o.y + ax.y * l.x + ay.y * l.y };
}
