import type { IconName } from '../theme/icons';

/** The side panel's sections, below the selection's properties, in their default order. */
export const PANELS = [
  { id: 'project', label: 'Project', tab: 'Project', icon: 'sheet' },
  { id: 'ground', label: 'Ground and site', tab: 'Site', icon: 'level' },
  { id: 'layout', label: 'Layout from a room list', tab: 'Layout', icon: 'room' },
  { id: 'check', label: 'Plan check', tab: 'Check', icon: 'check' },
  { id: 'cost', label: 'Quantities & cost', tab: 'Cost', icon: 'tape' },
  { id: 'materials', label: 'Materials', tab: 'Materials', icon: 'paint' },
  { id: 'components', label: 'Components', tab: 'Parts', icon: 'furniture' },
  { id: 'layers', label: 'Layers', tab: 'Layers', icon: 'layers' },
  { id: 'grid', label: 'Grid', tab: 'Grid', icon: 'snap' },
  { id: 'theme', label: 'Theme', tab: 'Theme', icon: 'theme' },
  { id: 'settings', label: 'Settings', tab: 'Settings', icon: 'settings' },
] as const satisfies readonly { id: string; label: string; tab: string; icon: IconName }[];

export type SectionId = (typeof PANELS)[number]['id'];
/** A tab in the tabs view: the selection's properties (or the tool's options), or a section. */
export type PanelTab = 'properties' | SectionId;

export const PANEL_WIDTH_MIN = 240;
export const PANEL_WIDTH_MAX = 560;

/** How the side panel is laid out: its sections' order, stacked or as tabs, which side, and how wide. */
export interface PanelLayout {
  order: SectionId[];
  view: 'stacked' | 'tabs';
  side: 'left' | 'right';
  /** Width in px, not counting the tab strip. */
  width: number;
  /** The open tab in the tabs view. */
  tab: PanelTab;
  /** In the tabs view, only the tab strip shows. */
  folded: boolean;
}

export const DEFAULT_PANELS: PanelLayout = {
  order: PANELS.map((p) => p.id),
  view: 'stacked',
  side: 'right',
  width: 288,
  tab: 'properties',
  folded: false,
};

export const isSectionId = (v: unknown): v is SectionId => PANELS.some((p) => p.id === v);
const isTab = (v: unknown): v is PanelTab => v === 'properties' || isSectionId(v);

export const clampPanelWidth = (px: number) =>
  Math.round(Math.max(PANEL_WIDTH_MIN, Math.min(PANEL_WIDTH_MAX, Number.isFinite(px) ? px : DEFAULT_PANELS.width)));

/** A saved layout, keeping each known section once; any missing go back at the end. */
export function readPanels(raw: unknown): PanelLayout {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const order = [...new Set((Array.isArray(obj.order) ? obj.order : []).filter(isSectionId))];
  for (const p of PANELS) if (!order.includes(p.id)) order.push(p.id);
  return {
    order,
    view: obj.view === 'tabs' ? 'tabs' : 'stacked',
    side: obj.side === 'left' ? 'left' : 'right',
    width: typeof obj.width === 'number' ? clampPanelWidth(obj.width) : DEFAULT_PANELS.width,
    tab: isTab(obj.tab) ? obj.tab : 'properties',
    folded: obj.folded === true,
  };
}

/** The order with a section moved before the one at `index` (or to the end). */
export function movePanel(order: SectionId[], id: SectionId, index: number): SectionId[] {
  const from = order.indexOf(id);
  const out = order.filter((x) => x !== id);
  // Positions are counted with the moved section still in place; allow for it leaving earlier on.
  let at = index;
  if (from !== -1 && from < at) at -= 1;
  out.splice(Math.max(0, Math.min(at, out.length)), 0, id);
  return out;
}
