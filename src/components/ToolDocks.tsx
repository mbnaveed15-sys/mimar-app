import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createStore, useStore } from 'zustand';
import { usePlanner } from '../store/plannerStore';
import { TOOL_INFO } from '../tools/toolInfo';
import {
  BAR_GAP_PX,
  BUTTON_GAP_PX,
  DOCK_AREAS,
  GRIP_PX,
  packColumns,
  TOOLBARS,
  type DockArea,
  type ToolbarId,
} from '../lib/toolbars';
import { SIMPLE_TOOLS, type Tool } from '../types';
import { Icon } from './Icon';
import { useMenuKeys } from './useFocus';

/** A tool bar being dragged by its grip: where the pointer is, and where the bar would go. */
interface Drag {
  id: ToolbarId;
  x: number;
  y: number;
  /** Where it would land, and the line (or, in an empty dock, the whole dock) to light up. */
  target: {
    area: DockArea;
    index: number;
    line: { x: number; y: number; w: number; h: number };
    empty?: boolean;
  } | null;
}

const dragStore = createStore<{
  drag: Drag | null;
  menu: { id: ToolbarId; x: number; y: number; keys?: boolean } | null;
}>(() => ({
  drag: null,
  menu: null,
}));

const AREA_NAMES: Record<DockArea, string> = { left: 'left', right: 'right', top: 'top', bottom: 'bottom' };
const VERTICAL = (area: DockArea) => area === 'left' || area === 'right';

/** The tools of a bar shown in this mode (Pro-only tools are left out in Simple mode). */
function useBarTools(): (id: ToolbarId) => Tool[] {
  const mode = usePlanner((s) => s.mode);
  return (id) => {
    const bar = TOOLBARS.find((t) => t.id === id)!;
    return (bar.tools as readonly Tool[]).filter((t) => mode === 'pro' || SIMPLE_TOOLS.includes(t));
  };
}

function ToolButton({ tool }: { tool: Tool }) {
  const active = usePlanner((s) => s.tool === tool);
  const setTool = usePlanner((s) => s.setTool);
  const info = TOOL_INFO[tool];
  return (
    <button
      onClick={() => setTool(tool)}
      aria-pressed={active}
      aria-label={info.label}
      title={`${info.label} (${info.key})`}
      className={`grid h-9 w-9 flex-none place-items-center rounded-md ${active ? 'bg-accent text-on-accent' : 'text-ink hover:bg-sunken'}`}
    >
      <Icon name={info.icon} size={20} />
    </button>
  );
}

/** The handle a bar is dragged by (right-click it for a menu of places to dock it). */
function Grip({ id, vertical }: { id: ToolbarId; vertical: boolean }) {
  const label = TOOLBARS.find((t) => t.id === id)!.label;
  const dockToolbar = usePlanner((s) => s.dockToolbar);
  const start = useRef<{ x: number; y: number } | null>(null);

  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const s = start.current;
    if (!s) return;
    const moving = dragStore.getState().drag;
    if (!moving && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
    dragStore.setState({ drag: { id, x: e.clientX, y: e.clientY, target: dropTarget(id, e.clientX, e.clientY) } });
  }
  function onPointerUp() {
    start.current = null;
    const drag = dragStore.getState().drag;
    dragStore.setState({ drag: null });
    if (drag?.target) dockToolbar(drag.id, drag.target.area, drag.target.index);
  }

  return (
    <button
      type="button"
      data-grip={id}
      aria-label={`Move the ${label} tool bar`}
      title={`${label}: drag to move this tool bar (right-click to choose where)`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        dragStore.setState({ drag: null });
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        dragStore.setState({ menu: { id, x: e.clientX, y: e.clientY } });
      }}
      onKeyDown={(e) => {
        // From the keyboard, Enter or Space opens the menu of places to dock the bar.
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        dragStore.setState({ menu: { id, x: r.right, y: r.bottom, keys: true } });
      }}
      className={`flex flex-none cursor-grab touch-none items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink ${
        vertical ? 'h-3 w-9' : 'h-9 w-3'
      }`}
    >
      <span
        aria-hidden
        className={vertical ? 'h-[3px] w-5 border-y border-current' : 'h-5 w-[3px] border-x border-current'}
      />
    </button>
  );
}

