import type { PlanElement, Point } from '../types';

/** How far off a wall's line (plan units) another wall still counts as lying along it. */
const ON_LINE = 1;

/**
 * The parts of a straight wall from a to b that no straight wall already there lies along, as [from, to] pairs of
 * points in order. A wall drawn along one that exists (a rectangle beside a room) then adds only what is new,
 * not a second wall on top of the first.
 */
export function uncoveredSpans(a: Point, b: Point, elements: PlanElement[], minLength = 0): [Point, Point][] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return [];
  const ux = dx / len;
  const uy = dy / len;
  const along = (p: Point) => ((p.x - a.x) * ux + (p.y - a.y) * uy) / len;
  const off = (p: Point) => Math.abs((p.x - a.x) * uy - (p.y - a.y) * ux);
  const covered: [number, number][] = [];
  for (const el of elements) {
    if (el.type !== 'wall' || el.bow) continue;
    const p = { x: el.x1, y: el.y1 };
    const q = { x: el.x2, y: el.y2 };
    if (off(p) > ON_LINE || off(q) > ON_LINE) continue;
    const t0 = Math.max(0, Math.min(along(p), along(q)));
    const t1 = Math.min(1, Math.max(along(p), along(q)));
    if (t1 - t0 > 1e-6) covered.push([t0, t1]);
  }
  covered.sort((i, j) => i[0] - j[0]);
  const free: [number, number][] = [];
  let t = 0;
  for (const [c0, c1] of covered) {
    if (c0 > t) free.push([t, c0]);
    t = Math.max(t, c1);
  }
  if (t < 1) free.push([t, 1]);
  const at = (s: number): Point => ({ x: a.x + dx * s, y: a.y + dy * s });
  return free.filter(([s0, s1]) => (s1 - s0) * len > Math.max(minLength, 1e-6)).map(([s0, s1]) => [at(s0), at(s1)]);
}
