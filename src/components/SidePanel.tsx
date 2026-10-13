import type { ScaleAxis } from '../lib/resize';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import { usePlanner } from '../store/plannerStore';
import { TOOL_INFO } from '../tools/toolInfo';
import { ComponentsPanel } from './ComponentsPanel';
import { FurnitureLibrary } from './FurnitureLibrary';
import { GridSettings } from './GridSettings';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { SettingsPanel } from './SettingsPanel';
import { SiteOptions, WallKindPicker, WallShapePicker } from './SiteOptions';
import { CurvePicker, DimensionPicker, RectCornerPicker } from './CurveOptions';
import { PlanCheckPanel } from './PlanCheckPanel';
import { ShapeOptions } from './ShapeOptions';
import { RoofToolOptions } from './RoofOptions';
import { StructureOptions } from './StructureOptions';
import { ThemePicker } from './ThemePicker';
import { UpdatePanel } from './UpdatePanel';
import type { useOpenSections } from './useOpenSections';
import { PANELS, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, DEFAULT_PANELS, type PanelTab, type SectionId } from '../lib/panels';
import { Icon } from './Icon';
import { PanelHeader, SectionGrip, SectionTab, TAB_CLASS } from './PanelMoves';
import { LayoutPanel } from './LayoutPanel';
import { ProjectPanel } from './ProjectPanel';
import { shows } from '../lib/project';
import { WallThicknessPicker } from './WallThicknessPicker';
import { CostPanel } from './CostPanel';
import { useCompact, usePhone } from './useCompact';
import { overStore, PEEK_PX, type Sheet } from './panelSheet';
import { GroundPanel, GroundToolOptions } from './GroundPanel';

function Section({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      id={`section-${id}`}
      data-panel-item={id}
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== open) onToggle(now);
      }}
      className="group border-t border-line"
    >
      <summary className="m-heading flex cursor-pointer list-none items-center justify-between px-3 py-2.5 select-none hover:text-ink">
        <span className="flex items-center">
          <SectionGrip id={id} />
          {title}
        </span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/** The edge the panel is made wider or narrower by (double-click for the usual width). */
