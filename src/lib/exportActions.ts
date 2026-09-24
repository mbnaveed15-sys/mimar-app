import { planBounds } from '../geometry';
import { roomAreaSqMm } from '../rooms';
import { plannerStore } from '../store/plannerStore';
import { exportPdf } from './exportPdf';
import { exportPng } from './exportPng';
import { baseName } from './files';
import { formatArea, formatMarla, UNIT_LABELS } from './units';
import { DEFAULT_AREA } from './view';

function exportArea() {
  const { doc } = plannerStore.getState();
  return planBounds(doc.elements, doc.masks) ?? DEFAULT_AREA;
}

function exportContent() {
  const { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills } =
    plannerStore.getState();
  return { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills };
}

/** Download the plan as a PNG, with the grid if it is shown. */
export function exportPlanPng() {
  const { fileName, gridPx, grid, setWarning } = plannerStore.getState();
  const shownGrid = grid.show ? { step: gridPx, look: grid } : null;
  exportPng(exportContent(), exportArea(), shownGrid, `${baseName(fileName)}.png`).catch((e) =>
    setWarning(`The image could not be created. ${String(e)}`),
  );
}

/** Download a print-ready PDF at a true scale. */
export function exportPlanPdf() {
  const { doc, fileName, paper, units, marlaSqFt, setWarning } = plannerStore.getState();
  const name = baseName(fileName);
  const covered = doc.rooms.reduce((sum, r) => sum + roomAreaSqMm(r), 0);
  exportPdf(exportContent(), exportArea(), {
    title: name,
    paper,
    unitsNote: `Dimensions in ${UNIT_LABELS[units].toLowerCase()}`,
    areaNote: covered ? `Covered area: ${formatArea(covered, units)}  ·  ${formatMarla(covered, marlaSqFt)}` : '',
    version: __APP_VERSION__,
    filename: `${name}.pdf`,
  }).catch((e) => setWarning(`The PDF could not be created. ${String(e)}`));
}
