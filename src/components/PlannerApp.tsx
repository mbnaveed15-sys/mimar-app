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
import { GridSettings } from './GridSettings';
import { Icon } from './Icon';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { Mark } from './Mark';
import { MaterialsPanel } from './MaterialsPanel';
import { SettingsPanel } from './SettingsPanel';
import { ThemePicker } from './ThemePicker';
import { Toolbar } from './Toolbar';
import { UpdatePanel } from './UpdatePanel';
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
    const { fileName, gridPx, grid, setWarning } = plannerStore.getState();
    const shownGrid = grid.show ? { step: gridPx, look: grid } : null;
    exportPng(exportContent(), exportArea(), shownGrid, `${baseName(fileName)}.png`).catch((e) =>
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
    <div className="flex h-screen bg-surface text-ink">
      <aside className="flex w-72 flex-col gap-3 overflow-auto border-r border-line bg-surface p-3">
        <header className="flex items-center gap-2">
          <Mark size={30} />
          <h1 className="text-[21px] leading-6 font-[650] tracking-[-0.2px]" style={{ fontStretch: '88%' }}>
            Mimar
          </h1>
          <span className="ml-auto font-mono text-[11px] text-muted">{__APP_VERSION__}</span>
        </header>
        <FileBar />
        <div className="m-section">
          <Toolbar />
        </div>
        <div className={mode === 'pro' ? 'm-section text-xs' : 'hidden'}>
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
          <div className="text-muted">Brush: {brushSize}px</div>
        </div>
        <MaterialsPanel />
        <LayersPanel />
        <ThemePicker />
        <GridSettings />
        <SettingsPanel />
        <div className="m-section">
          <span className="m-heading">Export</span>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onExportPdf} className="m-btn" title="Print-ready plan at a true scale">
              <Icon name="export" size={16} />
              Export PDF
            </button>
            <button onClick={onExportPng} className="m-btn">
              <Icon name="export" size={16} />
              Export PNG
            </button>
          </div>
        </div>
        <UpdatePanel />
      </aside>

      <main className="relative flex-1 overflow-hidden">
        {view3d ? (
          <Suspense
            fallback={<div className="flex h-full items-center justify-center bg-canvas text-muted">Loading 3D…</div>}
          >
            <Plan3DView />
          </Suspense>
        ) : (
          <>
            <Canvas svgRef={svgRef} />
            <ViewControls />
          </>
        )}
        <div role="radiogroup" aria-label="View" className="m-seg absolute top-3 left-3 text-xs shadow-popover">
          {[
            { on: false, label: '2D plan', icon: 'view-2d' as const },
            { on: true, label: '3D view', icon: 'view-3d' as const },
          ].map((v) => (
            <button
              key={v.label}
              role="radio"
              aria-checked={view3d === v.on}
              onClick={() => setView3d(v.on)}
              className="px-3 py-1.5"
            >
              <Icon name={v.icon} size={16} />
              {v.label}
            </button>
          ))}
        </div>
      </main>

      <Inspector />
    </div>
  );
}
