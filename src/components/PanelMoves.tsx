import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import { PANELS, type PanelLayout, type SectionId } from '../lib/panels';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { Icon } from './Icon';
import { useMenuKeys } from './useFocus';

/** A section (or its tab) being dragged to a new place, or the whole panel being dragged to a side. */
type Drag =
  | { kind: 'order'; id: SectionId; x: number; y: number; index: number; line: { x: number; y: number; w: number } }
  | { kind: 'side'; x: number; y: number; side: PanelLayout['side'] };

const panelDragStore = createStore<{
  drag: Drag | null;
  menu: { id: SectionId; x: number; y: number; keys?: boolean } | null;
}>(() => ({ drag: null, menu: null }));

const labelOf = (id: SectionId) => PANELS.find((p) => p.id === id)!.label;

/** The sections shown in the panel, in order: the project may leave some out. */
function shownOrder(): SectionId[] {
  return [...document.querySelectorAll<HTMLElement>('[data-panel-item]')].map(
    (el) => el.dataset.panelItem as SectionId,
  );
}

/** Where a section dragged to height y would go: before the shown section under it (or at the end). */
function orderTarget(y: number): { index: number; line: { x: number; y: number; w: number } } | null {
  const items = [...document.querySelectorAll<HTMLElement>('[data-panel-item]')];
  if (!items.length) return null;
  const { order } = plannerStore.getState().panels;
  for (const el of items) {
    const r = el.getBoundingClientRect();
    if (y < r.top + r.height / 2)
      return { index: order.indexOf(el.dataset.panelItem as SectionId), line: { x: r.left, y: r.top - 1, w: r.width } };
  }
  const r = items[items.length - 1].getBoundingClientRect();
  return { index: order.length, line: { x: r.left, y: r.bottom - 1, w: r.width } };
}

/** Where moving a section up, down, to the top or to the bottom puts it, among the shown ones. */
function moveIndex(id: SectionId, where: 'up' | 'down' | 'top' | 'bottom'): number | null {
  const shown = shownOrder();
  const { order } = plannerStore.getState().panels;
  const i = shown.indexOf(id);
  if (i === -1) return null;
  const before = (j: number) => (j < shown.length ? order.indexOf(shown[j]) : order.length);
  if (where === 'up') return i > 0 ? before(i - 1) : null;
  if (where === 'down') return i < shown.length - 1 ? before(i + 2) : null;
  if (where === 'top') return i > 0 ? before(0) : null;
  return i < shown.length - 1 ? order.length : null;
}

/**
 * Drag handling for a section's grip or tab: a drag of a few px moves it up or down the panel;
 * a right-click (or Enter on a grip) opens a menu. Returns props to spread on the element, and
 * whether a drag just ended (so a tab's click can be ignored).
 */
function useOrderDrag(id: SectionId, { menuOnEnter = false } = {}) {
  const movePanel = usePlanner((s) => s.movePanel);
  const start = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const props = {
    'data-panel-grip': id,
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY };
      dragged.current = false;
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!panelDragStore.getState().drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
      dragged.current = true;
      const target = orderTarget(e.clientY);
      panelDragStore.setState({
        drag: target ? { kind: 'order', id, x: e.clientX, y: e.clientY, ...target } : null,
      });
    },
    onPointerUp: () => {
      start.current = null;
      const drag = panelDragStore.getState().drag;
      panelDragStore.setState({ drag: null });
      if (drag?.kind === 'order') movePanel(drag.id, drag.index);
    },
    onPointerCancel: () => {
      start.current = null;
      panelDragStore.setState({ drag: null });
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      panelDragStore.setState({ menu: { id, x: e.clientX, y: e.clientY } });
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!menuOnEnter || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      panelDragStore.setState({ menu: { id, x: r.right, y: r.bottom, keys: true } });
    },
  };
  return { props, dragged };
}

