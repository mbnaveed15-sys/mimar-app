/** The five Mimar themes. Colours live in themes.css; this is what the app needs to pick one. */
export const THEMES = [
  { id: 'brick', name: 'Brick & sandstone', tile: '#A63D26', ink: '#FBF8F3', surface: '#F3ECE1' },
  { id: 'blueprint', name: 'Blueprint', tile: '#14213D', ink: '#C9974F', surface: '#EDF1F7' },
  { id: 'gold', name: 'Black & gold', tile: '#0B0B0B', ink: '#D4AF37', surface: '#1A1917' },
  { id: 'light', name: 'Light', tile: '#17191C', ink: '#FFFFFF', surface: '#F5F6F7' },
  { id: 'dark', name: 'Dark', tile: '#ECEEF0', ink: '#141618', surface: '#1C1F22' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
export const DEFAULT_THEME: ThemeId = 'brick';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** Switch the whole interface to a theme. */
export function applyTheme(theme: ThemeId) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
}

/** Current value of a theme colour, e.g. themeColor('--canvas'). */
export function themeColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}
