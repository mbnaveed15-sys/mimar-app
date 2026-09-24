import { planBounds } from '../geometry';
import { roomAreaSqMm } from '../rooms';
import { plannerStore } from '../store/plannerStore';
import { exportPdf } from './exportPdf';
import { exportPng } from './exportPng';
import { baseName } from './files';
import { formatArea, formatMarla, UNIT_LABELS } from './units';
import { DEFAULT_AREA } from './view';

function exportArea() {
  const s = plannerStore.getState();
  return planBounds(s.levelElements(), s.doc.masks) ?? DEFAULT_AREA;
}

/** The floor being viewed: exports show one floor at a time. */
function exportContent() {
  const s = plannerStore.getState();
  const doc = { ...s.doc, elements: s.levelElements(), rooms: s.levelRooms() };
  const { units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills } = s;
  return { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills };
}

/** "House" or "House – First floor" when the plan has more than one floor. */
function exportName() {
  const { doc, fileName, activeLevel } = plannerStore.getState();
  const level = doc.levels.find((l) => l.id === activeLevel);
  return doc.levels.length > 1 && level ? `${baseName(fileName)} – ${level.name}` : baseName(fileName);
}

/** Download the plan as a PNG, with the grid if it is shown. */
export function exportPlanPng() {
  const { gridPx, grid, setWarning } = plannerStore.getState();
  const shownGrid = grid.show ? { step: gridPx, look: grid } : null;
  exportPng(exportContent(), exportArea(), shownGrid, `${exportName()}.png`).catch((e) =>
    setWarning(`The image could not be created. ${String(e)}`),
  );
}

/** Download a print-ready PDF at a true scale. */
export function exportPlanPdf() {
  const { paper, units, marlaSqFt, setWarning } = plannerStore.getState();
  const name = exportName();
  const covered = plannerStore
    .getState()
    .levelRooms()
    .reduce((sum, r) => sum + roomAreaSqMm(r), 0);
  exportPdf(exportContent(), exportArea(), {
    title: name,
    paper,
    unitsNote: `Dimensions in ${UNIT_LABELS[units].toLowerCase()}`,
    areaNote: covered ? `Covered area: ${formatArea(covered, units)}  ·  ${formatMarla(covered, marlaSqFt)}` : '',
    version: __APP_VERSION__,
    filename: `${name}.pdf`,
  }).catch((e) => setWarning(`The PDF could not be created. ${String(e)}`));
}
