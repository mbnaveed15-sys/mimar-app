import { planCheck, type PlanCheck } from '../lib/planCheck';
import { planHints, type Hint } from '../lib/planHints';
import type { PlanDoc, Units } from '../types';
import { usePlanner } from './plannerStore';

// One result shared by every part of the screen (the panel and the marks), worked out once per change.
let lastCheck: { doc: PlanDoc; wallHeightMm: number; units: Units; result: PlanCheck | null } | null = null;
let lastHints: { doc: PlanDoc; units: Units; check: PlanCheck | null; result: Hint[] } | null = null;

function checkFor(doc: PlanDoc, wallHeightMm: number, units: Units): PlanCheck | null {
  if (lastCheck?.doc !== doc || lastCheck.wallHeightMm !== wallHeightMm || lastCheck.units !== units)
    lastCheck = { doc, wallHeightMm, units, result: planCheck(doc, { wallHeightMm, units }) };
  return lastCheck.result;
}

function hintsFor(doc: PlanDoc, units: Units, check: PlanCheck | null): Hint[] {
  if (lastHints?.doc !== doc || lastHints.units !== units || lastHints.check !== check) {
    // Rooms the bylaws already find too small get no size hint as well.
    const skipSizes = new Set(check?.rows.find((r) => r.id === 'rooms')?.ids ?? []);
    lastHints = { doc, units, check, result: planHints(doc, { units, skipSizes }) };
  }
  return lastHints.result;
}

/**
 * The plan as it stood before a drag or move in progress: the check waits until it is let go,
 * rather than running on every step.
 */
const settledDoc = (s: { batchBase: PlanDoc | null; doc: PlanDoc }) => s.batchBase ?? s.doc;

/** The plan measured against the plot's bylaws, updating as you draw. */
export function usePlanCheck() {
  const doc = usePlanner(settledDoc);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const units = usePlanner((s) => s.units);
  return checkFor(doc, wallHeightMm, units);
}

/** Plan hints (good-practice advice), or none when they are turned off. */
export function usePlanHints(): Hint[] {
  const doc = usePlanner(settledDoc);
  const units = usePlanner((s) => s.units);
  const show = usePlanner((s) => s.showHints);
  const check = usePlanCheck();
  return show ? hintsFor(doc, units, check) : NONE;
}

const NONE: Hint[] = [];
