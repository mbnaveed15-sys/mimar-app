import type { Point } from '../types';

export interface Protractor {
  /** The ring, as a closed run of points. */
  ring: Point[];
  /** A tick every 15°, longer every 45° and 90°, counted from the start direction. */
  ticks: [Point, Point][];
  /** The angle turned so far, as an arc inside the ring (empty until there is one). */
  arc: Point[];
}

/**
 * The Rotate tool's protractor, SketchUp style: a ring of radius `r` (plan units) round the centre,
 * its ticks lined up with the start direction, and the arc swept by `angle` degrees.
 */
export function protractor(center: Point, r: number, start: Point | undefined, angle: number): Protractor {
  const base = start ? Math.atan2(start.y - center.y, start.x - center.x) : 0;
  const at = (rad: number, len: number): Point => ({
    x: center.x + Math.cos(rad) * len,
    y: center.y + Math.sin(rad) * len,
  });
  const rad = (deg: number) => base + (deg * Math.PI) / 180;
  const ring = Array.from({ length: 72 }, (_, i) => at(rad(i * 5), r));
  const ticks: [Point, Point][] = [];
  for (let deg = 0; deg < 360; deg += 15) {
    const inner = deg % 90 === 0 ? 0.7 : deg % 45 === 0 ? 0.8 : 0.88;
    ticks.push([at(rad(deg), r * inner), at(rad(deg), r)]);
  }
  const arc: Point[] = [];
  if (start && Math.abs(angle) > 0.01) {
    const n = Math.max(2, Math.ceil(Math.abs(angle) / 5));
    for (let i = 0; i <= n; i++) arc.push(at(rad((angle * i) / n), r * 0.55));
  }
  return { ring, ticks, arc };
}
