import { useMemo } from 'react';
import { planCheck } from '../lib/planCheck';
import { usePlanner } from './plannerStore';

/** The plan measured against the plot's bylaws, updating as you draw. */
export function usePlanCheck() {
  const doc = usePlanner((s) => s.doc);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const units = usePlanner((s) => s.units);
  return useMemo(() => planCheck(doc, { wallHeightMm, units }), [doc, wallHeightMm, units]);
}