/** Where a bar would land if dropped at (x, y): the dock under the pointer, and the place in it. */
function dropTarget(id: ToolbarId, x: number, y: number): Drag['target'] {
  const docks = [...document.querySelectorAll<HTMLElement>('[data-dock]')];
  const reach = 20;
  for (const dock of docks) {
    const area = dock.dataset.dock as DockArea;
    const r = dock.getBoundingClientRect();
    if (x < r.left - reach || x > r.right + reach || y < r.top - reach || y > r.bottom + reach) continue;
    const vertical = VERTICAL(area);
    const order = (dock.dataset.order ?? '').split(',').filter(Boolean) as ToolbarId[];
    // Pieces of bars (a long bar may be split over two columns), in the line the pointer is in.
    const pieces = [...dock.querySelectorAll<HTMLElement>('[data-bar]')]
      .map((el) => ({
        id: el.dataset.bar as ToolbarId,
        first: el.dataset.first === 'true',
        r: el.getBoundingClientRect(),
      }))
      .filter((p) => p.id !== id)
      .filter((p) => (vertical ? x >= p.r.left - 4 && x <= p.r.right + 4 : y >= p.r.top - 4 && y <= p.r.bottom + 4));
    const others = order.filter((o) => o !== id);
    for (const p of pieces) {
      const before = vertical ? y < p.r.top + p.r.height / 2 : x < p.r.left + p.r.width / 2;
      const within = vertical ? y <= p.r.bottom : x <= p.r.right;
      if (!before && !within) continue;
      const at = others.indexOf(p.id) + (before ? 0 : 1);
      const line = vertical
        ? { x: p.r.left, y: before ? p.r.top - 3 : p.r.bottom + 1, w: p.r.width, h: 2 }
        : { x: before ? p.r.left - 3 : p.r.right + 1, y: p.r.top, w: 2, h: p.r.height };
      return { area, index: indexWithMoved(order, id, at), line };
    }
    // Past the last bar (or an empty dock): at the end.
    const last = pieces[pieces.length - 1]?.r;
    const line = last
      ? vertical
        ? { x: last.left, y: last.bottom + 1, w: last.width, h: 2 }
        : { x: last.right + 1, y: last.top, w: 2, h: last.height }
      : {
          x: r.left,
          y: r.top,
          w: vertical ? Math.max(r.width, 4) : r.width,
          h: vertical ? r.height : Math.max(r.height, 4),
        };
    return { area, index: order.length, line, empty: !last };
  }
  return null;
}

/** An index counted among the other bars, as one counted with the moved bar still in place. */
function indexWithMoved(order: ToolbarId[], id: ToolbarId, at: number): number {
  const from = order.indexOf(id);
  return from !== -1 && from < at ? at + 1 : at;
}

function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    ro.observe(el);
    setHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);
  return [ref, height] as const;
}

/**
 * A dock beside the drawing. At the left or right, bars sit in columns, wrapping into another
 * column instead of scrolling; at the top or bottom, in rows. The left dock also keeps Undo and Redo.
 */
