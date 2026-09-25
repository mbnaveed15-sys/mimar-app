/**
 * The faces of items as seen from above, so Push/Pull works in the 2D plan: a wall's sides and
 * ends, slab and block edges, column sides, and a beam's sides and ends. Pure.
 */
import { elementOutline, pointToSegmentDistance } from '../geometry';
import { edgeNormal } from './pushPull';
import type { Id, PlanElement, Point } from '../types';
import { thicknessOf } from '../walls';

/** A face seen from above: the line it makes on the plan, and the way it faces (a unit vector). */
export interface PlanFace {
  id: Id;
  a: Point;
  b: Point;
  normal: Point;
}

/** The faces of an item that Push/Pull can take hold of in 2D. */
export function planFaces(el: PlanElement): PlanFace[] {
  const face = (a: Point, b: Point, normal: Point): PlanFace => ({ id: el.id, a, b, normal });
  switch (el.type) {
    case 'wall':
    case 'beam': {
      const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1);
      if (!len) return [];
      const u = { x: (el.x2 - el.x1) / len, y: (el.y2 - el.y1) / len };
      const n = { x: -u.y, y: u.x };
      const h = (el.type === 'wall' ? thicknessOf(el) : el.width) / 2;
      const at = (p: Point, side: number) => ({ x: p.x + n.x * h * side, y: p.y + n.y * h * side });
      const s = { x: el.x1, y: el.y1 };
      const e = { x: el.x2, y: el.y2 };
      return [
        face(at(s, 1), at(e, 1), n),
        face(at(s, -1), at(e, -1), { x: -n.x, y: -n.y }),
        face(at(s, 1), at(s, -1), { x: -u.x, y: -u.y }),
        face(at(e, 1), at(e, -1), u),
      ];
    }
    case 'column': {
      if (el.shape === 'round') return [];
      const pts = elementOutline(el);
      return pts.map((a, i) => face(a, pts[(i + 1) % pts.length], edgeNormal(pts, i)));
    }
    case 'slab':
    case 'block':
      // A flat shape is pulled up (in 3D), not out.
      if (el.type === 'block' && el.heightMm <= 0) return [];
      return el.points.map((a, i) => face(a, el.points[(i + 1) % el.points.length], edgeNormal(el.points, i)));
    default:
      return [];
  }
}

/**
 * The face nearest p within `tolerance` (plan units). A round column is taken by its edge, facing
 * out from its centre towards p.
 */
export function faceAt2D(elements: PlanElement[], p: Point, tolerance: number): PlanFace | null {
  let best: PlanFace | null = null;
  let bestD = tolerance;
  for (const el of elements) {
    if (el.type === 'column' && el.shape === 'round') {
      const d = Math.hypot(p.x - el.x, p.y - el.y);
      const gap = Math.abs(d - el.w / 2);
      if (gap < bestD && d > 0) {
        const n = { x: (p.x - el.x) / d, y: (p.y - el.y) / d };
        const at = { x: el.x + (n.x * el.w) / 2, y: el.y + (n.y * el.w) / 2 };
        // Show a short line across the point grabbed.
        const t = { x: -n.y * (el.w / 4), y: n.x * (el.w / 4) };
        best = { id: el.id, a: { x: at.x - t.x, y: at.y - t.y }, b: { x: at.x + t.x, y: at.y + t.y }, normal: n };
        bestD = gap;
      }
      continue;
    }
    for (const f of planFaces(el)) {
      const d = pointToSegmentDistance(p, f.a, f.b);
      if (d < bestD) {
        best = f;
        bestD = d;
      }
    }
  }
  return best;
}
