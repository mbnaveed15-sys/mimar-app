import type { PlannerState } from '../store/plannerStore';
import { modifyEnter } from './modifyTools';
import { shapeEnter } from './shapeTools';
import { finishContour } from './groundTools';
import { finishPlotPoly, finishRoof } from './structureTools';
import { finishArcWall } from './controller';

interface Store {
  getState: () => PlannerState;
}

/**
 * Enter, or a right-click while drawing (as in AutoCAD): finish the current step. Returns false
 * when there was nothing to finish.
 */
export function finishStep(store: Store): boolean {
  if (modifyEnter(store) || shapeEnter(store) || finishPlotPoly(store) || finishRoof(store) || finishContour(store))
    return true;
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'mask') {
    s.finishMask();
    return true;
  }
  // An arc wall being bent goes in as it is, and the chain stops.
  if (d?.type === 'wall' && d.bend) {
    finishArcWall(store, d.bow ?? 0, 0, false);
    return true;
  }
  if (d?.type === 'wall' || d?.type === 'line' || d?.type === 'tape') {
    s.setDraft(null);
    return true;
  }
  return false;
}