export function ToolDock({ area }: { area: DockArea }) {
  const layout = usePlanner((s) => s.toolbars[area]);
  const dragging = useStore(dragStore, (s) => s.drag !== null);
  const toolsOf = useBarTools();
  const vertical = VERTICAL(area);
  const [columnsRef, height] = useHeight<HTMLDivElement>();

  const bars = layout.map((id) => ({ id, tools: toolsOf(id) })).filter((b) => b.tools.length);
  const hasUndo = area === 'left';
  if (!bars.length && !hasUndo && !dragging) return null;

  const border = { left: 'border-r', right: 'border-l', top: 'border-b', bottom: 'border-t' }[area];
  const label = area === 'left' ? 'Tools' : `Tools (${AREA_NAMES[area]})`;
  const order = layout.join(',');

  if (!vertical)
    return (
      <nav
        aria-label={label}
        data-dock={area}
        data-order={order}
        className={`flex flex-none flex-wrap items-center gap-x-1.5 gap-y-0.5 ${border} border-line bg-surface px-1.5 py-0.5 ${
          bars.length ? '' : 'min-h-2.5'
        } ${dragging ? 'min-h-6 bg-sunken/60' : ''}`}
      >
        {bars.map((b) => (
          <div key={b.id} data-bar={b.id} data-first="true" className="flex items-center gap-0.5">
            <Grip id={b.id} vertical={false} />
            {b.tools.map((t) => (
              <ToolButton key={t} tool={t} />
            ))}
          </div>
        ))}
      </nav>
    );

  const columns = height
    ? packColumns(
        bars.map((b) => ({ id: b.id, count: b.tools.length })),
        height,
      )
    : [bars.map((b) => ({ id: b.id, from: 0, to: b.tools.length }))];
  return (
    <nav
      aria-label={label}
      data-dock={area}
      data-order={order}
      className={`flex flex-none flex-col ${border} border-line bg-surface py-1.5 ${dragging && !bars.length ? 'w-6 bg-sunken/60' : ''}`}
    >
      <div ref={columnsRef} className="flex min-h-0 flex-1 gap-1.5 px-1.5">
        {columns.map((column, c) => (
          <div key={c} className="flex flex-col" style={{ gap: BAR_GAP_PX }}>
            {column.map((piece) => {
              const tools = bars.find((b) => b.id === piece.id)!.tools.slice(piece.from, piece.to);
              return (
                <div
                  key={`${piece.id}-${piece.from}`}
                  data-bar={piece.id}
                  data-first={piece.from === 0}
                  className="flex flex-col items-center"
                  style={{ gap: BUTTON_GAP_PX }}
                >
                  {piece.from === 0 ? <Grip id={piece.id} vertical /> : <span style={{ height: GRIP_PX }} />}
                  {tools.map((t) => (
                    <ToolButton key={t} tool={t} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {hasUndo && <UndoRedo />}
    </nav>
  );
}

function UndoRedo() {
  const canUndo = usePlanner((s) => s.past.length > 0);
  const canRedo = usePlanner((s) => s.future.length > 0);
  const undo = usePlanner((s) => s.undo);
  const redo = usePlanner((s) => s.redo);
  const btn = 'grid h-9 w-9 place-items-center rounded-md hover:bg-sunken disabled:opacity-35';
  return (
    <div className="mx-1.5 mt-1 flex flex-col items-center gap-0.5 border-t border-line pt-1">
      <button onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (Ctrl+Z)" className={btn}>
        <Icon name="undo" size={20} />
      </button>
      <button onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (Ctrl+Y)" className={btn}>
        <Icon name="redo" size={20} />
      </button>
    </div>
  );
}

/** A grip's menu: keyboard-friendly, and it hands focus back to the grip when it closes. */
function GripMenu({
  x,
  y,
  gripId,
  keys,
  children,
}: {
  x: number;
  y: number;
  gripId: ToolbarId;
  /** Opened from the keyboard: focus goes back to the grip afterwards. */
  keys?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  useEffect(
    () => () => {
      if (keys) document.querySelector<HTMLElement>(`[data-grip="${gripId}"]`)?.focus();
    },
    [gripId, keys],
  );
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Tool bar"
      className="absolute flex min-w-40 flex-col rounded-md border border-line bg-raised py-1 text-xs shadow-popover"
      style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 200) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** While a bar is dragged: its name by the pointer, and a line where it would land. Also the grip's menu. */
export function ToolDockOverlay() {
  const drag = useStore(dragStore, (s) => s.drag);
  const menu = useStore(dragStore, (s) => s.menu);
  const dockToolbar = usePlanner((s) => s.dockToolbar);
  const resetToolbars = usePlanner((s) => s.resetToolbars);
  const where = usePlanner((s) => (menu ? DOCK_AREAS.find((a) => s.toolbars[a].includes(menu.id)) : undefined));

  useEffect(() => {
    if (!drag && !menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dragStore.setState({ drag: null, menu: null });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag, menu]);

  const close = () => dragStore.setState({ menu: null });
  return (
    <>
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {drag.target && (
            <div
              data-testid="dock-indicator"
              className={`absolute rounded-sm ${drag.target.empty ? 'bg-accent/35' : 'bg-accent'}`}
              style={{
                left: drag.target.line.x,
                top: drag.target.line.y,
                width: drag.target.line.w,
                height: drag.target.line.h,
              }}
            />
          )}
          <div
            className="absolute rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-popover"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
          >
            {TOOLBARS.find((t) => t.id === drag.id)!.label}
          </div>
        </div>
      )}
      {menu && (
        <div className="fixed inset-0 z-50" onPointerDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
          <GripMenu x={menu.x} y={menu.y} gripId={menu.id} keys={menu.keys}>
            {DOCK_AREAS.map((a) => (
              <button
                key={a}
                role="menuitem"
                disabled={a === where}
                className="px-3 py-1.5 text-left hover:bg-sunken focus:bg-sunken focus:outline-none disabled:text-muted"
                onClick={() => {
                  dockToolbar(menu.id, a);
                  close();
                }}
              >
                Dock {AREA_NAMES[a]}
              </button>
            ))}
            <div className="my-1 border-t border-line" />
            <button
              role="menuitem"
              className="px-3 py-1.5 text-left hover:bg-sunken focus:bg-sunken focus:outline-none"
              onClick={() => {
                resetToolbars();
                close();
              }}
            >
              Reset tool bars
            </button>
          </GripMenu>
        </div>
      )}
    </>
  );
}
