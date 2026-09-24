import { lazy, Suspense, useRef } from 'react';
import { planBounds } from '../geometry';
import { exportPdf } from '../lib/exportPdf';
import { exportPng } from '../lib/exportPng';
import { formatArea, formatMarla, UNIT_LABELS } from '../lib/units';
import { roomAreaSqMm } from '../rooms';
import { baseName } from '../lib/files';
import { DEFAULT_AREA } from '../lib/view';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { Canvas } from './Canvas';
import { FileBar } from './FileBar';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { SettingsPanel } from './SettingsPanel';
import { Toolbar } from './Toolbar';
import { ViewControls } from './ViewControls';

// three.js is large, so the 3D view loads the first time it is opened.
const Plan3DView = lazy(() => import('../three/Plan3DView'));

export default function PlannerApp() {
  const svgRef = useRef<SVGSVGElement>(null);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);
  const mode = usePlanner((s) => s.mode);
  const view3d = usePlanner((s) => s.view3d);
  const setView3d = usePlanner((s) => s.setView3d);

  function exportArea() {
    const { doc } = plannerStore.getState();
    return planBounds(doc.elements, doc.masks) ?? DEFAULT_AREA;
  }

  function exportContent() {
    const { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills } =
      plannerStore.getState();
    return { doc, units, marlaSqFt, showDimensions, showFurniture, showRoomLabels, showRoomFills };
  }

  function onExportPng() {
    const { fileName, gridPx, setWarning } = plannerStore.getState();
    exportPng(exportContent(), exportArea(), gridPx, `${baseName(fileName)}.png`).catch((e) =>
      setWarning(`The image could not be created. ${String(e)}`),
    );
  }

  function onExportPdf() {
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

  return (
    <div className="flex h-screen bg-gray-50 text-sm">
      <aside className="flex w-72 flex-col gap-3 overflow-auto border-r bg-white p-3">
        <h2 className="text-lg font-semibold">Mimar {__APP_VERSION__}</h2>
        <FileBar />
        <div className="border-t pt-2">
          <Toolbar />
        </div>
        <div className={mode === 'pro' ? 'mt-2 border-t pt-2' : 'hidden'}>
          <label htmlFor="brush-size" className="block">
            Brush size (px)
          </label>
          <input
            id="brush-size"
            type="range"
            min={4}
            max={120}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <div className="text-xs text-gray-600">Brush: {brushSize}px</div>
        </div>
        <MaterialsPanel />
        <LayersPanel />
        <SettingsPanel />
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onExportPdf} className="rounded border p-2" title="Print-ready plan at a true scale">
              Export PDF
            </button>
            <button onClick={onExportPng} className="rounded border p-2">
              Export PNG
            </button>
          </div>
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        {view3d ? (
          <Suspense
            fallback={<div className="flex h-full items-center justify-center text-sm text-gray-500">Loading 3D…</div>}
          >
            <Plan3DView />
          </Suspense>
        ) : (
          <>
            <Canvas svgRef={svgRef} />
            <ViewControls />
          </>
        )}
        <div
          role="radiogroup"
          aria-label="View"
          className="absolute top-3 left-3 flex overflow-hidden rounded-md border bg-white text-xs shadow-sm"
        >
          {[
            { on: false, label: '2D plan' },
            { on: true, label: '3D view' },
          ].map((v) => (
            <button
              key={v.label}
              role="radio"
              aria-checked={view3d === v.on}
              onClick={() => setView3d(v.on)}
              className={`px-3 py-1.5 ${view3d === v.on ? 'bg-gray-900 font-medium text-white' : 'hover:bg-gray-50'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </main>

      <Inspector />
    </div>
  );
}
