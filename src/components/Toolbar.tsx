import { usePlanner } from '../store/plannerStore';
import { TOOLS, type Tool } from '../types';

const TOOL_HINTS: Partial<Record<Tool, string>> = {
  select: 'Click to select, drag to move. Arrow keys nudge, R rotates, Delete removes.',
  pan: 'Drag to move around the plan. You can also hold Space or the middle mouse button.',
  wall: 'Drag to draw a wall. Ends snap to the grid and to other walls.',
  door: 'Click on a wall to place a door.',
  window: 'Click on a wall to place a window.',
  mask: 'Click to add points. Double-click or press Enter to finish, Esc to cancel.',
};

export function Toolbar() {
  const tool = usePlanner((s) => s.tool);
  const setTool = usePlanner((s) => s.setTool);
  const warnings = usePlanner((s) => s.warnings);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="flex-1 rounded-md border px-3 py-1 disabled:opacity-40"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          className="flex-1 rounded-md border px-3 py-1 disabled:opacity-40"
        >
          ↷ Redo
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {TOOLS.map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            aria-pressed={tool === t}
            className={`rounded-md border px-3 py-1 ${tool === t ? 'bg-blue-600 text-white' : 'bg-white'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {TOOL_HINTS[tool] && <div className="text-xs text-gray-600">{TOOL_HINTS[tool]}</div>}
      {warnings.map((w) => (
        <div key={w} role="alert" className="rounded border border-amber-200 bg-amber-50 p-1 text-xs text-amber-700">
          {w}
        </div>
      ))}
    </div>
  );
}
