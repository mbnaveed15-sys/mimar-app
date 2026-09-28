import { describe, expect, it } from 'vitest';
import type { Inference } from '../lib/inference';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { createPlannerStore } from '../store/plannerStore';
import { offsetPolygon, structureHover, structurePress, structureRelease } from './structureTools';

describe('slab outlines', () => {
  it('grows a room outline out to the wall centres', () => {
    for (const square of [
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ],
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 0 },
      ],
    ]) {
      const out = offsetPolygon(square, 2);
      const xs = out.map((p) => p.x);
      expect(Math.min(...xs)).toBeCloseTo(-2);
      expect(Math.max(...xs)).toBeCloseTo(12);
    }
  });
});

describe('the Section tool', () => {
  const at = (x: number, y: number): Inference => ({ point: { x, y }, kind: 'free' });

  it('takes two ends and then the side it looks to, and gets the next letter', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = store.getState;
    s().setTool('section');
    structurePress(store, at(0, 0));
    structureHover(store, at(300, 0));
    structurePress(store, at(300, 0));
    // Above the line (up the page) is its left: it looks that way.
    structureHover(store, at(150, -100));
    expect(s().draft).toMatchObject({ type: 'section', placed: true, flip: true });
    structureHover(store, at(150, 100));
    expect(s().draft).toMatchObject({ flip: false });
    structurePress(store, at(150, 100));
    expect(s().draft).toBeNull();
    // A drag puts both ends down at once.
    structurePress(store, at(0, 50));
    structureHover(store, at(300, 50));
    structureRelease(store, true);
    structureHover(store, at(150, -100));
    structurePress(store, at(150, -100));
    const lines = s().doc.elements.filter((el) => el.type === 'section');
    expect(lines).toMatchObject([
      { x1: 0, y1: 0, x2: 300, y2: 0, label: 'A' },
      { x1: 0, y1: 50, x2: 300, y2: 50, label: 'B', flip: true },
    ]);
    expect(lines[0]).not.toHaveProperty('flip');
  });

  it('opens its drawing in the Drawings view, which drawing tools close again', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = store.getState;
    s().addSection({ x: 0, y: 0 }, { x: 300, y: 0 }, false);
    s().showDrawing();
    const id = s().doc.elements[0].id;
    expect(s().drawing).toBe(`section:${id}`);
    s().setTool('pan');
    expect(s().drawing).toBe(`section:${id}`);
    s().setTool('wall');
    expect(s().drawing).toBeNull();
    s().showDrawing('elevation:front');
    s().setView3d(true);
    expect(s().drawing).toBeNull();
  });

  it('keeps the plan’s own sheets, undoably, and goes back to the suggested set', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = store.getState;
    s().setSheets([{ id: 'a', name: 'Mine', paper: 'A1', items: [] }]);
    expect(s().doc.sheets).toHaveLength(1);
    s().undo();
    expect(s().doc.sheets).toBeUndefined();
    s().redo();
    s().setSheets(undefined);
    expect(s().doc).not.toHaveProperty('sheets');
  });
});