function ResizeHandle({
  side,
  width,
  onLive,
}: {
  side: 'left' | 'right';
  width: number;
  onLive: (w: number | null) => void;
}) {
  const setPanels = usePlanner((s) => s.setPanels);
  const start = useRef<{ x: number; w: number } | null>(null);
  const widthAt = (x: number) => {
    const s = start.current!;
    const w = s.w + (side === 'right' ? s.x - x : x - s.x);
    return Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, w));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      aria-valuenow={width}
      aria-valuemin={PANEL_WIDTH_MIN}
      aria-valuemax={PANEL_WIDTH_MAX}
      tabIndex={0}
      title="Drag to make the panels wider or narrower (double-click for the usual width)"
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (start.current) onLive(widthAt(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        const w = widthAt(e.clientX);
        start.current = null;
        onLive(null);
        setPanels({ width: w });
      }}
      onPointerCancel={() => {
        start.current = null;
        onLive(null);
      }}
      onDoubleClick={() => setPanels({ width: DEFAULT_PANELS.width })}
      onKeyDown={(e: KeyboardEvent) => {
        const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
        if (!step) return;
        e.preventDefault();
        setPanels({ width: width + (side === 'right' ? -step : step) });
      }}
      className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize touch-none hover:bg-accent/40 focus-visible:bg-accent/40 focus-visible:outline-none ${
        side === 'right' ? '-left-0.5' : '-right-0.5'
      }`}
    />
  );
}

/** The Curve tool: how it draws, and, for walls, their thickness and type. */
function CurveToolOptions() {
  const make = usePlanner((s) => s.site.curveMake);
  return (
    <>
      <CurvePicker />
      {make === 'wall' && (
        <>
          <WallThicknessPicker />
          <WallKindPicker />
        </>
      )}
    </>
  );
}

/** Which way the Scale tool stretches: both ways, or only across or only up and down the plan. */
function ScaleOptions() {
  const axis = usePlanner((s) => s.scaleAxis);
  const setAxis = usePlanner((s) => s.setScaleAxis);
  const options: [ScaleAxis, string, string][] = [
    ['both', 'Both', 'Bigger or smaller every way'],
    ['x', 'Width only', 'Wider or narrower, across the plan (left to right)'],
    ['y', 'Depth only', 'Deeper or shallower, up and down the plan'],
  ];
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="scale-options">
      <div className="m-heading">Scale</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Scale which way">
        {options.map(([id, label, title]) => (
          <button
            key={id}
            className="m-btn px-2 py-0.5"
            aria-pressed={axis === id}
            title={title}
            onClick={() => setAxis(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="text-muted">Or type two factors, width then depth, such as 2,1.</div>
    </div>
  );
}

/** Options for the active tool, shown when nothing is selected. */
function ToolOptions() {
  const tool = usePlanner((s) => s.tool);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);
  if (tool === 'wall' || tool === 'rectangle')
    return (
      <>
        {tool === 'wall' && <WallShapePicker />}
        {tool === 'rectangle' && <RectCornerPicker />}
        <WallThicknessPicker />
        <WallKindPicker />
      </>
    );
  if (tool === 'curve') return <CurveToolOptions />;
  if (tool === 'dimension') return <DimensionPicker />;
  if (tool === 'plot' || tool === 'stairs' || tool === 'door' || tool === 'window') return <SiteOptions />;
  if (tool === 'furniture') return <FurnitureLibrary />;
  if (tool === 'column' || tool === 'beam' || tool === 'slab') return <StructureOptions />;
  if (tool === 'roof') return <RoofToolOptions />;
  if (tool === 'scale') return <ScaleOptions />;
  if (tool === 'shape') return <ShapeOptions />;
  if (tool === 'level' || tool === 'contour' || tool === 'pad') return <GroundToolOptions />;
  if (tool === 'brush')
    return (
      <div className="flex flex-col gap-1 text-xs">
        <label htmlFor="brush-size">Brush size (px)</label>
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
    );
  return null;
}

/**
 * The side panel: the selection's properties (or the tool's options), then settings sections. The
 * sections can be reordered, shown stacked or as tabs, and the panel docked at either side. In a
 * narrow window (an iPad held upright) it is always a strip of tabs, and the open tab slides over
 * the plan instead of taking room from it.
 */
export function SidePanel({ sections }: { sections: ReturnType<typeof useOpenSections> }) {
  const tool = usePlanner((s) => s.tool);
  const hasSelection = usePlanner((s) => s.selectedIds.length > 0);
  const panels = usePlanner((s) => s.panels);
  const setPanels = usePlanner((s) => s.setPanels);
  const { open, set } = sections;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const compact = useCompact();
  const phone = usePhone();
  // In a narrow window the panel starts closed, over the plan when opened.
  const overOpen = useStore(overStore, (s) => s.open);
  const setOverOpen = (on: boolean) => overStore.setState({ open: on });
  // The sections the project shows.
  const roomList = usePlanner((s) => shows(s.doc, 'roomList'));
  const checks = usePlanner((s) => shows(s.doc, 'bylaws') || shows(s.doc, 'hints'));
  const cost = usePlanner((s) => shows(s.doc, 'cost'));
  const shown = (id: SectionId) => (id === 'layout' ? roomList : id === 'check' ? checks : id === 'cost' ? cost : true);
  const order = panels.order.filter(shown);
  const tabs = compact || panels.view === 'tabs';
  const tab: PanelTab = panels.tab !== 'properties' && order.includes(panels.tab) ? panels.tab : 'properties';
  const folded = compact ? !overOpen : tabs && panels.folded;
  const width = compact
    ? Math.min(panels.width, Math.max(PANEL_WIDTH_MIN, window.innerWidth - 160))
    : (liveWidth ?? panels.width);

  // In the tabs view, selecting something brings its properties forward.
  const hadSelection = useRef(hasSelection);
  useEffect(() => {
    if (hasSelection && !hadSelection.current && tabs && tab !== 'properties') setPanels({ tab: 'properties' });
    hadSelection.current = hasSelection;
  }, [hasSelection, tabs, tab, setPanels]);

  /** A section's content; the heavier ones are only built while open. */
  const body = (id: SectionId, isOpen: boolean): ReactNode => {
    switch (id) {
      case 'project':
        return isOpen ? <ProjectPanel /> : null;
      case 'ground':
        return isOpen ? <GroundPanel /> : null;
      case 'layout':
        return isOpen ? <LayoutPanel /> : null;
      case 'check':
        return <PlanCheckPanel />;
      case 'cost':
        return isOpen ? <CostPanel /> : null;
      case 'materials':
        return <MaterialsPanel />;
      case 'components':
        return <ComponentsPanel />;
      case 'layers':
        return <LayersPanel />;
      case 'grid':
        return <GridSettings />;
      case 'theme':
        return <ThemePicker />;
      case 'settings':
        return <SettingsPanel />;
    }
  };
  const label = (id: SectionId) => PANELS.find((p) => p.id === id)!.label;
  const pick = (next: PanelTab) => {
    if (phone) {
      const { sheet } = overStore.getState();
      overStore.setState({ sheet: next === tab && sheet !== 'peek' ? 'peek' : sheet === 'peek' ? 'half' : sheet });
      if (next !== tab) setPanels({ tab: next });
      return;
    }
    if (compact) {
      setOverOpen(!(next === tab && overOpen));
      if (next !== tab) setPanels({ tab: next });
      return;
    }
    setPanels(next === tab && !panels.folded ? { folded: true } : { tab: next, folded: false });
  };

  const properties = (
    <div className="flex flex-col gap-2 p-3">
      <h2 className="m-heading">{hasSelection ? 'Properties' : TOOL_INFO[tool].label}</h2>
      {/* The Shape tool's choice stays in view, as each new shape is selected once drawn. */}
      {(!hasSelection || tool === 'shape' || tool === 'scale') && <ToolOptions />}
      <Inspector />
    </div>
  );

  if (phone)
    return (
      <PhoneSheet
        tabs={[
          { id: 'properties', label: hasSelection ? 'Properties' : TOOL_INFO[tool].label },
          ...order.map((id) => ({ id, label: PANELS.find((p) => p.id === id)!.tab })),
        ]}
        tab={tab}
        onPick={pick}
      >
        {tab === 'properties' ? (
          properties
        ) : (
          <div id={`section-${tab}`} role="tabpanel" aria-label={label(tab)} className="flex flex-col gap-2 p-3">
            <h2 className="m-heading">{label(tab)}</h2>
            {body(tab, true)}
          </div>
        )}
      </PhoneSheet>
    );

  return (
    <aside
      aria-label="Properties"
      data-side={panels.side}
      data-view={tabs ? 'tabs' : 'stacked'}
      data-compact={compact || undefined}
      className={`relative flex flex-none ${panels.side === 'left' ? 'order-first flex-row-reverse border-r' : 'border-l'} border-line bg-surface`}
    >
      {!folded && (
        <>
          {!compact && <ResizeHandle side={panels.side} width={width} onLive={setLiveWidth} />}
          <div
            data-testid="panel-content"
            className={`flex min-w-0 flex-col overflow-y-auto ${
              compact
                ? `absolute inset-y-0 z-30 border-line bg-surface shadow-popover ${panels.side === 'left' ? 'left-full border-r' : 'right-full border-l'}`
                : ''
            }`}
            style={{ width }}
          >
            <PanelHeader onClose={compact ? () => setOverOpen(false) : undefined} />
            {tabs ? (
              tab === 'properties' ? (
                properties
              ) : (
                <div id={`section-${tab}`} role="tabpanel" aria-label={label(tab)} className="flex flex-col gap-2 p-3">
                  <h2 className="m-heading">{label(tab)}</h2>
                  {body(tab, true)}
                </div>
              )
            ) : (
              <>
                {properties}
                {order.map((id) => (
                  <Section key={id} id={id} title={label(id)} open={open.includes(id)} onToggle={(on) => set(id, on)}>
                    {body(id, open.includes(id))}
                  </Section>
                ))}
              </>
            )}
            <div className="mt-auto border-t border-line p-3">
              <UpdatePanel />
            </div>
          </div>
        </>
      )}
      {tabs && (
        <div
          role="tablist"
          aria-label="Panels"
          aria-orientation="vertical"
          className={`flex w-16 flex-none flex-col gap-0.5 overflow-y-auto p-1 ${folded ? '' : panels.side === 'left' ? 'border-r border-line' : 'border-l border-line'}`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'properties' && !folded}
            onClick={() => pick('properties')}
            title="Properties"
            className={`${TAB_CLASS} ${tab === 'properties' && !folded ? 'bg-accent text-on-accent' : 'text-muted hover:bg-sunken hover:text-ink'}`}
          >
            <Icon name="select" size={18} />
            <span className="w-full truncate text-center">Properties</span>
          </button>
          {order.map((id) => (
            <SectionTab key={id} id={id} active={tab === id && !folded} onPick={() => pick(id)} />
          ))}
        </div>
      )}
    </aside>
  );
}

/**
 * A phone's panel: a sheet over the bottom of the plan. Peeking, it is one row of tabs; tap a tab, or
 * drag the handle up, to open it half or all the way. Tap the open tab (or drag it down) to put it away.
 */
function PhoneSheet({
  tabs,
  tab,
  onPick,
  children,
}: {
  tabs: { id: PanelTab; label: string }[];
  tab: PanelTab;
  onPick: (id: PanelTab) => void;
  children: ReactNode;
}) {
  const sheet = useStore(overStore, (s) => s.sheet);
  const ref = useRef<HTMLElement>(null);
  const start = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const [live, setLive] = useState<number | null>(null);
  const room = () => ref.current?.parentElement?.getBoundingClientRect().height ?? window.innerHeight;
  const heightAt = (s: { y: number; h: number }, y: number) => Math.max(PEEK_PX, Math.min(room(), s.h + s.y - y));
  const next: Record<Sheet, Sheet> = { peek: 'half', half: 'full', full: 'peek' };
  const height = live ?? (sheet === 'peek' ? PEEK_PX : sheet === 'half' ? '50%' : '100%');

  return (
    <>
      {/* The peeking row takes its room from the plan; opened, the sheet goes over the plan. */}
      <div aria-hidden className="flex-none" style={{ height: PEEK_PX }} />
      <aside
        ref={ref}
        aria-label="Properties"
        data-sheet={sheet}
        data-testid="phone-sheet"
        className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-xl border-t border-line bg-surface shadow-popover"
        style={{ height }}
      >
        <button
          type="button"
          aria-label="Panel size"
          title="Drag up or down, or tap, to open or put away the panel"
          className="flex h-4 w-full flex-none cursor-grab touch-none items-center justify-center"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { y: e.clientY, h: ref.current?.getBoundingClientRect().height ?? PEEK_PX, moved: false };
          }}
          onPointerMove={(e) => {
            const s = start.current;
            if (!s || (!s.moved && Math.abs(e.clientY - s.y) < 6)) return;
            s.moved = true;
            setLive(heightAt(s, e.clientY));
          }}
          onPointerUp={(e) => {
            const s = start.current;
            start.current = null;
            setLive(null);
            if (!s) return;
            if (!s.moved) {
              overStore.setState({ sheet: next[sheet] });
              return;
            }
            const f = heightAt(s, e.clientY) / room();
            overStore.setState({ sheet: f < 0.3 ? 'peek' : f < 0.75 ? 'half' : 'full' });
          }}
          onPointerCancel={() => {
            start.current = null;
            setLive(null);
          }}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-line-strong" />
        </button>
        <div role="tablist" aria-label="Panels" className="flex flex-none gap-1 overflow-x-auto px-2 pb-2 text-xs">
          {tabs.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onPick(t.id)}
                className={`h-8 flex-none rounded-full px-3 font-medium whitespace-nowrap ${on ? 'bg-accent text-on-accent' : 'text-muted active:bg-sunken'}`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        {(sheet !== 'peek' || live !== null) && (
          <div data-testid="panel-content" className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {children}
          </div>
        )}
      </aside>
    </>
  );
}
