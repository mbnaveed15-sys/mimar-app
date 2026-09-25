import { levelOf } from '../types';
import { planBounds } from '../geometry';
import { roomAreaSqMm } from '../rooms';
import { plannerStore } from '../store/plannerStore';
import { exportPdf } from './exportPdf';
import { planCheck } from './planCheck';
import { downloadUrl, exportPng } from './exportPng';
import { planToDxf } from './exportDxf';
import { modelMeshes, toDae, toGlb, toObj } from './export3d';
import { zip } from './zip';
import { buildModel } from '../three/model';
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
  const shown = s.shownDoc();
  const onLevel = <T extends { levelId?: string }>(it: T) => levelOf(it) === s.activeLevel;
  // Layout lines are for planning, so they stay out of drawings unless asked for.
  const elements = shown.elements.filter((el) => onLevel(el) && (s.exportLines || el.type !== 'line'));
  const doc = { ...shown, elements, rooms: shown.rooms.filter(onLevel) };
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
  const { paper, units, marlaSqFt, setWarning, pdfCheck, doc, wallHeightMm } = plannerStore.getState();
  const check = planCheck(doc, { wallHeightMm, units });
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
    bylawNote: check
      ? `Bylaws: ${check.authority.name}${check.authority.status === 'provisional' ? ' (provisional)' : ''}${check.rule ? `, ${check.rule.label}` : ''}`
      : '',
    check:
      check && pdfCheck
        ? {
            heading: `${check.authority.name}${check.rule ? ` · ${check.rule.label}` : ''} · ${check.authority.source}`,
            rows: check.rows,
            footer:
              'Indicative only: measured from the drawing (areas and heights are approximate). Check with the authority before submitting.',
          }
        : undefined,
  }).catch((e) => setWarning(`The PDF could not be created. ${String(e)}`));
}

function saveBlob(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  downloadUrl(url, filename);
  // Give the download time to start before letting the data go.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Download the floor being viewed as an AutoCAD DXF, in millimetres. */
export function exportPlanDxf() {
  const s = plannerStore.getState();
  const { doc } = exportContent();
  try {
    const text = planToDxf(doc, {
      units: s.units,
      marlaSqFt: s.marlaSqFt,
      showDimensions: s.showDimensions,
      showFurniture: s.showFurniture,
      showRoomLabels: s.showRoomLabels,
    });
    saveBlob(text, 'application/dxf', `${exportName()}.dxf`);
  } catch (e) {
    s.setWarning(`The DXF could not be created. ${String(e)}`);
  }
}

export type ModelFormat = 'glb' | 'dae' | 'obj';

/** Download the whole building (every floor) as a 3D model. */
export function exportModel(format: ModelFormat) {
  const s = plannerStore.getState();
  const name = baseName(s.fileName);
  try {
    const meshes = modelMeshes(
      buildModel(s.shownDoc(), { wallHeightMm: s.wallHeightMm, showFurniture: s.showFurniture }),
    );
    if (!meshes.length) {
      s.setWarning('There is nothing to export yet. Draw some walls first.');
      return;
    }
    if (format === 'glb') saveBlob(toGlb(meshes), 'model/gltf-binary', `${name}.glb`);
    else if (format === 'dae') saveBlob(toDae(meshes, name), 'model/vnd.collada+xml', `${name}.dae`);
    else {
      const { obj, mtl } = toObj(meshes, `${name}.mtl`);
      const files = [
        { name: `${name}.obj`, data: obj },
        { name: `${name}.mtl`, data: mtl },
      ];
      saveBlob(zip(files), 'application/zip', `${name} (OBJ).zip`);
    }
  } catch (e) {
    s.setWarning(`The 3D model could not be created. ${String(e)}`);
  }
}
