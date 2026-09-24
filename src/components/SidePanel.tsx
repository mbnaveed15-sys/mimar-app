import type { ReactNode } from 'react';
import { usePlanner } from '../store/plannerStore';
import { TOOL_INFO } from '../tools/toolInfo';
import { ComponentsPanel } from './ComponentsPanel';
import { FurnitureLibrary } from './FurnitureLibrary';
import { GridSettings } from './GridSettings';
import { Inspector } from './Inspector';
import { LayersPanel } from './LayersPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { SettingsPanel } from './SettingsPanel';
import { ThemePicker } from './ThemePicker';
import { UpdatePanel } from './UpdatePanel';
import type { SectionId, useOpenSections } from './useOpenSections';
import { WallThicknessPicker } from './WallThicknessPicker';

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
      open={open}
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now !== open) onToggle(now);
      }}
      className="group border-t border-line"
    >
      <summary className="m-heading flex cursor-pointer list-none items-center justify-between px-3 py-2.5 select-none hover:text-ink">
        {title}
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/** Options for the active tool, shown when nothing is selected. */
function ToolOptions() {
  const tool = usePlanner((s) => s.tool);
  const brushSize = usePlanner((s) => s.brushSize);
  const setBrushSize = usePlanner((s) => s.setBrushSize);
  const view3d = usePlanner((s) => s.view3d);
  if (view3d) return null;
  if (tool === 'wall' || tool === 'rectangle') return <WallThicknessPicker />;
  if (tool === 'furniture') return <FurnitureLibrary />;
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

/** Right-hand panel: the selection's properties (or the tool's options), then settings sections. */
export function SidePanel({ sections }: { sections: ReturnType<typeof useOpenSections> }) {
  const tool = usePlanner((s) => s.tool);
  const hasSelection = usePlanner((s) => s.selectedIds.length > 0);
  const { open, set } = sections;
  const section = (id: SectionId, title: string, children: ReactNode) => (
    <Section id={id} title={title} open={open.includes(id)} onToggle={(on) => set(id, on)}>
      {children}
    </Section>
  );

  return (
    <aside
      aria-label="Properties"
      className="flex w-72 flex-none flex-col overflow-y-auto border-l border-line bg-surface"
    >
      <div className="flex flex-col gap-2 p-3">
        <h2 className="m-heading">{hasSelection ? 'Properties' : TOOL_INFO[tool].label}</h2>
        {!hasSelection && <ToolOptions />}
        <Inspector />
      </div>
      {section('materials', 'Materials', <MaterialsPanel />)}
      {section('components', 'Components', <ComponentsPanel />)}
      {section('layers', 'Layers', <LayersPanel />)}
      {section('grid', 'Grid', <GridSettings />)}
      {section('theme', 'Theme', <ThemePicker />)}
      {section('settings', 'Settings', <SettingsPanel />)}
      <div className="mt-auto border-t border-line p-3">
        <UpdatePanel />
      </div>
    </aside>
  );
}
