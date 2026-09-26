import { levelOf } from '../types';
import { planBounds } from '../geometry';
import { plannerStore } from '../store/plannerStore';
import { exportPdf } from './exportPdf';
import { builtAreaSqFt, planCheck } from './planCheck';
import { planHints } from './planHints';
import { downloadUrl, exportPng } from './exportPng';
import { planToDxf } from './exportDxf';
import { modelMeshes, toDae, toGlb, toObj } from './export3d';
import { zip } from './zip';
import { costCsv, costPdf, costReport } from './costReport';
import { costStore } from '../store/costStore';
import { buildModel } from '../three/model';
import { baseName } from './files';
import { formatArea, formatMarla, SQ_MM_PER_SQ_FT, UNIT_LABELS } from './units';
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

/**
 * "House" or "House - First floor" when the plan has more than one floor (a plain hyphen: browsers
 * give up on file names with a dash like "–" and save them as "download").
 */
function exportName() {
  const { doc, fileName, activeLevel } = plannerStore.getState();
  const level = doc.levels.find((l) => l.id === activeLevel);
  return doc.levels.length > 1 && level ? `${baseName(fileName)} - ${level.name}` : baseName(fileName);
}

/** Say so, rather than make a blank drawing, when the floor being viewed has nothing on it. */
function emptyFloor(): boolean {
  const { doc } = exportContent();
  const s = plannerStore.getState();
  if (doc.elements.length || doc.rooms.length || s.doc.masks.length) return false;
  const others = s.doc.levels.length > 1 && s.doc.elements.length > 0;
  s.setWarning(
    others
      ? 'This floor is empty, so there is nothing to export. Switch to a floor with something on it (Page Up / Page Down).'
      : 'The plan is empty, so there is nothing to export yet. Draw some walls or rooms first.',
  );
  return true;
}

/** Download the plan as a PNG, with the grid if it is shown. */
export function exportPlanPng() {
  if (emptyFloor()) return;
  const { gridPx, grid, setWarning } = plannerStore.getState();
  const shownGrid = grid.show ? { step: gridPx, look: grid } : null;
  exportPng(exportContent(), exportArea(), shownGrid, `${exportName()}.png`).catch((e) =>
    setWarning(`The image could not be created. ${String(e)}`),
  );
}

/** Download a print-ready PDF at a true scale. */
export function exportPlanPdf() {
  if (emptyFloor()) return;
  const { paper, units, marlaSqFt, setWarning, pdfCheck, doc, wallHeightMm } = plannerStore.getState();
  const { showHints, pdfHints } = plannerStore.getState();
  const check = planCheck(doc, { wallHeightMm, units });
  const skipSizes = new Set(check?.rows.find((r) => r.id === 'rooms')?.ids ?? []);
  const hints = showHints && pdfHints ? planHints(doc, { units, skipSizes }).map((h) => h.text) : [];
  const name = exportName();
  // The same covered area as the plan check: to the walls' outer faces, without open-air rooms.
  const covered = builtAreaSqFt(doc, plannerStore.getState().activeLevel) * SQ_MM_PER_SQ_FT;
  exportPdf(exportContent(), exportArea(), {
    title: name,
    paper,
    unitsNote: `Dimensions in ${UNIT_LABELS[units].toLowerCase()}`,
    areaNote: covered ? `Covered area: ${formatArea(covered, units)}  ·  ${formatMarla(covered, marlaSqFt)}` : '',
    version: __APP_VERSION__,
    filename: `${name}.pdf`,
    northDeg: doc.northDeg ?? 0,
    checkTitle: baseName(plannerStore.getState().fileName),
    hints,
    cost: costStore.getState().pdfCost
      ? costPdf(costReport(doc, wallHeightMm, 'all', costStore.getState()))
      : undefined,
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
  if (emptyFloor()) return;
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

/** Download the bill of quantities and cost estimate (the whole building) as a CSV file for Excel. */
export function exportCostCsv(floor = 'all') {
  const s = plannerStore.getState();
  if (!s.doc.elements.length && !s.doc.rooms.length) {
    s.setWarning('The plan is empty, so there is nothing to measure yet. Draw some walls or rooms first.');
    return;
  }
  const report = costReport(s.doc, s.wallHeightMm, floor, costStore.getState());
  // A byte-order mark so Excel reads the text as UTF-8.
  saveBlob('\ufeff' + costCsv(baseName(s.fileName), report), 'text/csv', `${baseName(s.fileName)} quantities.csv`);
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
