import brushIcon from '../../branding/ui/toolbar-icons/brush.svg';
import doorIcon from '../../branding/ui/toolbar-icons/door.svg';
import eraseIcon from '../../branding/ui/toolbar-icons/erase.svg';
import furnitureIcon from '../../branding/ui/toolbar-icons/furniture.svg';
import maskIcon from '../../branding/ui/toolbar-icons/mask.svg';
import paintIcon from '../../branding/ui/toolbar-icons/paint.svg';
import panIcon from '../../branding/ui/toolbar-icons/pan.svg';
import roomIcon from '../../branding/ui/toolbar-icons/room.svg';
import selectIcon from '../../branding/ui/toolbar-icons/select.svg';
import wallIcon from '../../branding/ui/toolbar-icons/wall.svg';
import windowIcon from '../../branding/ui/toolbar-icons/window.svg';
import { usePlanner } from '../store/plannerStore';
import { SIMPLE_TOOLS, TOOLS, type Mode, type Tool } from '../types';
import { FurnitureLibrary } from './FurnitureLibrary';
import { WallThicknessPicker } from './WallThicknessPicker';

const TOOL_INFO: Record<Tool, { label: string; icon: string; hint?: string }> = {
  select: {
    label: 'Select',
    icon: selectIcon,
    hint: 'Click to select, drag to move. Arrow keys nudge, R rotates, Delete removes.',
  },
  pan: { label: 'Pan', icon: panIcon, hint: 'Drag to move around. You can also hold Space and drag.' },
  wall: { label: 'Wall', icon: wallIcon, hint: 'Drag to draw a wall. Ends snap to the grid and to other walls.' },
  room: { label: 'Room', icon: roomIcon, hint: 'Click inside walls to make a room and see its area.' },
  door: { label: 'Door', icon: doorIcon, hint: 'Click on a wall to place a door.' },
  window: { label: 'Window', icon: windowIcon, hint: 'Click on a wall to place a window.' },
  furniture: {
    label: 'Furniture',
    icon: furnitureIcon,
    hint: 'Choose an item below, then click on the plan to place it at its real size.',
  },
  paint: { label: 'Paint', icon: paintIcon, hint: 'Click a wall, room or item to give it the selected material.' },
  brush: { label: 'Brush', icon: brushIcon, hint: 'Drag over items to paint them with the selected material.' },
  mask: {
    label: 'Mask',
    icon: maskIcon,
    hint: 'Click to add points. Double-click or press Enter to finish, Esc to cancel.',
  },
  erase: {
    label: 'Erase',
    icon: eraseIcon,
    hint: 'Click an item to remove it. Click inside a room to remove the room.',
  },
};

const MODES: { mode: Mode; label: string; title: string }[] = [
  { mode: 'simple', label: 'Simple', title: 'The main tools, for planning a home' },
  { mode: 'pro', label: 'Pro', title: 'All tools, materials and settings' },
];

export function Toolbar() {
  const tool = usePlanner((s) => s.tool);
  const setTool = usePlanner((s) => s.setTool);
  const mode = usePlanner((s) => s.mode);
  const setMode = usePlanner((s) => s.setMode);
  const warnings = usePlanner((s) => s.warnings);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);
  const tools = mode === 'simple' ? TOOLS.filter((t) => SIMPLE_TOOLS.includes(t)) : TOOLS;

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Mode" className="grid grid-cols-2 rounded-md border p-0.5 text-xs">
        {MODES.map((m) => (
          <button
            key={m.mode}
            role="radio"
            aria-checked={mode === m.mode}
            title={m.title}
            onClick={() => setMode(m.mode)}
            className={`rounded px-2 py-1 ${mode === m.mode ? 'bg-gray-900 font-medium text-white' : 'text-gray-600'}`}
          >
            {m.label}
          </button>
        ))}
      </div>
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
      <div className="grid grid-cols-4 gap-1.5">
        {tools.map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            aria-pressed={tool === t}
            aria-label={t}
            title={TOOL_INFO[t].label}
            className={`flex flex-col items-center gap-0.5 rounded-md border p-1 text-[11px] ${
              tool === t ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600' : 'bg-white hover:bg-gray-50'
            }`}
          >
            <img src={TOOL_INFO[t].icon} alt="" className="h-8 w-8" draggable={false} />
            {TOOL_INFO[t].label}
          </button>
        ))}
      </div>
      {TOOL_INFO[tool].hint && <div className="text-xs text-gray-600">{TOOL_INFO[tool].hint}</div>}
      {tool === 'wall' && <WallThicknessPicker />}
      {tool === 'furniture' && <FurnitureLibrary />}
      {warnings.map((w) => (
        <div key={w} role="alert" className="rounded border border-amber-200 bg-amber-50 p-1 text-xs text-amber-700">
          {w}
        </div>
      ))}
    </div>
  );
}
