import { useRef } from 'react';
import { exportPng } from '../lib/exportPng';
import { usePlanner } from '../store/plannerStore';
import { CANVAS_HEIGHT, CANVAS_WIDTH, Canvas } from './Canvas';
import { Inspector } from './Inspector';
import { MaterialsPanel } from './MaterialsPanel';
import { Toolbar } from './Toolbar';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export default function PlannerApp() {
  const svgRef = useRef<SVGSVGElement>(null);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);
  useKeyboardShortcuts();

  function onExport() {
    if (!svgRef.current) return;
    exportPng(svgRef.current, CANVAS_WIDTH, CANVAS_HEIGHT).catch((e) => console.error('export failed', e));
  }

  return (
    <div className="flex h-screen bg-gray-50 text-sm">
      <aside className="flex w-72 flex-col gap-3 overflow-auto border-r bg-white p-3">
        <h2 className="text-lg font-semibold">Mimar {__APP_VERSION__} — Materials & Masking</h2>
        <Toolbar />
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
        <div className="mt-2 flex flex-col gap-2 border-t pt-2">
          <button onClick={onExport} className="rounded border p-2">
            Export PNG
          </button>
        </div>
      </aside>

      <main className="relative flex-1">
        <Canvas svgRef={svgRef} />
      </main>

      <Inspector />
    </div>
  );
}
