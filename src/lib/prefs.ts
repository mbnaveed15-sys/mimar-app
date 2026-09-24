import type { MarlaSqFt, Mode, PaperSize, Units } from '../types';
import { browserStorage } from './storage';

export interface Prefs {
  units: Units;
  showDimensions: boolean;
  mode: Mode;
  /** Thickness for new walls, in millimetres. */
  wallThicknessMm: number;
  marlaSqFt: MarlaSqFt;
  paper: PaperSize;
}

const PREFS_KEY = 'mimar.prefs';
export const DEFAULT_PREFS: Prefs = {
  units: 'imperial',
  showDimensions: true,
  mode: 'simple',
  wallThicknessMm: 228.6,
  marlaSqFt: 225,
  paper: 'A4',
};

export function loadPrefs(storage = browserStorage()): Prefs {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    const thickness = Number(raw?.wallThicknessMm);
    return {
      units: raw?.units === 'metric' ? 'metric' : 'imperial',
      showDimensions: raw?.showDimensions !== false,
      mode: raw?.mode === 'pro' ? 'pro' : 'simple',
      wallThicknessMm: thickness >= 25 && thickness <= 1000 ? thickness : DEFAULT_PREFS.wallThicknessMm,
      marlaSqFt: raw?.marlaSqFt === 272.25 ? 272.25 : 225,
      paper: raw?.paper === 'A3' ? 'A3' : 'A4',
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
