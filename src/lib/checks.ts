import type { SnapKind } from './inference';
import type { CheckRow, PlanCheck } from './planCheck';
import type { Hint } from './planHints';

/**
 * Checks and snaps can be paused while drawing, all at once or a kind at a time, from the Checks
 * and Snap buttons in the bottom bar. This file says which kind each check row, hint and snap is.
 */

export type CheckCategory =
  'plot' | 'size' | 'rooms' | 'basement' | 'use' | 'layout' | 'daylight' | 'openings' | 'zones';

export const CHECK_CATEGORIES: { id: CheckCategory; label: string; title: string }[] = [
  {
    id: 'plot',
    label: 'Plot and setbacks',
    title: 'Setbacks, items in them, boundary wall, projections; walls pulled to the building line',
  },
  {
    id: 'size',
    label: 'Size and height',
    title: 'Covered area, total area, height, storeys, plinth, mumty and car porch',
  },
  { id: 'rooms', label: 'Room sizes', title: 'Bylaw room minimums and room size hints' },
  { id: 'basement', label: 'Basement', title: 'Basement extent and height' },
  {
    id: 'use',
    label: 'Building use',
    title: 'Exits, stairs, corridors, doors and toilets for every kind of building',
  },
  { id: 'layout', label: 'Layout and access', title: 'Doors, stairs and how rooms are reached and placed' },
  { id: 'daylight', label: 'Daylight and air', title: 'Outside walls, windows and air shafts' },
  { id: 'openings', label: 'Door and window gaps', title: 'Doors and windows kept clear of corners and of each other' },
  { id: 'zones', label: 'Furniture space', title: 'The free space furniture needs around it' },
];

export interface ChecksPrefs {
  /** All checks on (the categories in `off` aside) or all paused. */
  on: boolean;
  off: CheckCategory[];
}

export const DEFAULT_CHECKS: ChecksPrefs = { on: true, off: [] };

const PLOT_ROWS = [
  'setbacks',
  'setback-items',
  'boundary',
  'corner-plot',
  'projections',
  'local-bylaws',
  'building-bylaws',
];

/** The kind of check a plan check row is. */
export function rowCategory(row: Pick<CheckRow, 'id'>): CheckCategory {
  const id = row.id;
  if (PLOT_ROWS.includes(id) || id.startsWith('setback-side-')) return 'plot';
  if (id === 'rooms') return 'rooms';
  if (id.startsWith('basement')) return 'basement';
  if (id.startsWith('use-')) return 'use';
  return 'size';
}

/** The kind of check a plan hint is. */
export function hintCategory(hint: Pick<Hint, 'id' | 'kind' | 'fix'>): CheckCategory {
  if (hint.fix === 'opening-gaps') return 'openings';
  if (hint.id.startsWith('zone-')) return 'zones';
  if (hint.id.startsWith('use-')) return 'use';
  if (hint.kind === 'size') return 'rooms';
  if (hint.kind === 'daylight') return 'daylight';
  return 'layout';
}

export const checkOn = (prefs: ChecksPrefs, category: CheckCategory) => prefs.on && !prefs.off.includes(category);

/** The plan check with only the rows whose kind is on (null when none are left). */
export function filterCheck(check: PlanCheck | null, prefs: ChecksPrefs): PlanCheck | null {
  if (!check) return null;
  if (!prefs.on) return null;
  if (!prefs.off.length) return check;
  const rows = check.rows.filter((r) => checkOn(prefs, rowCategory(r)));
  return rows.length ? { ...check, rows } : null;
}

export function filterHints(hints: Hint[], prefs: ChecksPrefs): Hint[] {
  if (!prefs.on) return [];
  return prefs.off.length ? hints.filter((h) => checkOn(prefs, hintCategory(h))) : hints;
}

export function readChecks(raw: unknown): ChecksPrefs {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ChecksPrefs, unknown>>;
  const ids = CHECK_CATEGORIES.map((k) => k.id);
  return {
    on: c.on !== false,
    off: Array.isArray(c.off) ? ids.filter((id) => (c.off as unknown[]).includes(id)) : [],
  };
}

/** Snap points, grouped as the Snap button's menu lists them. */
export type SnapGroup =
  | 'endpoint'
  | 'midpoint'
  | 'faces'
  | 'items'
  | 'intersection'
  | 'perpendicular'
  | 'on'
  | 'centre'
  | 'axes'
  | 'aligned'
  | 'building-line'
  | 'openings';

export const SNAP_GROUPS: { id: SnapGroup; label: string; kinds: SnapKind[] }[] = [
  { id: 'endpoint', label: 'Endpoint', kinds: ['endpoint'] },
  { id: 'midpoint', label: 'Midpoint', kinds: ['midpoint'] },
  { id: 'faces', label: 'Wall corner and face', kinds: ['corner', 'on-face'] },
  { id: 'items', label: 'Corners of items', kinds: ['item-corner'] },
  { id: 'intersection', label: 'Intersection', kinds: ['intersection'] },
  { id: 'perpendicular', label: 'Perpendicular', kinds: ['perpendicular'] },
  { id: 'on', label: 'On wall or line', kinds: ['on-wall', 'on-line'] },
  { id: 'centre', label: 'Centre of arc', kinds: ['centre'] },
  { id: 'axes', label: 'Red and green axes', kinds: ['axis-x', 'axis-y'] },
  { id: 'aligned', label: 'Lined up (dotted guides)', kinds: ['aligned'] },
  { id: 'building-line', label: 'Building line', kinds: ['building-line'] },
  {
    id: 'openings',
    label: 'Door and window spots',
    kinds: ['wall-centre', 'half-centre', 'corner-gap', 'from-corner'],
  },
];

export interface SnapsPrefs {
  /** All snapping on (the groups in `off` aside, and the grid as its own switch) or none. */
  on: boolean;
  off: SnapGroup[];
}

export const DEFAULT_SNAPS: SnapsPrefs = { on: true, off: [] };

export function readSnaps(raw: unknown): SnapsPrefs {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof SnapsPrefs, unknown>>;
  const ids = SNAP_GROUPS.map((k) => k.id);
  return {
    on: c.on !== false,
    off: Array.isArray(c.off) ? ids.filter((id) => (c.off as unknown[]).includes(id)) : [],
  };
}

const GROUP_OF = new Map(SNAP_GROUPS.flatMap((g) => g.kinds.map((k) => [k, g.id] as const)));

/**
 * Which snap kinds may be used: none with snapping off; the building line also needs the plot
 * checks on, and the gap from a corner the door and window gap checks.
 */
export function snapAllowed(snaps: SnapsPrefs, checks: ChecksPrefs): (kind: SnapKind) => boolean {
  return (kind) => {
    if (!snaps.on) return false;
    const group = GROUP_OF.get(kind);
    if (group && snaps.off.includes(group)) return false;
    if (kind === 'building-line') return checkOn(checks, 'plot');
    if (kind === 'corner-gap') return checkOn(checks, 'openings');
    return true;
  };
}
