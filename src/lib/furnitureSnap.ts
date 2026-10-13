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
  let best: { face: Face; gap: number; rotation: number; depth: number } | null = null;
  for (const face of faces) {
    const { off, along } = measure(face, p);
    if (off <= 0 || along < 0 || along > face.len) continue;
    // Its back towards the wall: the item's own "up" (its back) points against the face's normal.
    const rotation = ((((Math.atan2(-face.n.x, face.n.y) * 180) / Math.PI + extra) % 360) + 360) % 360;
    const depth = reach(item.w, item.h, rotation, face.n);
    const gap = off - depth;
    if (gap > near || gap < -depth) continue;
    if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { face, gap, rotation, depth };
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
