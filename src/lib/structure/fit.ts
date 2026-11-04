/**
 * Keeping generated items inside a line: the building line (so they pass the setbacks check) or the
 * outer faces of the walls (so columns sit flush with the facade). Pure.
 */
import type { Point } from '../../types';

/** How far inside the line an item is put (plan units: 1 mm). */
const MARGIN = 0.1;

/**
 * The shape moved the least it needs to come inside the polygon's edges it pokes past. Only edges
 * it is near count: a shape well outside (drawn there on purpose) is left where it is.
 */
export function keepInside(pts: Point[], poly: Point[] | null | undefined): Point[] {
  if (!poly || poly.length < 3 || !pts.length) return pts;
  let area = 0;
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.y - b.x * a.y;
  });
  const sign = area >= 0 ? 1 : -1;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  let out = pts;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    poly.forEach((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const len = Math.hypot(ex, ey);
      if (!len) return;
      // The inward normal, and how far past the edge (along its length, give or take the shape's size).
      const n = { x: (-ey / len) * sign, y: (ex / len) * sign };
      let depth = 0;
      for (const q of out) {
        const t = ((q.x - a.x) * ex + (q.y - a.y) * ey) / len;
        if (t < -size || t > len + size) continue;
        const d = -((q.x - a.x) * n.x + (q.y - a.y) * n.y);
        if (d > depth && d <= size + 1) depth = d;
      }
      if (depth <= 0.05) return;
      const step = depth + MARGIN;
      out = out.map((q) => ({ x: q.x + n.x * step, y: q.y + n.y * step }));
      moved = true;
    });
    if (!moved) break;
  }
  return out;
}

/** The same move as `keepInside`, as an offset (for items placed by a centre). */
export function insideOffset(pts: Point[], polys: (Point[] | null | undefined)[]): Point {
  let moved = pts;
  for (const poly of polys) moved = keepInside(moved, poly);
  return { x: moved[0].x - pts[0].x, y: moved[0].y - pts[0].y };
}
