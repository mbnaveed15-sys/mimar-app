import { fullCheck } from '../lib/fullCheck';
import type { PlanCheck } from '../lib/planCheck';
import { planHints, type Hint } from '../lib/planHints';
import type { PlanDoc, Units } from '../types';
import { usePlanner } from './plannerStore';
import { filterCheck, filterHints, type ChecksPrefs } from '../lib/checks';

// One result shared by every part of the screen (the panel and the marks), worked out once per change.
let lastCheck: { doc: PlanDoc; wallHeightMm: number; units: Units; result: PlanCheck | null } | null = null;
let lastHints: {
  doc: PlanDoc;
  units: Units;
  check: PlanCheck | null;
  gapMm: number;
  accessible: boolean;
  result: Hint[];
} | null = null;

function checkFor(doc: PlanDoc, wallHeightMm: number, units: Units): PlanCheck | null {
  if (lastCheck?.doc !== doc || lastCheck.wallHeightMm !== wallHeightMm || lastCheck.units !== units)
    lastCheck = { doc, wallHeightMm, units, result: fullCheck(doc, { wallHeightMm, units }) };
  return lastCheck.result;
}

function hintsFor(doc: PlanDoc, units: Units, check: PlanCheck | null, gapMm: number, accessible: boolean): Hint[] {
  if (
    lastHints?.doc !== doc ||
    lastHints.units !== units ||
    lastHints.check !== check ||
    lastHints.gapMm !== gapMm ||
    lastHints.accessible !== accessible
  ) {
    // Rooms the bylaws already find too small get no size hint as well.
    const skipSizes = new Set(check?.rows.find((r) => r.id === 'rooms')?.ids ?? []);
    lastHints = {
      doc,
      units,
      check,
      gapMm,
      accessible,
      // A building's use is checked in the plan check's own rows: not repeated as hints.
      result: planHints(doc, { units, skipSizes, gapMm, accessible }).filter(
        (h) => !(h.kind === 'use' && check?.rows.some((r) => r.id.startsWith('use-'))),
      ),
    };
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
  const checks = usePlanner((s) => s.checks);
  return shownCheck(useFullCheck(), checks);
}

/** The whole plan check, whatever the Checks button says (the hints skip rooms it finds too small). */
export function useFullCheck() {
  const doc = usePlanner(settledDoc);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const units = usePlanner((s) => s.units);
  return checkFor(doc, wallHeightMm, units);
}

// Filtered results are kept too, so the same object comes back while nothing changes.
let lastShown: { check: PlanCheck | null; checks: ChecksPrefs; result: PlanCheck | null } | null = null;
function shownCheck(check: PlanCheck | null, checks: ChecksPrefs): PlanCheck | null {
  if (lastShown?.check !== check || lastShown.checks !== checks)
    lastShown = { check, checks, result: filterCheck(check, checks) };
  return lastShown.result;
}
let lastShownHints: { hints: Hint[]; checks: ChecksPrefs; result: Hint[] } | null = null;
function shownHints(hints: Hint[], checks: ChecksPrefs): Hint[] {
  if (lastShownHints?.hints !== hints || lastShownHints.checks !== checks)
    lastShownHints = { hints, checks, result: filterHints(hints, checks) };
  return lastShownHints.result;
}

/** Plan hints (good-practice advice), or none when they are turned off. */
export function usePlanHints(): Hint[] {
  const doc = usePlanner(settledDoc);
  const units = usePlanner((s) => s.units);
  const show = usePlanner((s) => s.showHints);
  const gapMm = usePlanner((s) => s.openingGapMm);
  const accessible = usePlanner((s) => s.accessibleZones);
  const checks = usePlanner((s) => s.checks);
  const check = useFullCheck();
  return show ? shownHints(hintsFor(doc, units, check, gapMm, accessible), checks) : NONE;
}

const NONE: Hint[] = [];
