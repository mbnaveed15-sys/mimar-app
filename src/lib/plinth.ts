/**
 * The automatic plinth's shape under each ground-floor wall: the wall made wider by how far the
 * plinth stands out past its faces (the plinth's own setting, or the wall's). Used by 3D, the plan,
 * the plan PDF and DXF. Pure.
 */
import { pointInPolygon } from '../geometry';
import { isBuildingWall, takesPlinth, thicknessOf, wallPolygon, wallsOf } from '../walls';
import { MM_PER_UNIT } from './scale';
import type { Id, PlanDoc, Point, Wall } from '../types';

/** How far the plinth under a wall stands out past each of its faces, mm. */
export const plinthProjectMm = (doc: Pick<PlanDoc, 'plinth'>, w: Wall): number =>
  w.plinthProjectMm ?? doc.plinth?.projectMm ?? 0;

/** The plinth's material under a wall (the wall's own when neither is set). */
export const plinthMaterialOf = (doc: Pick<PlanDoc, 'plinth'>, w: Wall): Id | undefined =>
  w.plinthMaterial ?? doc.plinth?.material;

/** Whether any wall has a plinth setting of its own. */
export const hasOwnPlinth = (w: Wall) => w.plinthProjectMm !== undefined || w.plinthMaterial !== undefined;

/**
 * Building walls made as wide as the plinth under them, for the plinth's joins (null when it is
 * flush everywhere, so the walls themselves serve).
 */
export function plinthWalls(doc: Pick<PlanDoc, 'plinth'>, walls: Wall[]): Map<Id, Wall> | null {
  const building = walls.filter(isBuildingWall);
  if (!building.some((w) => plinthProjectMm(doc, w) > 0)) return null;
  return new Map(
    building.map((w) => [w.id, { ...w, thickness: thicknessOf(w) + (2 * plinthProjectMm(doc, w)) / MM_PER_UNIT }]),
  );
}

/**
 * The plinth's outline under each ground-floor wall that has one standing out past its faces: what
 * the plan shows round the walls. Walls flush with their plinth show nothing more.
 */
export function plinthOutlines(
  doc: Pick<PlanDoc, 'plinth' | 'ownPlinth' | 'plinthMm' | 'elements'>,
): { wallId: Id; points: Point[] }[] {
  if (doc.ownPlinth || !(doc.plinthMm > 0.5)) return [];
  const walls = wallsOf(doc.elements).filter((w) => takesPlinth(doc, w));
  const wider = plinthWalls(doc, walls);
  if (!wider) return [];
  const all = [...wider.values()];
  return walls
    .filter((w) => !w.noPlinth && plinthProjectMm(doc, w) > 0)
    .map((w) => ({ wallId: w.id, points: wallPolygon(wider.get(w.id)!, all) }));
}

/** The wall whose plinth (standing out past it) is under `p` on the plan, or null. */
export function plinthAt(doc: Pick<PlanDoc, 'plinth' | 'ownPlinth' | 'plinthMm' | 'elements'>, p: Point): Id | null {
  return plinthOutlines(doc).find((o) => pointInPolygon(p, o.points))?.wallId ?? null;
}
