/** The plan's drawings and sheets as the app has them now (for exports and the Drawings view). */
import { baseName } from '../files';
import type { PlanImageContent } from '../planImage';
import type { PlannerState } from '../../store/plannerStore';
import { groundOf } from '../terrain/ground';
import { groundOnPlan } from '../terrain/groundView';
import { GROUND_LEVEL, levelOf, type PlanDoc } from '../../types';
import type { SheetSource } from './sheet';
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

/** A floor's plan as it is drawn on a sheet: its items, and the section lines of every floor. */
export function levelContent(
  s: Pick<
    PlannerState,
    | 'doc'
    | 'units'
    | 'marlaSqFt'
    | 'showDimensions'
    | 'showFurniture'
    | 'showRoomLabels'
    | 'showRoomFills'
    | 'exportLines'
  >,
  shown: PlanDoc,
  levelId: string,
): PlanImageContent {
  const onLevel = <T extends { levelId?: string }>(it: T) => levelOf(it) === levelId;
  const elements = shown.elements.filter(
    (el) => (onLevel(el) || el.type === 'section') && (s.exportLines || el.type !== 'line'),
  );
  const doc = { ...shown, elements, rooms: shown.rooms.filter(onLevel) };
  const { units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills } = s;
  // The ground is worked out from the whole plan (hidden levels still shape it), on the ground floor.
  const ground = levelId === GROUND_LEVEL ? groundOnPlan({ ...s.doc, layers: shown.layers }, units === 'metric') : null;
  return { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills, ground };
}