/** The grip on a section's heading: drag it to move the section up or down. */
export function SectionGrip({ id }: { id: SectionId }) {
  const { props } = useOrderDrag(id, { menuOnEnter: true });
  return (
    <button
      type="button"
      {...props}
      aria-label={`Move the ${labelOf(id)} panel`}
      title={`${labelOf(id)}: drag to move this panel up or down (right-click for more)`}
      // A click on the grip doesn't open or close the section.
      onClick={(e) => e.preventDefault()}
      className="-ml-1.5 mr-1 flex h-5 w-3 flex-none cursor-grab touch-none items-center justify-center rounded-sm text-muted hover:bg-sunken hover:text-ink"
    >
      <span aria-hidden className="h-3 w-[3px] border-x border-current" />
    </button>
  );
}

/** The handle the whole panel is dragged by, to dock it at the other side. */
function useSideDrag() {
  const setPanels = usePlanner((s) => s.setPanels);
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      start.current = { x: e.clientX, y: e.clientY };
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = start.current;
      if (!s) return;
      if (!panelDragStore.getState().drag && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 4) return;
      const side = e.clientX < window.innerWidth / 2 ? 'left' : 'right';
      panelDragStore.setState({ drag: { kind: 'side', x: e.clientX, y: e.clientY, side } });
    },
    onPointerUp: () => {
      start.current = null;
      const drag = panelDragStore.getState().drag;
      panelDragStore.setState({ drag: null });
      if (drag?.kind === 'side') setPanels({ side: drag.side });
    },
    onPointerCancel: () => {
      start.current = null;
      panelDragStore.setState({ drag: null });
    },
  };
}

function PanelMenu({
  x,
  y,
  id,
  keys,
  children,
}: {
  x: number;
  y: number;
  id: SectionId;
  keys?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useMenuKeys(ref);
  useEffect(
    () => () => {
      if (keys) document.querySelector<HTMLElement>(`button[data-panel-grip="${id}"]`)?.focus();
    },
    [id, keys],
  );
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Panel"
      className="absolute flex min-w-40 flex-col rounded-md border border-line bg-raised py-1 text-xs shadow-popover"
      style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 240) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

export const TAB_CLASS =
  'flex w-full flex-none flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-[10px] leading-tight touch-none';

/** A section's tab in the tabs view: click to show it (again to fold the panel), drag to move it. */
export function SectionTab({ id, active, onPick }: { id: SectionId; active: boolean; onPick: () => void }) {
  const { props, dragged } = useOrderDrag(id);
  const panel = PANELS.find((p) => p.id === id)!;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-panel-item={id}
      {...props}
      onClick={() => {
        if (!dragged.current) onPick();
      }}
      title={`${panel.label} (drag to move, right-click for more)`}
      className={`${TAB_CLASS} ${active ? 'bg-accent text-on-accent' : 'text-muted hover:bg-sunken hover:text-ink'}`}
    >
      <Icon name={panel.icon} size={18} />
      <span className="w-full truncate text-center">{panel.tab}</span>
    </button>
  );
}

