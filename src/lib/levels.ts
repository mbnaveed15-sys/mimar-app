/**
 * Floors: the basement (if any) comes first, then the ground floor, then the floors above it.
 * Pure helpers for telling them apart and for their heights.
 */
import { BASEMENT_HEIGHT_MM, GROUND_LEVEL, type Level, type PlanDoc } from '../types';

/** Where the ground floor is in the list of floors. */
export const groundIndex = (doc: Pick<PlanDoc, 'levels'>) =>
  Math.max(
    0,
    doc.levels.findIndex((l) => l.id === GROUND_LEVEL),
  );

/** The basement, if the plan has one. */
export const basementOf = (doc: Pick<PlanDoc, 'levels'>): Level | undefined => doc.levels.find((l) => l.basement);

export const isBasement = (doc: Pick<PlanDoc, 'levels'>, id: string) => !!doc.levels.find((l) => l.id === id)?.basement;

/** How tall a floor's walls are by default: a basement's own clear height, or the usual wall height. */
export function levelWallMm(doc: Pick<PlanDoc, 'levels'>, id: string, wallHeightMm: number): number {
  const level = doc.levels.find((l) => l.id === id);
  return level?.basement ? (level.heightMm ?? BASEMENT_HEIGHT_MM) : wallHeightMm;
}
