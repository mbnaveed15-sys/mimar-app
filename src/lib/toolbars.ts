import type { Tool } from '../types';

/** The tool bars, each a group of tools that can be docked on any side of the drawing. */
export const TOOLBARS = [
  { id: 'view', label: 'View', tools: ['select', 'pan', 'zoom', 'orbit'] },
  { id: 'draw', label: 'Draw', tools: ['wall', 'line', 'rectangle', 'room', 'door', 'window', 'furniture'] },
  { id: 'structure', label: 'Structure', tools: ['column', 'beam', 'slab', 'plot', 'stairs'] },
  { id: 'shapes', label: 'Shape & Push/Pull', tools: ['shape', 'pushpull'] },
  { id: 'change', label: 'Move, rotate & measure', tools: ['move', 'rotate', 'tape'] },
  { id: 'finish', label: 'Paint & erase', tools: ['paint', 'erase'] },
  { id: 'pro', label: 'Brush & mask', tools: ['brush', 'mask'] },
  {
    id: 'modify',
    label: 'Modify',
    tools: ['offset', 'mirror', 'trim', 'extend', 'breakWall', 'join', 'fillet', 'chamfer', 'stretch', 'scale'],
  },
] as const satisfies readonly { id: string; label: string; tools: readonly Tool[] }[];

export type ToolbarId = (typeof TOOLBARS)[number]['id'];

/** Where tool bars can be docked: in columns at the left or right, or in rows at the top or bottom. */
export type DockArea = 'left' | 'right' | 'top' | 'bottom';
export const DOCK_AREAS: DockArea[] = ['left', 'right', 'top', 'bottom'];

/** Which tool bars are docked where, in order. */
export type ToolbarLayout = Record<DockArea, ToolbarId[]>;

export const DEFAULT_TOOLBARS: ToolbarLayout = {
  left: TOOLBARS.map((t) => t.id),
  right: [],
  top: [],
  bottom: [],
};

const isToolbarId = (v: unknown): v is ToolbarId => TOOLBARS.some((t) => t.id === v);

/** A saved layout, keeping each known tool bar once; any missing go back to the left. */
export function readToolbars(raw: unknown): ToolbarLayout {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const seen = new Set<ToolbarId>();
  const out = { left: [], right: [], top: [], bottom: [] } as ToolbarLayout;
  for (const area of DOCK_AREAS) {
    const list = Array.isArray(obj[area]) ? (obj[area] as unknown[]) : [];
    for (const id of list)
      if (isToolbarId(id) && !seen.has(id)) {
        seen.add(id);
        out[area].push(id);
      }
  }
  for (const t of TOOLBARS) if (!seen.has(t.id)) out.left.push(t.id);
  return out;
}

/** The layout with a tool bar moved to `area`, before the one at `index` there (or at the end). */
export function moveToolbar(layout: ToolbarLayout, id: ToolbarId, area: DockArea, index?: number): ToolbarLayout {
  const out = Object.fromEntries(DOCK_AREAS.map((a) => [a, layout[a].filter((x) => x !== id)])) as ToolbarLayout;
  // Positions are counted with the moved bar still in place; allow for it leaving earlier in the same area.
  const from = layout[area].indexOf(id);
  let at = index ?? out[area].length;
  if (from !== -1 && from < at) at -= 1;
  out[area].splice(Math.max(0, Math.min(at, out[area].length)), 0, id);
  return out;
}

/** Sizes of the tool buttons (px), for packing tool bars into columns without a scrollbar. */
export const BUTTON_PX = 36;
export const BUTTON_GAP_PX = 2;
/** A bar's grip and the space between bars. */
export const GRIP_PX = 12;
export const BAR_GAP_PX = 6;

/**
 * Pack tool bars (each a number of buttons) into columns no taller than `height` px, in order:
 * a bar that doesn't fit starts the next column, and a bar taller than a whole column is split.
 * Returns, for each column, the pieces in it: which bar and which of its buttons.
 */
export function packColumns(
  bars: { id: ToolbarId; count: number }[],
  height: number,
): { id: ToolbarId; from: number; to: number }[][] {
  const button = BUTTON_PX + BUTTON_GAP_PX;
  const columns: { id: ToolbarId; from: number; to: number }[][] = [[]];
  let used = 0;
  for (const bar of bars) {
    let from = 0;
    while (from < bar.count) {
      const column = columns[columns.length - 1];
      const gap = column.length ? BAR_GAP_PX : 0;
      const room = Math.floor((height - used - gap - GRIP_PX) / button);
      const rest = bar.count - from;
      // Start a new column when nothing more fits, or when the rest of the bar would fit one whole.
      if (column.length && (room < 1 || (room < rest && rest * button + GRIP_PX <= height))) {
        columns.push([]);
        used = 0;
        continue;
      }
      // At the top of a column at least one button goes in, however small the window.
      const take = Math.max(1, Math.min(room, rest));
      column.push({ id: bar.id, from, to: from + take });
      used += gap + GRIP_PX + take * button;
      from += take;
    }
  }
  return columns.filter((c) => c.length);
}
