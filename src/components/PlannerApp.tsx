import { useRef } from 'react';
import { planBounds } from '../geometry';
import { exportPng } from '../lib/exportPng';
import { baseName } from '../lib/files';
import { DEFAULT_AREA } from '../lib/view';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { Canvas } from './Canvas';
import { FileBar } from './FileBar';
import { Inspector } from './Inspector';
import { MaterialsPanel } from './MaterialsPanel';
import { SettingsPanel } from './SettingsPanel';
import { Toolbar } from './Toolbar';
import { ViewControls } from './ViewControls';

export default function PlannerApp() {
  const svgRef = useRef<SVGSVGElement>(null);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);

  function onExport() {
    if (!svgRef.current) return;
    const { doc, fileName } = plannerStore.getState();
    const area = planBounds(doc.elements, doc.masks) ?? DEFAULT_AREA;
    exportPng(svgRef.current, area, `${baseName(fileName)}.png`).catch((e) => console.error('export failed', e));
  }

  return (
    <div className="flex h-screen bg-gray-50 text-sm">
      <aside className="flex w-72 flex-col gap-3 overflow-auto border-r bg-white p-3">
        <h2 className="text-lg font-semibold">Mimar {__APP_VERSION__}</h2>
        <FileBar />
        <div className="border-t pt-2">
          <Toolbar />
        </div>
        <div className="mt-2 border-t pt-2">
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
        <SettingsPanel />
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          <button onClick={onExport} className="rounded border p-2">
            Export PNG
          </button>
        </div>
      </aside>

      <main className="relative flex-1 overflow-hidden">
        <Canvas svgRef={svgRef} />
        <ViewControls />
      </main>

      <Inspector />
    </div>
  );
}
