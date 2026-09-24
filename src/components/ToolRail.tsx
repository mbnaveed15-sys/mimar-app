import { usePlanner } from '../store/plannerStore';
import { TOOL_INFO } from '../tools/toolInfo';
import { SIMPLE_TOOLS, type Tool } from '../types';
import { Icon } from './Icon';

/** Tool rail groups, top to bottom: view, draw, change, finish, then the Pro tools and Modify tools. */
const GROUPS: Tool[][] = [
  ['select', 'pan', 'zoom'],
  ['wall', 'rectangle', 'room', 'door', 'window', 'furniture'],
  ['column', 'beam', 'slab'],
  ['move', 'rotate', 'tape'],
  ['paint', 'erase'],
  ['brush', 'mask'],
  ['offset', 'mirror', 'trim', 'extend', 'breakWall', 'join', 'fillet', 'chamfer', 'stretch', 'scale'],
];

/** Vertical tool bar on the left, like SketchUp's. Hover a tool to see its key. */
export function ToolRail() {
  const tool = usePlanner((s) => s.tool);
  const setTool = usePlanner((s) => s.setTool);
  const mode = usePlanner((s) => s.mode);
  const view3d = usePlanner((s) => s.view3d);
  const setView3d = usePlanner((s) => s.setView3d);
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);

  const groups = GROUPS.map((g) => g.filter((t) => mode === 'pro' || SIMPLE_TOOLS.includes(t))).filter((g) => g.length);
  const btn = 'grid h-9 w-9 place-items-center rounded-md';

  return (
    <nav
      aria-label="Tools"
      className="flex w-12 flex-none flex-col items-center gap-0.5 overflow-y-auto border-r border-line bg-surface py-1.5"
    >
      {groups.map((group, i) => (
        <div key={i} className={`flex flex-col gap-0.5 ${i ? 'mt-1 border-t border-line pt-1' : ''}`}>
          {group.map((t) => {
            const info = TOOL_INFO[t];
            const active = tool === t && !view3d;
            return (
              <button
                key={t}
                onClick={() => {
                  if (view3d) setView3d(false);
                  setTool(t);
                }}
                aria-pressed={active}
                aria-label={info.label}
                title={`${info.label} (${info.key})`}
                className={`${btn} ${active ? 'bg-accent text-on-accent' : 'text-ink hover:bg-sunken'}`}
              >
                <Icon name={info.icon} size={20} />
              </button>
            );
          })}
        </div>
      ))}
      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-1">
        <button
          onClick={undo}
          disabled={!canUndo}
          aria-label="Undo"
          title="Undo (Ctrl+Z)"
          className={`${btn} hover:bg-sunken disabled:opacity-35`}
        >
          <Icon name="undo" size={20} />
        </button>
        <button
          onClick={redo}
          disabled={!canRedo}
          aria-label="Redo"
          title="Redo (Ctrl+Y)"
          className={`${btn} hover:bg-sunken disabled:opacity-35`}
        >
          <Icon name="redo" size={20} />
        </button>
      </div>
    </nav>
  );
}
