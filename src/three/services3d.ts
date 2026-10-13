/**
 * Services in 3D: each Services item as a simple box at its mounting height (ceiling items just under
 * the ceiling), and pipes as thin square tubes along their runs. Wires stay off the 3D view (they are
 * in the walls and ceiling); drawings show them.
 */
import { RUN_SYSTEMS, serviceOf, TRADE_COLORS } from '../lib/services';
import { MM_PER_UNIT } from '../lib/scale';
import type { Furniture, RunSystem, ServiceRun } from '../types';
import type { Solid } from './model';

const m = (units: number) => (units * MM_PER_UNIT) / 1000;
const mmToM = (mm: number) => mm / 1000;

/** Height of a pipe's underside above its floor, mm: drains on the floor, supply and gas in the wall chase. */
export const PIPE_HEIGHT_MM: Record<RunSystem, number> = {
  lighting: 0,
  power: 0,
  ac: 0,
  data: 0,
  fire: 0,
  cold: 300,
  hot: 350,
  drain: 0,
  rain: 0,
  gas: 600,
};

/** The box of a Services item, on a floor whose ceiling is `ceilingM` metres up; null for other items. */
export function serviceSolid(f: Furniture, ceilingM: number, color?: string): Solid | null {
  const info = serviceOf(f);
  if (!info) return null;
  const [w, d, h] = info.size3d;
  const rot = ((f.rotation ?? 0) * Math.PI) / 180;
  // Wall items stand with their back at the back of their footprint (against the wall).
  const back = info.mount === 'wall' ? -(f.h * MM_PER_UNIT) / 2 + d / 2 : 0;
  const at = {
    x: m(f.x) - mmToM(back) * Math.sin(rot),
    z: m(f.y) + mmToM(back) * Math.cos(rot),
  };
  const height = f.elevMm ?? info.heightMm;
  const y0 =
    info.mount === 'ceiling'
      ? Math.max(0, ceilingM - mmToM(h))
      : info.mount === 'wall'
        ? mmToM(height - h / 2)
        : mmToM(height);
  return {
    ...at,
    y0,
    w: mmToM(w),
    d: mmToM(d),
    h: mmToM(h),
    rotY: -rot,
    color: color ?? TRADE_COLORS[info.trade],
    role: 'service',
  };
}

/** A pipe run as tubes, one per leg; wires give none. */
export function runSolids(r: ServiceRun): Solid[] {
  const sys = RUN_SYSTEMS[r.system];
  if (sys.wire) return [];
  const dia = mmToM(Math.max(15, r.sizeMm ?? sys.sizeMm));
  const out: Solid[] = [];
  for (let i = 1; i < r.points.length; i++) {
    const a = r.points[i - 1];
    const b = r.points[i];
    const len = m(Math.hypot(b.x - a.x, b.y - a.y));
    if (len < 1e-4) continue;
    out.push({
      x: m((a.x + b.x) / 2),
      z: m((a.y + b.y) / 2),
      y0: mmToM(PIPE_HEIGHT_MM[r.system]),
      // A little longer so the legs meet at the corners.
      w: len + dia,
      d: dia,
      h: dia,
      rotY: -Math.atan2(b.y - a.y, b.x - a.x),
      color: sys.color,
      role: 'service',
    });
  }
  return out;
}
