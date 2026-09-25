import { describe, expect, it } from 'vitest';
import { layerOf, withoutHidden } from '../lib/layers';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import type { PlanDoc } from '../types';
import { createPlannerStore } from './plannerStore';

const doc = (): PlanDoc => ({
  ...emptyDoc(),
  elements: [
    { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 500, y2: 0 },
    { id: 'd', type: 'door', wallId: 'w', x: 250, y: 0, width: 90, angle: 0 },
    { id: 'c', type: 'column', x: 600, y: 0, w: 23, h: 30, shape: 'rect' },
    { id: 'l', type: 'line', x1: 0, y1: 200, x2: 500, y2: 200 },
  ],
});

describe('layers', () => {
  it('puts every item on the layer for its kind', () => {
    expect(doc().elements.map(layerOf)).toEqual(['walls', 'doors', 'columns', 'lines']);
  });

  it('hides a layer from view and picking; doors go with a hidden wall', () => {
    const store = createPlannerStore(doc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().setLayerFlags('walls', { hidden: true });
    expect(s().visibleElements().map((el) => el.id)).toEqual(['c', 'l']);
    expect(s().shownDoc().elements.map((el) => el.id)).toEqual(['c', 'l']);
    s().undo();
    expect(s().visibleElements()).toHaveLength(4);
  });

  it('locks a layer: still shown and snapped to, but not picked', () => {
    const store = createPlannerStore(doc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().setLayerFlags('columns', { locked: true });
    expect(s().visibleElements().some((el) => el.id === 'c')).toBe(true);
    expect(s().pickableElements().some((el) => el.id === 'c')).toBe(false);
    s().selectAll();
    expect(s().selectedIds).not.toContain('c');
  });

  it('hides and locks single items, and brings them all back', () => {
    const store = createPlannerStore(doc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().select('c');
    s().hideSelected();
    expect(s().selectedIds).toEqual([]);
    expect(s().visibleElements().some((el) => el.id === 'c')).toBe(false);
    s().select('l');
    s().lockSelected(true);
    expect(s().pickableElements().map((el) => el.id)).toEqual(['w', 'd']);
    // Kept when saved.
    const saved = normaliseDoc(JSON.parse(JSON.stringify(s().doc)));
    expect(saved.elements.find((el) => el.id === 'c')?.hidden).toBe(true);
    expect(saved.elements.find((el) => el.id === 'l')?.locked).toBe(true);
    s().showAllHidden();
    s().unlockAll();
    expect(s().pickableElements()).toHaveLength(4);
    expect(s().doc.elements.every((el) => !el.hidden && !el.locked)).toBe(true);
  });

  it('the Furniture layer switch still hides furniture', () => {
    const d = { ...doc(), elements: [{ id: 'f', type: 'furniture' as const, x: 0, y: 0, w: 10, h: 10 }] };
    expect(withoutHidden(d, { showFurniture: false }).elements).toHaveLength(0);
    expect(withoutHidden(d, { showFurniture: true }).elements).toHaveLength(1);
  });

  it('turns layout lines into walls', () => {
    const store = createPlannerStore(doc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().select('l');
    s().linesToWalls();
    expect(s().doc.elements.some((el) => el.type === 'line')).toBe(false);
    expect(s().doc.elements.filter((el) => el.type === 'wall')).toHaveLength(2);
    s().undo();
    expect(s().doc.elements.some((el) => el.type === 'line')).toBe(true);
  });
});
