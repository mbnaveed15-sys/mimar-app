import { GROUND_LEVEL, levelOf } from '../types';
import { groundOnPlan } from './terrain/groundView';
import { voidsOver } from './voids';
import { planBounds } from '../geometry';
import { plannerStore } from '../store/plannerStore';
import { exportPdf } from './exportPdf';
import { builtAreaSqFt, planCheck } from './planCheck';
import { shows } from './project';
import { planHints } from './planHints';
import { downloadUrl, exportPng } from './exportPng';
import { planToDxf, sideDrawingsToDxf } from './exportDxf';
import { sideDrawingRefs } from './drawings/refs';
import type { SideDrawing } from './drawings/views';
import { modelMeshes, toDae, toGlb, toObj } from './export3d';
import { planToIfc } from './exportIfc';
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
  // Section lines cut through every floor, so each floor's plan shows them all.
  const elements = shown.elements.filter(
    (el) => (onLevel(el) || el.type === 'section') && (s.exportLines || el.type !== 'line'),
  );
  const doc = { ...shown, elements, rooms: shown.rooms.filter(onLevel) };
  const { units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills } = s;
  const ground = s.activeLevel === GROUND_LEVEL ? groundOnPlan(s.doc, units === 'metric') : null;
  const voids = voidsOver(shown, s.activeLevel);
  return { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills, ground, voids };
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
  if (doc.elements.some((el) => el.type !== 'section') || doc.rooms.length || s.doc.masks.length) return false;
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
/** The plan check, the hints and the cost estimate, as asked for in the PDF settings. */
function pdfExtras() {
  const { units, pdfCheck, doc, wallHeightMm, fileName } = plannerStore.getState();
  const { showHints, pdfHints, openingGapMm: gapMm, accessibleZones: accessible } = plannerStore.getState();
  const check = planCheck(doc, { wallHeightMm, units });
  const skipSizes = new Set(check?.rows.find((r) => r.id === 'rooms')?.ids ?? []);
  const hints = showHints && pdfHints ? planHints(doc, { units, skipSizes, gapMm, accessible }).map((h) => h.text) : [];
  return {
    checkTitle: baseName(fileName),
    hints,
    cost:
      costStore.getState().pdfCost && shows(doc, 'cost')
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
  };
}

export function exportPlanPdf() {
  if (emptyFloor()) return;
  const { paper, units, marlaSqFt, setWarning, doc } = plannerStore.getState();
  const name = exportName();
  // The same covered area as the plan check: to the walls' outer faces, without open-air rooms.
  const covered = builtAreaSqFt(doc, plannerStore.getState().activeLevel) * SQ_MM_PER_SQ_FT;
  exportPdf(exportContent(), exportArea(), {
    title: name,
    // The quick one-page plan stays on A4 or A3 (A1 is for drawing sheets).
    paper: paper === 'A1' ? 'A3' : paper,
    unitsNote: `Dimensions in ${UNIT_LABELS[units].toLowerCase()}`,
    areaNote: covered ? `Covered area: ${formatArea(covered, units)}  ·  ${formatMarla(covered, marlaSqFt)}` : '',
    version: __APP_VERSION__,
    filename: `${name}.pdf`,
    northDeg: doc.northDeg ?? 0,
    ...pdfExtras(),
  }).catch((e) => setWarning(`The PDF could not be created. ${String(e)}`));
}

/** Print the drawing sheets (plans, sections and elevations with title blocks) to one PDF. */
export function exportSheetsPdf() {
  const s = plannerStore.getState();
  if (!s.doc.elements.some((el) => el.type !== 'section') && !s.doc.rooms.length) {
    s.setWarning('The plan is empty, so there is nothing to print yet. Draw some walls or rooms first.');
    return;
  }
  const shown = s.shownDoc();
  // The drawing code only loads when it is first needed.
  Promise.all([import('./exportSheets'), import('./drawings/source'), import('./drawings/sheet')])
    .then(([{ exportSheets }, { drawingSource, levelContent }, { sheetsOf }]) => {
      const src = drawingSource(s, shown);
      return exportSheets(
        src,
        sheetsOf(src),
        (levelId) => levelContent(s, shown, levelId),
        pdfExtras(),
        `${baseName(s.fileName)} - Drawings.pdf`,
      );
    })
    .then((overflow) => {
      if (overflow.length)
        s.setWarning(
          `Some drawings don’t fit on ${overflow.join(', ')}: pick a smaller scale or bigger paper in the Drawings view.`,
        );
    })
    .catch((e) => s.setWarning(`The PDF could not be created. ${String(e)}`));
}

/** Download every section and elevation as one AutoCAD DXF, side by side at true size. */
export async function exportDrawingsDxf() {
  const s = plannerStore.getState();
  const { drawingSource } = await import('./drawings/source');
  const src = drawingSource(s);
  const drawings = sideDrawingRefs(src.doc)
    .map((ref) => src.side(ref))
    .filter((d): d is SideDrawing => !!d?.bounds);
  if (!drawings.length) {
    s.setWarning('There is nothing to draw yet: draw some walls first.');
    return;
  }
  try {
    saveBlob(sideDrawingsToDxf(drawings), 'application/dxf', `${baseName(s.fileName)} - Sections and elevations.dxf`);
  } catch (e) {
    s.setWarning(`The DXF could not be created. ${String(e)}`);
  }
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
  const { doc, ground, voids } = exportContent();
  try {
    const text = planToDxf(doc, {
      ground,
      voids,
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

/** Download the whole building (every floor) as an IFC model for Revit, ArchiCAD and other BIM apps. */
export function exportIfc() {
  const s = plannerStore.getState();
  const doc = s.shownDoc();
  if (!doc.elements.some((el) => el.type === 'wall' || el.type === 'slab' || el.type === 'column')) {
    s.setWarning('There is nothing to export yet. Draw some walls first.');
    return;
  }
  const name = baseName(s.fileName);
  try {
    const ifc = planToIfc(doc, { wallHeightMm: s.wallHeightMm, name, app: `Mimar ${__APP_VERSION__}` });
    saveBlob(ifc, 'application/x-step', `${name}.ifc`);
  } catch (e) {
    s.setWarning(`The IFC model could not be created. ${String(e)}`);
  }
}
