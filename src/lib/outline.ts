/** The outside of a building's walls, for basements under it. Pure. */
import { pointToSegmentDistance } from '../geometry';
import { polygonArea, wallFaces } from '../rooms';
import { thicknessOf } from '../walls';
import { insetPolygon } from './plot';
import type { Point, Wall } from '../types';

/**
 * The outline round the outside faces of a group of joined walls (the biggest group): the walls'
 * centre lines round the outside, moved out by half of each wall's thickness. Null with no closed walls.
 */
export function outsideOutline(walls: Wall[]): Point[] | null {
  const loop = wallFaces(walls, true).sort((a, b) => polygonArea(b) - polygonArea(a))[0];
  if (!loop) return null;
  const half = loop.map((a, i) => {
    const b = loop[(i + 1) % loop.length];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const wall = walls.find((w) => pointToSegmentDistance(mid, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) < 0.5);
    return wall ? thicknessOf(wall) / 2 : 0;
  });
  // A negative set-in moves the sides out.
  const out = insetPolygon(
    loop,
    half.map((h) => -h),
  ).points;
  return out.length >= 3 ? out : loop;
}
