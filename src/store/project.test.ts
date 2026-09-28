import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { projectOf, shows } from '../lib/project';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { DEFAULT_SLAB_MM } from '../lib/levels';
import { planCheck } from '../lib/planCheck';
import { levelBaseM } from '../three/model';
import { GROUND_LEVEL } from '../types';
import { createPlannerStore } from './plannerStore';

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  return { store, s: () => store.getState() };
};

describe('projects', () => {
  it('an old file is a house, with everything shown', () => {
    const doc = normaliseDoc(emptyDoc());
    expect(projectOf(doc).type).toBe('house');
    for (const panel of ['bylaws', 'hints', 'roomList', 'cost'] as const) expect(shows(doc, panel)).toBe(true);
  });

  it('a new free project or building starts metric and round, with the house sections off', () => {
    const { s } = setup();
    s().newProject('free');
    expect(s().doc.project).toMatchObject({ type: 'free', units: 'metric', wallHeightMm: 3000 });
    expect(s().units).toBe('metric');
    expect(s().wallHeightMm).toBe(3000);
    expect(s().wallThicknessMm).toBe(200);
    expect(shows(s().doc, 'bylaws')).toBe(false);
    expect(shows(s().doc, 'hints')).toBe(true);
    expect(shows(s().doc, 'roomList')).toBe(false);
    expect(shows(s().doc, 'cost')).toBe(false);
    expect(planCheck(s().doc, { authority: undefined } as never)).toBeNull();

    s().newProject('building', 'school');
    expect(s().doc.project).toMatchObject({ type: 'building', use: 'school' });
    s().newProject('house');
    expect(s().doc.project?.units).toBe('imperial');
    expect(s().units).toBe('imperial');
  });

  it('changing the project is one undo step, and units follow it back', () => {
    const { s } = setup();
    s().newProject('house');
    s().setProject({ type: 'building', use: 'clinic', units: 'metric', panels: { cost: true } });
    expect(s().units).toBe('metric');
    expect(shows(s().doc, 'cost')).toBe(true);
    s().undo();
    expect(projectOf(s().doc).type).toBe('house');
    expect(s().units).toBe('imperial');
  });

  it('every floor can have its own height, and the floors above stack on it', () => {
    const { s } = setup();
    s().addLevel();
    s().addLevel();
    const [, first, second] = s().doc.levels;
    const wall = s().wallHeightMm;
    s().setLevelHeight(GROUND_LEVEL, 4500);
    const plinth = s().doc.plinthMm / 1000;
    expect(levelBaseM(s().doc, first.id, wall)).toBeCloseTo(plinth + (4500 + DEFAULT_SLAB_MM) / 1000);
    expect(levelBaseM(s().doc, second.id, wall)).toBeCloseTo(plinth + (4500 + wall + 2 * DEFAULT_SLAB_MM) / 1000);
    s().setProject({ slabMm: 200 });
    expect(levelBaseM(s().doc, first.id, wall)).toBeCloseTo(plinth + 4.7);
    s().setLevelHeight(GROUND_LEVEL, undefined);
    expect(s().doc.levels[0].heightMm).toBeUndefined();
  });

  it('the project and floor heights are saved and checked on opening', () => {
    const raw = {
      ...emptyDoc(),
      project: {
        type: 'building',
        use: 'bakery',
        units: 'metric',
        wallHeightMm: 99999,
        slabMm: 250,
        panels: { cost: 1 },
      },
      levels: [{ id: GROUND_LEVEL, name: 'Ground floor', heightMm: 4000, basement: true }],
    };
    const doc = normaliseDoc(raw);
    expect(doc.project).toEqual({ type: 'building', units: 'metric', slabMm: 250 });
    expect(doc.levels[0]).toMatchObject({ heightMm: 4000 });
    expect(doc.levels[0].basement).toBeUndefined();
    expect(normaliseDoc({ ...emptyDoc(), project: { type: 'castle' } }).project).toBeUndefined();
  });
});
