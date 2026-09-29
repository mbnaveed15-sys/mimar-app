import { describe, expect, it } from 'vitest';
import { DEFAULT_PANELS, PANELS, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, movePanel, readPanels } from './panels';

describe('side panel layout', () => {
  it('reads a missing or broken layout as the default', () => {
    expect(readPanels(undefined)).toEqual(DEFAULT_PANELS);
    expect(readPanels('junk')).toEqual(DEFAULT_PANELS);
  });

  it('keeps each known section once and adds any missing at the end', () => {
    const read = readPanels({ order: ['theme', 'nope', 'grid', 'theme'] });
    expect(read.order.slice(0, 2)).toEqual(['theme', 'grid']);
    expect([...read.order].sort()).toEqual(PANELS.map((p) => p.id).sort());
  });

  it('keeps valid choices and clamps the width', () => {
    const read = readPanels({ view: 'tabs', side: 'left', width: 5000, tab: 'layers', folded: true });
    expect(read).toMatchObject({ view: 'tabs', side: 'left', width: PANEL_WIDTH_MAX, tab: 'layers', folded: true });
    expect(readPanels({ width: 10 }).width).toBe(PANEL_WIDTH_MIN);
    expect(readPanels({ tab: 'nope', side: 'up', view: 'grid' })).toMatchObject({
      tab: 'properties',
      side: 'right',
      view: 'stacked',
    });
  });

  it('moves a section before another, counting positions with it still in place', () => {
    const order = DEFAULT_PANELS.order;
    // Down: before the section two places on.
    expect(movePanel(order, 'project', 2).slice(0, 3)).toEqual(['ground', 'project', 'layout']);
    // Up: to the top.
    expect(movePanel(order, 'settings', 0)[0]).toBe('settings');
    // To the end.
    expect(movePanel(order, 'project', order.length).at(-1)).toBe('project');
    expect(movePanel(order, 'grid', 99)).toHaveLength(order.length);
  });
});
