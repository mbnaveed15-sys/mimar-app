/**
 * On Ground, whether a spot is on the floor (inside the house: within the ground floor's walls or
 * rooms) or on the lawn round it, so new and moved items go to the right one by themselves. Pure.
 */
import { elementCenter, pointInPolygon } from '../geometry';
import { wallFaces } from '../rooms';
import {
  GROUND_LEVEL,
  levelOf,
  SITE_LEVEL,
  type Id,
  type PlanDoc,
  type PlanElement,
  type Point,
  type Wall,
} from '../types';

/** Items that go where they stand; walls, openings, drafting lines and slabs keep the floor picked. */
const SETTLES = new Set<PlanElement['type']>(['furniture', 'run', 'column', 'stair', 'block']);

export const settlesOnGround = (el: PlanElement) => SETTLES.has(el.type);

/** The house's outlines on the ground floor (null when it has no walls or rooms yet). */
export function houseOutlines(doc: Pick<PlanDoc, 'elements' | 'rooms'>): Point[][] | null {
  const walls = doc.elements.filter(
    (el): el is Wall => el.type === 'wall' && el.kind !== 'boundary' && levelOf(el) === GROUND_LEVEL,
  );
  const outlines = [
    ...wallFaces(walls, true),
    ...doc.rooms.filter((r) => levelOf(r) === GROUND_LEVEL).map((r) => r.points),
  ];
  return outlines.length ? outlines : null;
}

/** The Ground level a spot belongs to, or null when the plan has no lawn level or no house yet. */
export function groundSpot(
  doc: Pick<PlanDoc, 'elements' | 'rooms' | 'levels'>,
  p: Point,
  outlines = houseOutlines(doc),
): Id | null {
  if (!doc.levels.some((l) => l.site) || !outlines) return null;
  return outlines.some((o) => pointInPolygon(p, o)) ? GROUND_LEVEL : SITE_LEVEL;
}

/** An item on Ground put on the floor or the lawn by where its middle stands (unchanged when it can't tell). */
export function settleOnGround<T extends PlanElement>(
  doc: Pick<PlanDoc, 'elements' | 'rooms' | 'levels'>,
  el: T,
  outlines = houseOutlines(doc),
): T {
  if (!settlesOnGround(el) || ('slabId' in el && el.slabId)) return el;
  const on = levelOf(el);
  if (on !== GROUND_LEVEL && on !== SITE_LEVEL) return el;
  const spot = groundSpot(doc, elementCenter(el), outlines);
  if (!spot || spot === on) return el;
  if (spot === SITE_LEVEL) return { ...el, levelId: SITE_LEVEL };
  const next = { ...el };
  delete next.levelId;
  return next;
}
