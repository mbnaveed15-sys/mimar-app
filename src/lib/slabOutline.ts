/**
 * Outlines for slabs that follow the plan instead of a rectangle: rooms joined into one outline, and
 * the outside of a group of joined walls. Pure.
 */
import { pointInPolygon } from '../geometry';
import { polygonArea, wallFaces } from '../rooms';
import { thicknessOf } from '../walls';
import { distanceToWall } from './arc';
import { insetPolygon, signedArea2 } from './plot';
import type { Point, Wall } from '../types';

/** Points closer than this (plan units, 1 mm) are the same point. */
const EPS = 0.1;

const key = (p: Point) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`;

/** Whether `p` lies on the segment a–b, strictly between its ends. */
function between(p: Point, a: Point, b: Point): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS * EPS) return false;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (t <= 1e-6 || t >= 1 - 1e-6) return false;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(len2) < EPS;
}

/** Drop corners where the outline carries straight on, and repeated points. */
function tidy(ring: Point[]): Point[] {
  let pts = ring.filter((p, i) => key(p) !== key(ring[(i + 1) % ring.length]));
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) < EPS * Math.hypot(c.x - a.x, c.y - a.y)) {
        pts = pts.filter((_, j) => j !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

/**
 * Outlines that touch along their sides (rooms sharing walls' centre lines) joined into one: each
 * joined shape's outline, with any courtyard it closes round as a hole. Overlapping outlines aren't
 * merged (only those meeting along shared sides are).
 */
export function joinOutlines(outlines: Point[][]): { outline: Point[]; holes: Point[][] }[] {
  // All the same way round (positive area), so a shared side runs both ways and cancels out.
  const rings = outlines.filter((r) => r.length >= 3).map((r) => (signedArea2(r) >= 0 ? r : [...r].reverse()));
  const corners = rings.flat();
  type Edge = { a: Point; b: Point };
  const edges: Edge[] = [];
  for (const ring of rings)
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      // Split a side where another outline's corner lies on it.
      const cuts = corners
        .filter((p) => between(p, a, b))
        .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
      let from = a;
      for (const p of [...cuts, b]) {
        if (key(p) !== key(from)) edges.push({ a: from, b: p });
        from = p;
      }
    });
  // A side shared by two outlines runs both ways: neither is on the joined outline.
  const count = new Map<string, number>();
  const id = (e: Edge) => `${key(e.a)}>${key(e.b)}`;
  for (const e of edges) count.set(id(e), (count.get(id(e)) ?? 0) + 1);
  const kept = edges.filter((e) => !count.has(`${key(e.b)}>${key(e.a)}`));
  // Chain what is left into closed rings.
  const from = new Map<string, Edge[]>();
  for (const e of kept) from.set(key(e.a), [...(from.get(key(e.a)) ?? []), e]);
  const used = new Set<Edge>();
  const loops: Point[][] = [];
  for (const start of kept) {
    if (used.has(start)) continue;
    const ring: Point[] = [];
    let e: Edge | undefined = start;
    while (e && !used.has(e)) {
      used.add(e);
      ring.push(e.a);
      e = from.get(key(e.b))?.find((n) => !used.has(n));
    }
    const clean = tidy(ring);
    if (clean.length >= 3) loops.push(clean);
  }
  // Rings the same way round as the outlines are outsides; the others are holes inside them.
  const outsides = loops.filter((r) => signedArea2(r) > 0);
  const holes = loops.filter((r) => signedArea2(r) < 0);
  return outsides.map((outline) => ({
    outline,
    holes: holes.filter((h) => pointInPolygon(h[0], outline) || h.every((p) => pointInPolygon(p, outline))),
  }));
}

/**
 * An outline along walls' centre lines, moved out over the walls to their far faces: a ring round
 * the outside (or, `hole`, round a courtyard inside). Sides along no wall stay put, and so do sides
 * along a wall with a room in `rooms` beyond it (the slab over that room meets this one there).
 */
export function toOuterFaces(loop: Point[], walls: Wall[], rooms: Point[][] = [], hole = false): Point[] {
  const half = loop.map((a, i) => {
    const b = loop[(i + 1) % loop.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const wall = walls.find((w) => distanceToWall(w, mid) < 0.5);
    if (!wall) return 0;
    const t = thicknessOf(wall) / 2;
    if (rooms.length) {
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
      const probes = [1, -1].map((k) => ({ x: mid.x + n.x * (t + 1) * k, y: mid.y + n.y * (t + 1) * k }));
      // Beyond the side: off the slab (outside the ring, or inside a courtyard).
      const beyond = probes.find((q) => pointInPolygon(q, loop) === hole);
      if (beyond && rooms.some((r) => pointInPolygon(beyond, r))) return 0;
    }
    return t;
  });
  // A negative set-in moves the sides out of the ring; a courtyard shrinks by a positive one.
  const out = insetPolygon(
    loop,
    half.map((h) => (hole ? h : -h)),
  ).points;
  return out.length >= 3 ? tidy(out) : loop;
}

/**
 * One slab outline (with its courtyards) per joined group of the rooms picked (centre-line outlines,
 * as rooms are found): out to the walls' far faces, but only to the middle of a wall shared with a
 * room that wasn't picked.
 */
export function roomsSlab(picked: Point[][], walls: Wall[]): { outline: Point[]; holes: Point[][] }[] {
  const rooms = wallFaces(walls);
  return joinOutlines(picked).map(({ outline, holes }) => ({
    outline: toOuterFaces(outline, walls, rooms),
    holes: holes.map((h) => toOuterFaces(h, walls, rooms, true)),
  }));
}

/**
 * The outside of the joined walls at `p` (the group it is inside, or else the biggest), out to their
 * outer faces; null with no closed walls.
 */
export function wallsOutlineAt(walls: Wall[], p: Point): Point[] | null {
  const loops = wallFaces(walls, true);
  if (!loops.length) return null;
  const inside = loops.filter((l) => pointInPolygon(p, l));
  const pick = (inside.length ? inside : loops).reduce((best, l) =>
    inside.length ? (polygonArea(l) < polygonArea(best) ? l : best) : polygonArea(l) > polygonArea(best) ? l : best,
  );
  return toOuterFaces(pick, walls);
}
