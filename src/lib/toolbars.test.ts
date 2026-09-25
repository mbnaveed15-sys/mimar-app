import { describe, expect, it } from 'vitest';
import {
  BUTTON_GAP_PX,
  BUTTON_PX,
  DEFAULT_TOOLBARS,
  GRIP_PX,
  moveToolbar,
  packColumns,
  readToolbars,
} from './toolbars';

const px = (buttons: number) => GRIP_PX + buttons * (BUTTON_PX + BUTTON_GAP_PX);

describe('tool bars', () => {
  it('reads a saved layout, keeping each bar once and sending missing ones back to the left', () => {
    expect(readToolbars(undefined)).toEqual(DEFAULT_TOOLBARS);
    const layout = readToolbars({ top: ['draw', 'draw', 'nope'], right: ['modify'], left: 'x' });
    expect(layout.top).toEqual(['draw']);
    expect(layout.right).toEqual(['modify']);
    expect(layout.left).toEqual(['view', 'structure', 'shapes', 'change', 'finish', 'pro']);
  });

  it('moves a bar to another side, or next to another bar', () => {
    let layout = moveToolbar(DEFAULT_TOOLBARS, 'draw', 'top');
    expect(layout.top).toEqual(['draw']);
    expect(layout.left).not.toContain('draw');
    layout = moveToolbar(layout, 'view', 'top', 0);
    expect(layout.top).toEqual(['view', 'draw']);
    // Later in the same area: counted with it still in place.
    layout = moveToolbar(layout, 'view', 'top', 2);
    expect(layout.top).toEqual(['draw', 'view']);
  });

  it('packs bars into columns without a scrollbar, splitting only a bar taller than a column', () => {
    const bars = [
      { id: 'view' as const, count: 4 },
      { id: 'draw' as const, count: 7 },
      { id: 'modify' as const, count: 10 },
    ];
    expect(packColumns(bars, 2000)).toHaveLength(1);
    // Room for 8 buttons a column: view (4) fits; draw (7) starts the next; modify (10) is split.
    const cols = packColumns(bars, px(8));
    expect(cols[0]).toEqual([{ id: 'view', from: 0, to: 4 }]);
    expect(cols[1]).toEqual([{ id: 'draw', from: 0, to: 7 }]);
    expect(cols[2]).toEqual([{ id: 'modify', from: 0, to: 8 }]);
    expect(cols[3]).toEqual([{ id: 'modify', from: 8, to: 10 }]);
    // Even a tiny window shows every button.
    const tiny = packColumns(bars, 10);
    expect(tiny.flat().reduce((n, p) => n + p.to - p.from, 0)).toBe(21);
  });
});
