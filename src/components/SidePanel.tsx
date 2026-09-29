import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
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

/** Options for the active tool, shown when nothing is selected. */
function ToolOptions() {
  const tool = usePlanner((s) => s.tool);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);
  if (tool === 'wall' || tool === 'rectangle')
    return (
      <>
        {tool === 'wall' && <WallShapePicker />}
        <WallThicknessPicker />
        <WallKindPicker />
      </>
    );
  if (tool === 'plot' || tool === 'stairs' || tool === 'door' || tool === 'window') return <SiteOptions />;
  if (tool === 'furniture') return <FurnitureLibrary />;
  if (tool === 'column' || tool === 'beam' || tool === 'slab') return <StructureOptions />;
  if (tool === 'roof') return <RoofToolOptions />;
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
 * sections can be reordered, shown stacked or as tabs, and the panel docked at either side.
 */
export function SidePanel({ sections }: { sections: ReturnType<typeof useOpenSections> }) {
  const tool = usePlanner((s) => s.tool);
  const hasSelection = usePlanner((s) => s.selectedIds.length > 0);
  const panels = usePlanner((s) => s.panels);
  const setPanels = usePlanner((s) => s.setPanels);
  const { open, set } = sections;
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  // The sections the project shows.
  const roomList = usePlanner((s) => shows(s.doc, 'roomList'));
  const checks = usePlanner((s) => shows(s.doc, 'bylaws') || shows(s.doc, 'hints'));
  const cost = usePlanner((s) => shows(s.doc, 'cost'));
  const shown = (id: SectionId) => (id === 'layout' ? roomList : id === 'check' ? checks : id === 'cost' ? cost : true);
  const order = panels.order.filter(shown);
  const tabs = panels.view === 'tabs';
  const tab: PanelTab = panels.tab !== 'properties' && order.includes(panels.tab) ? panels.tab : 'properties';
  const folded = tabs && panels.folded;
  const width = liveWidth ?? panels.width;

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
  const pick = (next: PanelTab) =>
    setPanels(next === tab && !panels.folded ? { folded: true } : { tab: next, folded: false });

  const properties = (
    <div className="flex flex-col gap-2 p-3">
      <h2 className="m-heading">{hasSelection ? 'Properties' : TOOL_INFO[tool].label}</h2>
      {/* The Shape tool's choice stays in view, as each new shape is selected once drawn. */}
      {(!hasSelection || tool === 'shape') && <ToolOptions />}
      <Inspector />
    </div>
  );

  return (
    <aside
      aria-label="Properties"
      data-side={panels.side}
      data-view={panels.view}
      className={`relative flex flex-none ${panels.side === 'left' ? 'order-first flex-row-reverse border-r' : 'border-l'} border-line bg-surface`}
    >
      {!folded && (
        <>
          <ResizeHandle side={panels.side} width={width} onLive={setLiveWidth} />
          <div className="flex min-w-0 flex-col overflow-y-auto" style={{ width }}>
            <PanelHeader />
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