/** A small picture of the panel docked at one side, for the dock button. */
function DockIcon({ side }: { side: 'left' | 'right' }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1" />
      <rect x={side === 'left' ? 2.5 : 9.5} y="3.5" width="4" height="9" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The panel's own heading: drag it to dock the panel at the other side; switch between stacked and tabs. */
export function PanelHeader({ onClose }: { onClose?: () => void } = {}) {
  const panels = usePlanner((s) => s.panels);
  const setPanels = usePlanner((s) => s.setPanels);
  const drag = useSideDrag();
  const other = panels.side === 'left' ? 'right' : 'left';
  const seg = (on: boolean) =>
    `px-2 py-0.5 ${on ? 'bg-accent text-on-accent' : 'text-muted hover:bg-sunken hover:text-ink'}`;
  return (
    <div className="flex flex-none items-center gap-1.5 border-b border-line px-2 py-1.5">
      <div
        {...drag}
        data-testid="panel-handle"
        title="Drag to dock the panels at the other side"
        className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-1.5 self-stretch text-xs text-muted select-none"
      >
        <span aria-hidden className="h-3 w-[3px] flex-none border-x border-current" />
        Panels
      </div>
      {/* Over the plan (a narrow window) it is always tabs, with a button to put it away. */}
      {onClose ? (
        <button
          type="button"
          aria-label="Close panel"
          title="Close panel"
          onClick={onClose}
          className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      ) : (
        <div
          role="group"
          aria-label="Panel view"
          className="flex overflow-hidden rounded-md border border-line text-xs"
        >
          <button
            type="button"
            aria-pressed={panels.view === 'stacked'}
            className={seg(panels.view === 'stacked')}
            onClick={() => setPanels({ view: 'stacked' })}
          >
            Stacked
          </button>
          <button
            type="button"
            aria-pressed={panels.view === 'tabs'}
            className={seg(panels.view === 'tabs')}
            onClick={() => setPanels({ view: 'tabs', folded: false })}
          >
            Tabs
          </button>
        </div>
      )}
      <button
        type="button"
        aria-label={`Dock panels ${other}`}
        title={`Dock panels ${other}`}
        onClick={() => setPanels({ side: other })}
        className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink"
      >
        <DockIcon side={other} />
      </button>
    </div>
  );
}

/** While a section or the panel is dragged: its name by the pointer, and where it would land. Also the menu. */
export function PanelMovesOverlay() {
  const drag = useStore(panelDragStore, (s) => s.drag);
  const menu = useStore(panelDragStore, (s) => s.menu);
  const panels = usePlanner((s) => s.panels);
  const movePanel = usePlanner((s) => s.movePanel);
  const setPanels = usePlanner((s) => s.setPanels);
  const resetPanels = usePlanner((s) => s.resetPanels);

  useEffect(() => {
    if (!drag && !menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') panelDragStore.setState({ drag: null, menu: null });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag, menu]);

  const close = () => panelDragStore.setState({ menu: null });
  const item = 'px-3 py-1.5 text-left hover:bg-sunken focus:bg-sunken focus:outline-none disabled:text-muted';
  const moves = [
    ['up', 'Move up'],
    ['down', 'Move down'],
    ['top', 'Move to top'],
    ['bottom', 'Move to bottom'],
  ] as const;
  return (
    <>
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {drag.kind === 'order' ? (
            <div
              data-testid="panel-drop-line"
              className="absolute h-0.5 rounded-sm bg-accent"
              style={{ left: drag.line.x, top: drag.line.y, width: drag.line.w }}
            />
          ) : (
            <div
              data-testid="panel-drop-side"
              className={`absolute inset-y-0 rounded-sm bg-accent/25 ring-2 ring-accent ring-inset ${drag.side === 'left' ? 'left-0' : 'right-0'}`}
              style={{ width: panels.width }}
            />
          )}
          <div
            className="absolute rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-popover"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
          >
            {drag.kind === 'order' ? labelOf(drag.id) : `Dock panels ${drag.side}`}
          </div>
        </div>
      )}
      {menu && (
        <div className="fixed inset-0 z-50" onPointerDown={close} onContextMenu={(e) => (e.preventDefault(), close())}>
          <PanelMenu x={menu.x} y={menu.y} id={menu.id} keys={menu.keys}>
            {moves.map(([where, label]) => {
              const index = moveIndex(menu.id, where);
              return (
                <button
                  key={where}
                  role="menuitem"
                  disabled={index === null}
                  className={item}
                  onClick={() => {
                    if (index !== null) movePanel(menu.id, index);
                    close();
                  }}
                >
                  {label}
                </button>
              );
            })}
            <div className="my-1 border-t border-line" />
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                setPanels({ view: panels.view === 'tabs' ? 'stacked' : 'tabs', folded: false });
                close();
              }}
            >
              {panels.view === 'tabs' ? 'Show panels stacked' : 'Show panels as tabs'}
            </button>
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                setPanels({ side: panels.side === 'left' ? 'right' : 'left' });
                close();
              }}
            >
              {panels.side === 'left' ? 'Dock panels right' : 'Dock panels left'}
            </button>
            <button
              role="menuitem"
              className={item}
              onClick={() => {
                resetPanels();
                close();
              }}
            >
              Reset panels
            </button>
          </PanelMenu>
        </div>
      )}
    </>
  );
}
