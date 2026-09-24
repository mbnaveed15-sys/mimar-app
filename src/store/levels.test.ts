import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { createPlannerStore } from './plannerStore';

const setup = () => createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);

describe('floors', () => {
  it('puts new items on the floor being drawn and shows only that floor', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    s().addLevel();
    expect(s().doc.levels.map((l) => l.name)).toEqual(['Ground floor', 'First floor']);
    s().addWall({ x: 0, y: 50 }, { x: 100, y: 50 });
    s().addColumn({ x: 0, y: 50 });
    expect(s().levelElements()).toHaveLength(2);
    expect(
      s()
        .levelElements()
        .every((el) => el.levelId === s().activeLevel),
    ).toBe(true);
    s().setActiveLevel('ground');
    expect(s().levelElements()).toHaveLength(1);
    expect(s().levelElements()[0].levelId).toBeUndefined();
  });

  it('deletes a floor with everything on it, and keeps the ground floor', () => {
    const store = setup();
    const s = () => store.getState();
    s().addLevel();
    const first = s().activeLevel;
    s().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    s().deleteLevel(first);
    expect(s().doc.levels).toHaveLength(1);
    expect(s().doc.elements).toHaveLength(0);
    expect(s().activeLevel).toBe('ground');
    s().deleteLevel('ground');
    expect(s().doc.levels).toHaveLength(1);
  });

  it('reads floors, plinth and structure back from a saved plan', () => {
    const doc = normaliseDoc({
      levels: [{ id: 'f1', name: 'First' }],
      plinthMm: 600,
      elements: [
        { id: 'c', type: 'column', x: 1, y: 2, w: 23, h: 30, shape: 'round', levelId: 'f1' },
        { id: 'b', type: 'beam', x1: 0, y1: 0, x2: 10, y2: 0, width: 23, depth: 45 },
        {
          id: 's',
          type: 'slab',
          thickness: 15,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      ],
    });
    // The ground floor is added back, first.
    expect(doc.levels.map((l) => l.id)).toEqual(['ground', 'f1']);
    expect(doc.plinthMm).toBe(600);
    expect(doc.elements.map((e) => e.type)).toEqual(['column', 'beam', 'slab']);
    expect(doc.elements[0]).toMatchObject({ shape: 'round', levelId: 'f1' });
  });
});
