import { useMemo } from 'react';
import { planCheck } from '../lib/planCheck';
import { planHints } from '../lib/planHints';
import { usePlanner } from './plannerStore';

/** The plan measured against the plot's bylaws, updating as you draw. */
export function usePlanCheck() {
  const doc = usePlanner((s) => s.doc);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const units = usePlanner((s) => s.units);
  return useMemo(() => planCheck(doc, { wallHeightMm, units }), [doc, wallHeightMm, units]);
}

/** Plan hints (good-practice advice), or none when they are turned off. */
export function usePlanHints() {
  const doc = usePlanner((s) => s.doc);
  const units = usePlanner((s) => s.units);
  const show = usePlanner((s) => s.showHints);
  const check = usePlanCheck();
  return useMemo(() => {
    if (!show) return [];
    // Rooms the bylaws already find too small get no size hint as well.
    const skipSizes = new Set(check?.rows.find((r) => r.id === 'rooms')?.ids ?? []);
    return planHints(doc, { units, skipSizes });
  }, [doc, units, show, check]);
}
