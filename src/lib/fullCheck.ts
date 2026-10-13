/**
 * The plan check with a building's use checked too: the bylaw rows from `planCheck.ts`, the
 * authority's rows for the building from `buildingCheck.ts`, and for a non-residential building one
 * row per kind of building-use hint (exits, toilets, access…). Pure.
 */
import { buildingCheckRows } from './buildingCheck';
import { buildingPeople, buildingUseRows, rowsNotNeeded } from './buildingUse';
import { planCheck, type CheckRow, type PlanCheck } from './planCheck';
import { planHints } from './planHints';
import { projectOf } from './project';
import type { PlanDoc, Units } from '../types';

export function fullCheck(doc: PlanDoc, ctx: { wallHeightMm: number; units: Units }): PlanCheck | null {
  const check = planCheck(doc, ctx);
  const project = projectOf(doc);
  if (!check || project.type !== 'building') return check;
  const use = project.use ?? 'other';
  // Worked out even with the hints section hidden: these rows stand on their own.
  const withHints = { ...doc, project: { ...project, panels: { ...project.panels, hints: true } } };
  const hints = planHints(withHints, { units: ctx.units }).filter((h) => h.kind === 'use');
  const bylawRows = buildingCheckRows(doc, check, ctx);
  const useRows = buildingUseRows(hints, buildingPeople(doc, use), rowsNotNeeded(doc, use));
  return { ...check, rows: [...check.rows, ...mergeOverlaps(bylawRows, useRows)] };
}

/** The authority's rows and the national codes' rows that check the same thing. */
const SAME: [string, string][] = [
  ['bylaw-lift', 'use-lift'],
  ['bylaw-ramp', 'use-ramp'],
  ['bylaw-stairs', 'use-stairs'],
];
const WORST: CheckRow['status'][] = ['fail', 'check', 'ok'];

/**
 * One row for each thing checked: where the authority and the national codes both check the lift,
 * the ramp or the stairs, the authority's row carries both (the worse result, both clauses), and the
 * national code's row goes.
 */
function mergeOverlaps(bylawRows: CheckRow[], useRows: CheckRow[]): CheckRow[] {
  const merged = bylawRows.map((row) => {
    const pair = SAME.find(([b]) => b === row.id);
    const other = pair && useRows.find((u) => u.id === pair[1]);
    if (!other || other.status === 'ok') return row;
    return {
      ...row,
      required: `${row.required}; ${other.required.replace(/^./, (c) => c.toLowerCase())}`,
      actual: row.status === 'ok' ? other.actual : `${row.actual}. ${other.actual}`,
      status: WORST.find((s) => s === row.status || s === other.status)!,
      clause: `${row.clause}; ${other.clause}`,
      ids: [...new Set([...(row.ids ?? []), ...(other.ids ?? [])])],
    };
  });
  const gone = new Set(SAME.filter(([b]) => bylawRows.some((r) => r.id === b)).map(([, u]) => u));
  return [...merged, ...useRows.filter((u) => !gone.has(u.id))];
}
