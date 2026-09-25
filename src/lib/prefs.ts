import { DEFAULT_THEME, isThemeId, type ThemeId } from '../theme/themes';
import type { MarlaSqFt, Mode, PaperSize, Units } from '../types';
import { browserStorage } from './storage';
import { GRID_MM } from './units';

export interface GridPrefs {
  /** Show the grid on the plan (it still snaps when hidden, if snap is on). */
  show: boolean;
  /** Distance between grid lines for each unit system, in millimetres. */
  spacingMm: Record<Units, number>;
  /** A heavier line every this many steps, or 0 for none. */
  major: 0 | 5 | 10;
  style: 'lines' | 'dots';
  /** How strong the grid looks, from 0 (faint) to 100 (bold). */
  strength: number;
  /** Drawing snaps to grid points when no wall end is nearer. */
  snap: boolean;
  /** Your own line colours, kept for each theme (the theme's own colours when missing). */
  colors: Partial<Record<ThemeId, GridColors>>;
}

export interface GridColors {
  minor?: string;
  major?: string;
}

export const DEFAULT_GRID: GridPrefs = {
  show: true,
  spacingMm: { ...GRID_MM },
  major: 5,
  style: 'lines',
  strength: 50,
  snap: true,
  colors: {},
};

/** Grid spacing limits: 1 cm to 10 m. */
export const GRID_MIN_MM = 10;
export const GRID_MAX_MM = 10000;

export interface Prefs {
  units: Units;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
  showRoomFills: boolean;
  mode: Mode;
  /** Thickness for new walls, in millimetres. */
  wallThicknessMm: number;
  marlaSqFt: MarlaSqFt;
  paper: PaperSize;
  /** Wall height in the 3D view, in millimetres. */
  wallHeightMm: number;
  theme: ThemeId;
  grid: GridPrefs;
}

const PREFS_KEY = 'mimar.prefs';
export const DEFAULT_PREFS: Prefs = {
  units: 'imperial',
  showDimensions: true,
  showFurniture: true,
  showRoomLabels: true,
  showRoomFills: true,
  mode: 'simple',
  wallThicknessMm: 228.6,
  marlaSqFt: 225,
  paper: 'A4',
  wallHeightMm: 3048,
  theme: DEFAULT_THEME,
  grid: DEFAULT_GRID,
};

const spacingOk = (mm: unknown): mm is number => typeof mm === 'number' && mm >= GRID_MIN_MM && mm <= GRID_MAX_MM;

/** Grid settings from storage, keeping only valid values. */
export function readGrid(raw: unknown): GridPrefs {
  const g = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof GridPrefs, unknown>>;
  const spacing = (g.spacingMm && typeof g.spacingMm === 'object' ? g.spacingMm : {}) as Partial<
    Record<Units, unknown>
  >;
  const strength = Number(g.strength);
  return {
    show: g.show !== false,
    spacingMm: {
      imperial: spacingOk(spacing.imperial) ? spacing.imperial : DEFAULT_GRID.spacingMm.imperial,
      metric: spacingOk(spacing.metric) ? spacing.metric : DEFAULT_GRID.spacingMm.metric,
    },
    major: g.major === 0 || g.major === 10 ? g.major : 5,
    style: g.style === 'dots' ? 'dots' : 'lines',
    strength: Number.isFinite(strength) ? Math.min(100, Math.max(0, strength)) : DEFAULT_GRID.strength,
    snap: g.snap !== false,
    colors: readColors(g.colors),
  };
}

const isHex = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

function readColors(raw: unknown): GridPrefs['colors'] {
  const out: GridPrefs['colors'] = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [theme, value] of Object.entries(raw)) {
    if (!isThemeId(theme) || !value || typeof value !== 'object') continue;
    const { minor, major } = value as Record<string, unknown>;
    const colors: GridColors = { ...(isHex(minor) ? { minor } : {}), ...(isHex(major) ? { major } : {}) };
    if (colors.minor || colors.major) out[theme] = colors;
  }
  return out;
}

export function loadPrefs(storage = browserStorage()): Prefs {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    const thickness = Number(raw?.wallThicknessMm);
    return {
      units: raw?.units === 'metric' ? 'metric' : 'imperial',
      showDimensions: raw?.showDimensions !== false,
      showFurniture: raw?.showFurniture !== false,
      showRoomLabels: raw?.showRoomLabels !== false,
      showRoomFills: raw?.showRoomFills !== false,
      mode: raw?.mode === 'pro' ? 'pro' : 'simple',
      wallThicknessMm: thickness >= 25 && thickness <= 1000 ? thickness : DEFAULT_PREFS.wallThicknessMm,
      marlaSqFt: raw?.marlaSqFt === 272.25 ? 272.25 : 225,
      paper: raw?.paper === 'A3' ? 'A3' : 'A4',
      wallHeightMm:
        Number(raw?.wallHeightMm) >= 2000 && Number(raw?.wallHeightMm) <= 6000
          ? Number(raw?.wallHeightMm)
          : DEFAULT_PREFS.wallHeightMm,
      theme: isThemeId(raw?.theme) ? raw.theme : DEFAULT_THEME,
      grid: readGrid(raw?.grid),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs: Prefs, storage = browserStorage()): void {
  try {
    storage?.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; ignore storage errors.
  }
}
