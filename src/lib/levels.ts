/**
 * Floors: the basement (if any) comes first, then the Ground (site) level (if any), then the ground
 * floor, then the floors above it. Pure helpers for telling them apart and for their heights.
 */
import { BASEMENT_HEIGHT_MM, GROUND_LEVEL, SITE_LEVEL, type Level, type PlanDoc } from '../types';

/** Where the ground floor is in the list of floors. */
export const groundIndex = (doc: Pick<PlanDoc, 'levels'>) =>
  Math.max(
    0,
    doc.levels.findIndex((l) => l.id === GROUND_LEVEL),
  );

/** The basement, if the plan has one. */
export const basementOf = (doc: Pick<PlanDoc, 'levels'>): Level | undefined => doc.levels.find((l) => l.basement);

export const isBasement = (doc: Pick<PlanDoc, 'levels'>, id: string) => !!doc.levels.find((l) => l.id === id)?.basement;

/** Whether this is the Ground (site) level: the lawn under the ground floor, not a storey. */
export const isSiteLevel = (doc: Pick<PlanDoc, 'levels'>, id: string) =>
  id === SITE_LEVEL || !!doc.levels.find((l) => l.id === id)?.site;

/** The floors of the building: every level but the Ground (site) level. */
export const buildingLevels = (doc: Pick<PlanDoc, 'levels'>): Level[] => doc.levels.filter((l) => !l.site);

/** The Ground (site) level as it is (or will be) added: under the ground floor, after any basement. */
export const SITE_LEVEL_DEF: Level = { id: SITE_LEVEL, name: 'Ground (site)', site: true };

/** The levels with the Ground (site) level in its place (unchanged when it is there already). */
export function withSiteLevel(levels: Level[]): Level[] {
  if (levels.some((l) => l.site)) return levels;
  const at = Math.max(
    0,
    levels.findIndex((l) => l.id === GROUND_LEVEL),
  );
  return [...levels.slice(0, at), SITE_LEVEL_DEF, ...levels.slice(at)];
}

/** The lawn's height above the datum (mm): what the plot is levelled to, or ±0 left natural. */
export const lawnMm = (doc: Pick<PlanDoc, 'ground'>) =>
  doc.ground?.grade === 'natural' ? 0 : (doc.ground?.levelMm ?? 0);

/** The lowest a wall on the Ground (site) level is by default: 6". */
const MIN_SITE_WALL_MM = 152.4;

/** The usual height of a wall on the Ground (site) level: up to the ground floor, from the lawn. */
export const siteWallMm = (doc: Pick<PlanDoc, 'plinthMm' | 'ground'>) =>
  Math.max(MIN_SITE_WALL_MM, (doc.plinthMm ?? 0) - lawnMm(doc));

/**
 * How tall a floor's walls are by default: its own height, or a basement's usual, or (on the Ground
 * (site) level) up to the plinth, or the usual wall height.
 */
export function levelWallMm(
  doc: Pick<PlanDoc, 'levels'> & Partial<Pick<PlanDoc, 'plinthMm' | 'ground'>>,
  id: string,
  wallHeightMm: number,
): number {
  const level = doc.levels.find((l) => l.id === id);
  if (level?.site) return level.heightMm ?? siteWallMm({ plinthMm: doc.plinthMm ?? 0, ground: doc.ground });
  return level?.heightMm ?? (level?.basement ? BASEMENT_HEIGHT_MM : wallHeightMm);
}

/** A floor slab's usual thickness: 6". */
export const DEFAULT_SLAB_MM = 152.4;

/** The project's floor slab thickness, mm. */
export const slabMm = (doc: Pick<PlanDoc, 'project'>) => doc.project?.slabMm ?? DEFAULT_SLAB_MM;

/**
 * How high a new stair climbs: a full floor (its walls and slab) or the plinth; on the Ground (site)
 * level, from the lawn up to the ground floor either way.
 */
export function stairRiseMm(
  doc: Pick<PlanDoc, 'levels' | 'plinthMm' | 'ground' | 'project'>,
  levelId: string,
  climb: 'floor' | 'plinth',
  wallHeightMm: number,
): number {
  if (isSiteLevel(doc, levelId)) return siteWallMm(doc);
  return climb === 'plinth' ? doc.plinthMm : levelWallMm(doc, levelId, wallHeightMm) + slabMm(doc);
}
