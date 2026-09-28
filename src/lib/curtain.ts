/**
 * Glass curtain walls: glass in a frame of mullions (upright) spaced evenly along the wall, no more
 * than the set spacing apart, with a transom (cross frame) at door height unless set otherwise.
 * A curved one is flat panes between its mullions. Pure.
 */
import type { PlanDoc, Wall } from '../types';
import { runLength } from './arc';
import { projectOf, unitsFor } from './project';
import { MM_PER_UNIT } from './scale';

/** Mullions every 4' (1.2 m in metric) unless set. */
export const MULLION_MM = { imperial: 1219.2, metric: 1200 } as const;
/** The transom's height when not set: the head of a door (7'). */
export const TRANSOM_MM = 2133.6;
/** The frame's face width (mm): mullions, transoms and the rails at the foot and head. */
export const FRAME_MM = 60;

export const isCurtain = (w: Wall) => w.kind === 'curtain';

/** Whether the project is measured in metric (a building or free project), for the mullions' default spacing. */
export const metricProject = (doc: Pick<PlanDoc, 'project'>) => unitsFor(projectOf(doc).type) === 'metric';

/** How far apart the mullions may be, mm. */
export const mullionSpacingMm = (w: Wall, metric: boolean) => w.mullionMm ?? MULLION_MM[metric ? 'metric' : 'imperial'];

/** The transom's height above the floor (mm), or null for none (set to 0, or at or above the wall's top). */
export function transomMm(w: Wall, wallHeightMm: number): number | null {
  const at = w.transomMm ?? TRANSOM_MM;
  return at > FRAME_MM && at < wallHeightMm - FRAME_MM ? at : null;
}

/** Where the mullions stand, as fractions along the wall: both ends, and evenly between. */
export function mullionStops(w: Wall, metric: boolean): number[] {
  const lenMm = runLength(w) * MM_PER_UNIT;
  const n = Math.max(1, Math.ceil(lenMm / mullionSpacingMm(w, metric) - 1e-6));
  return Array.from({ length: n + 1 }, (_, i) => i / n);
}
