import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import type { Opening, Wall } from '../types';
import { createPlannerStore, KIND_HEIGHT_MM } from './plannerStore';

const setup = () => createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);

describe('site tools', () => {
  it('adds a plot with its boundary wall in one undo step', () => {
    const store = setup();
    const s = () => store.getState();
    s().addPlot([
      { x: 0, y: 0 },
      { x: 762, y: 0 },
      { x: 762, y: 1371.6 },
      { x: 0, y: 1371.6 },
    ]);
    const walls = s().doc.elements.filter((el): el is Wall => el.type === 'wall');
    expect(s().doc.elements.filter((el) => el.type === 'plot')).toHaveLength(1);
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => w.kind === 'boundary' && w.heightMm === KIND_HEIGHT_MM.boundary)).toBe(true);
    s().undo();
    expect(s().doc.elements).toHaveLength(0);
  });

  it('can leave out the boundary wall', () => {
    const store = setup();
    const s = () => store.getState();
    s().setSite({ boundaryWall: false });
    s().addPlot([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    expect(s().doc.elements.map((el) => el.type)).toEqual(['plot']);
  });

  it('draws walls of the chosen type, and places gates', () => {
    const store = setup();
    const s = () => store.getState();
    s().setSite({ wallKind: 'parapet' });
    s().addWall({ x: 0, y: 0 }, { x: 1000, y: 0 });
    const wall = s().doc.elements[0] as Wall;
    expect(wall).toMatchObject({ kind: 'parapet', heightMm: KIND_HEIGHT_MM.parapet });
    s().setSite({ gate: true, gateWidthMm: 3048 });
    s().placeOpening('door', { x: 500, y: 0 });
    const gate = s().doc.elements.find((el): el is Opening => el.type === 'door')!;
    expect(gate.gate).toBe(true);
    expect(gate.width).toBeCloseTo(304.8);
  });

  it('makes a stair that climbs a full floor, or just the plinth', () => {
    const store = setup();
    const s = () => store.getState();
    s().addStair({ x: 0, y: 0 });
    const stair = s().doc.elements[0];
    expect(stair.type).toBe('stair');
    if (stair.type !== 'stair') return;
    expect(stair.riserMm).toBeLessThanOrEqual(177.8);
    expect(stair.riseMm).toBeCloseTo(s().wallHeightMm + 152.4);
    s().setSite({ climb: 'plinth' });
    s().addStair({ x: 500, y: 0 });
    const steps = s().doc.elements[1];
    expect(steps.type === 'stair' && steps.riseMm).toBeCloseTo(s().doc.plinthMm);
  });

  it('puts a parapet round a roof slab on a new Roof floor', () => {
    const store = setup();
    const s = () => store.getState();
    s().addSlab([
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 500 },
      { x: 0, y: 500 },
    ]);
    const slab = s().doc.elements[0];
    s().addParapetAround(slab.id);
    expect(s().doc.levels.map((l) => l.name)).toEqual(['Ground floor', 'Roof']);
    const parapets = s().doc.elements.filter((el): el is Wall => el.type === 'wall');
    expect(parapets).toHaveLength(4);
    expect(parapets.every((w) => w.kind === 'parapet' && w.levelId === s().activeLevel)).toBe(true);
    s().undo();
    expect(s().doc.elements).toHaveLength(1);
    expect(s().doc.levels).toHaveLength(1);
  });
});
