import { stairRiseMm } from './levels';
import { stairLayout } from './site';
import { levelOf, type PlanDoc } from '../types';

/** How close (mm) a stair's climb must be to a floor's height to count as climbing that floor. */
const SAME = 3;

/**
 * The plan after a change to floor heights (`prev` → `next`, with the walls' default height before and after),
 * with each stair that climbed a whole floor, or the plinth, still climbing it: its risers and footprint are
 * worked out again. A stair given its own climb is left as it is.
 */
export function stairsFollow(prev: PlanDoc, next: PlanDoc, prevWallMm: number, nextWallMm: number): PlanDoc {
  let changed = false;
  const elements = next.elements.map((el) => {
    if (el.type !== 'stair' || el.shape === 'ramp') return el;
    const level = levelOf(el);
    for (const climb of ['floor', 'plinth'] as const) {
      if (Math.abs(el.riseMm - stairRiseMm(prev, level, climb, prevWallMm)) > SAME) continue;
      const riseMm = stairRiseMm(next, level, climb, nextWallMm);
      if (Math.abs(riseMm - el.riseMm) <= 0.05) return el;
      const moved = { ...el, riseMm };
      const l = stairLayout(moved);
      changed = true;
      return { ...moved, riserMm: l.riserMm, w: l.w, h: l.h };
    }
    return el;
  });
  return changed ? { ...next, elements } : next;
}
