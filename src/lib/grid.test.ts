import { describe, expect, it } from 'vitest';
import { emptyDoc } from './storage';
import { gridLevels } from './grid';
import { DEFAULT_GRID, DEFAULT_PREFS, loadPrefs, readGrid } from './prefs';
import { createPlannerStore } from '../store/plannerStore';
import { isThemeId, THEMES } from '../theme/themes';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe('grid levels', () => {
  it('shows minor and major lines when there is room', () => {
    expect(gridLevels(30, 5, 1)).toEqual({ minor: 30, major: 150 });
  });

  it('hides minor lines when zoomed out, keeping the major ones', () => {
    expect(gridLevels(30, 5, 10)).toEqual({ minor: null, major: 150 });
    expect(gridLevels(30, 10, 100)).toEqual({ minor: null, major: 3000 });
  });

  it('coarsens a grid without major lines', () => {
    expect(gridLevels(30, 0, 1)).toEqual({ minor: 30, major: null });
    expect(gridLevels(30, 0, 10)).toEqual({ minor: 150, major: null });
  });
});

describe('grid and theme preferences', () => {
  it('keeps valid settings and repairs bad ones', () => {
    expect(readGrid(undefined)).toEqual(DEFAULT_GRID);
    expect(
      readGrid({ show: false, spacingMm: { imperial: 152.4, metric: 5 }, major: 10, style: 'dots', strength: 180 }),
    ).toEqual({
      ...DEFAULT_GRID,
      show: false,
      spacingMm: { imperial: 152.4, metric: DEFAULT_GRID.spacingMm.metric },
      major: 10,
      style: 'dots',
      strength: 100,
    });
  });

  it('remembers the theme, and falls back to Brick for unknown ones', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['brick', 'blueprint', 'gold', 'light', 'dark']);
    expect(isThemeId('gold')).toBe(true);
    expect(loadPrefs(memoryStorage({ 'mimar.prefs': '{"theme":"gold"}' })).theme).toBe('gold');
    expect(loadPrefs(memoryStorage({ 'mimar.prefs': '{"theme":"neon"}' })).theme).toBe('brick');
  });

  it('changes grid spacing for the current units only, within limits', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    store.getState().setUnits('metric');
    store.getState().setGrid({ spacingMm: 500, major: 10 });
    expect(store.getState().gridPx).toBe(50);
    expect(store.getState().grid.spacingMm).toEqual({ imperial: DEFAULT_GRID.spacingMm.imperial, metric: 500 });
    store.getState().setGrid({ spacingMm: 1 });
    expect(store.getState().grid.spacingMm.metric).toBe(10);
    store.getState().setUnits('imperial');
    expect(store.getState().gridPx).toBeCloseTo(30.48);
    expect(store.getState().grid.major).toBe(10);
  });

  it('keeps your own grid colours for each theme, and can go back to the theme default', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().setTheme('dark');
    s().setGridColor('major', '#8899aa');
    s().setTheme('light');
    s().setGridColor('minor', '#dddddd');
    expect(s().grid.colors).toEqual({ dark: { major: '#8899aa' }, light: { minor: '#dddddd' } });
    s().setGridColor('minor', null);
    expect(s().grid.colors).toEqual({ dark: { major: '#8899aa' } });
  });

  it('reads saved grid colours, dropping unknown themes and bad colours', () => {
    expect(
      readGrid({ colors: { dark: { minor: '#112233', major: 'red' }, neon: { minor: '#000000' }, gold: {} } }).colors,
    ).toEqual({ dark: { minor: '#112233' } });
  });
});
