/** The plan's drawings and sheets as the app has them now (for exports and the Drawings view). */
import { baseName } from '../files';
import type { PlanImageContent } from '../planImage';
import type { PlannerState } from '../../store/plannerStore';
import { groundOf } from '../terrain/ground';
import { groundOnPlan } from '../terrain/groundView';
import { floorVoids } from '../voids';
import { GROUND_LEVEL, levelOf, type PlanDoc } from '../../types';
import type { PlanServices, SheetSource } from './sheet';
import { RUN_SYSTEMS, runsOf, tradeOf } from '../services';
import { layerOf } from '../layers';
import { isStructurePlan } from './refs';
import { sideCache } from './views';

/** What a sheet or a side drawing is drawn from: the plan without its hidden items. */
export function drawingSource(s: PlannerState, shown: PlanDoc = s.shownDoc()): SheetSource {
  return {
    doc: shown,
    // Hidden spot levels still shape the ground the drawings cut through.
    side: sideCache(shown, { wallHeightMm: s.wallHeightMm, units: s.units, ground: groundOf(s.doc) }),
    projectName: baseName(s.fileName),
    version: __APP_VERSION__,
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

/**
 * A floor's plan as it is drawn on a sheet: its items, and the section lines of every floor; with no
 * services, one trade's only, or all of them when `services` is missing.
 */
export function levelContent(
  s: Pick<
    PlannerState,
    | 'doc'
    | 'units'
    | 'marlaSqFt'
    | 'areaIn'
    | 'showDimensions'
    | 'showFurniture'
    | 'showRoomLabels'
    | 'showRoomFills'
    | 'exportLines'
  >,
  shown: PlanDoc,
  levelId: string,
  services?: PlanServices,
): PlanImageContent {
  const onLevel = <T extends { levelId?: string }>(it: T) => levelOf(it) === levelId;
  const structure = isStructurePlan(services) ? services : null;
  const wanted = (el: PlanDoc['elements'][number]) => {
    const layer = layerOf(el);
    // The foundation plan: the walls over them, the columns and the foundations; a framing plan: the
    // walls, openings, columns, beams, slabs and stairs; other plans leave the foundations out.
    if (structure === 'foundation') return el.type === 'wall' || el.type === 'column' || layer === 'foundations';
    if (structure === 'framing')
      return layer !== 'foundations' && ['wall', 'door', 'window', 'column', 'beam', 'slab', 'stair'].includes(el.type);
    if (layer === 'foundations') return false;
    const trade = services && !isStructurePlan(services) && tradeOf(el);
    if (trade) return trade === services;
    // A trade's own sheet shows no furniture or decor: only the fixtures its pipes or wires join.
    if (services && services !== 'none' && el.type === 'furniture')
      return runsOf(el).some((r) => RUN_SYSTEMS[r].trade === services);
    return true;
  };
  const elements = shown.elements.filter(
    (el) =>
      // Section lines belong on the floor plans, not on a trade's layout.
      (el.type === 'section' ? !services || services === 'none' : onLevel(el)) &&
      (s.exportLines || el.type !== 'line') &&
      wanted(el),
  );
  const doc = { ...shown, elements, rooms: structure === 'foundation' ? [] : shown.rooms.filter(onLevel) };
  const { units, marlaSqFt, areaIn, showDimensions, showRoomLabels } = s;
  const showFurniture = s.showFurniture && !structure;
  const showRoomFills = s.showRoomFills && !structure;
  // The ground is worked out from the whole plan (hidden levels still shape it), on the ground floor.
  const ground = levelId === GROUND_LEVEL ? groundOnPlan({ ...s.doc, layers: shown.layers }, units === 'metric') : null;
  const voids = floorVoids(shown, levelId);
  return {
    doc,
    units,
    marlaSqFt,
    areaIn,
    showDimensions,
    showFurniture,
    showRoomLabels,
    showRoomFills,
    ground: structure ? null : ground,
    voids,
    ...(structure && { marks: true }),
  };
}
