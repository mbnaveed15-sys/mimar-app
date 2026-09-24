import { usePlanner } from '../store/plannerStore';
import { SIMPLE_TOOLS, TOOLS, type Mode, type Tool } from '../types';
import type { IconName } from '../theme/icons';
import { FurnitureLibrary } from './FurnitureLibrary';
import { Icon } from './Icon';
import { WallThicknessPicker } from './WallThicknessPicker';

const TOOL_INFO: Record<Tool, { label: string; icon: IconName; hint?: string }> = {
  select: {
    label: 'Select',
    icon: 'select',
    hint: 'Click to select, drag to move. Arrow keys nudge, R rotates, Delete removes.',
  },
  pan: { label: 'Pan', icon: 'pan', hint: 'Drag to move around. You can also hold Space and drag.' },
  wall: { label: 'Wall', icon: 'wall', hint: 'Drag to draw a wall. Ends snap to the grid and to other walls.' },
  room: { label: 'Room', icon: 'room', hint: 'Click inside walls to make a room and see its area.' },
  door: { label: 'Door', icon: 'door', hint: 'Click on a wall to place a door.' },
  window: { label: 'Window', icon: 'window', hint: 'Click on a wall to place a window.' },
  furniture: {
    label: 'Furniture',
    icon: 'furniture',
    hint: 'Choose an item below, then click on the plan to place it at its real size.',
  },
  paint: { label: 'Paint', icon: 'paint', hint: 'Click a wall, room or item to give it the selected material.' },
  brush: { label: 'Brush', icon: 'brush', hint: 'Drag over items to paint them with the selected material.' },
  mask: {
    label: 'Mask',
    icon: 'mask',
    hint: 'Click to add points. Double-click or press Enter to finish, Esc to cancel.',
  },
  erase: {
    label: 'Erase',
    icon: 'erase',
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
      <div role="radiogroup" aria-label="Mode" className="m-seg text-xs">
        {MODES.map((m) => (
          <button
            key={m.mode}
            role="radio"
            aria-checked={mode === m.mode}
            title={m.title}
            onClick={() => setMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" className="m-btn flex-1">
          <Icon name="undo" size={16} /> Undo
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" className="m-btn flex-1">
          <Icon name="redo" size={16} /> Redo
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {tools.map((t) => (
          <button
            key={t}
            onClick={() => setTool(t)}
            aria-pressed={tool === t}
            aria-label={t}
            title={TOOL_INFO[t].label}
            className={`flex flex-col items-center gap-1 rounded-md px-1 pt-2 pb-1.5 text-[11px] ${
              tool === t ? 'bg-accent font-semibold text-on-accent' : 'text-ink hover:bg-sunken'
            }`}
          >
            <Icon name={TOOL_INFO[t].icon} size={22} />
            {TOOL_INFO[t].label}
          </button>
        ))}
      </div>
      {TOOL_INFO[tool].hint && <div className="text-xs text-muted">{TOOL_INFO[tool].hint}</div>}
      {tool === 'wall' && <WallThicknessPicker />}
      {tool === 'furniture' && <FurnitureLibrary />}
      {warnings.map((w) => (
        <div key={w} role="alert" className="rounded-md border border-accent bg-accent-soft p-2 text-xs text-ink">
          {w}
        </div>
      ))}
    </div>
  );
}
