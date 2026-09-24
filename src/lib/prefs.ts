import type { Units } from '../types';
import { browserStorage } from './storage';

export interface Prefs {
  units: Units;
  showDimensions: boolean;
}

const PREFS_KEY = 'mimar.prefs';
export const DEFAULT_PREFS: Prefs = { units: 'imperial', showDimensions: true };

export function loadPrefs(storage = browserStorage()): Prefs {
  try {
    const raw = JSON.parse(storage?.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    return {
      units: raw?.units === 'metric' ? 'metric' : 'imperial',
      showDimensions: raw?.showDimensions !== false,
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
