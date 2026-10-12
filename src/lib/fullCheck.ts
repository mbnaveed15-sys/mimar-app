/**
 * The plan check with a building's use checked too: the bylaw rows from `planCheck.ts`, and for a
 * non-residential building one row per kind of building-use hint (exits, toilets, access…). Pure.
 */
import { buildingPeople, buildingUseRows, rowsNotNeeded } from './buildingUse';
import { planCheck, type PlanCheck } from './planCheck';
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
  return {
    ...check,
    rows: [...check.rows, ...buildingUseRows(hints, buildingPeople(doc, use), rowsNotNeeded(doc, use))],
  };
}
