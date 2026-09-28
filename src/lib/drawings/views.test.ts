import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc } from '../storage';
import { plotRect } from '../site';
import { createPlannerStore } from '../../store/plannerStore';
import { rightOf } from './hiddenLines';
import { formatLevel } from './levels';
import {
  drawingFromKey,
  drawingKey,
  drawingTitle,
  elevationLook,
  frontLook,
  nextSectionLabel,
  sectionLines,
  sectionLook,
  sideDrawing,
  sideDrawingRefs,
} from './views';
import type { DrawingRef, PlanElement } from '../../types';

const ft = (f: number) => (f * 304.8) / 10;
const OPTS = { wallHeightMm: 3048, units: 'imperial' as const };

/** A 20' × 30' house with a door, a first floor, a basement under it and a section across it. */
function house() {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = () => store.getState();
  s().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  s().addLevel();
  s().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  s().addBasement();
  expect(s().addRetainingWalls('house')).toBe(true);
  s().setActiveLevel(s().doc.levels[1].id);
  s().addSection({ x: -ft(2), y: ft(15) }, { x: ft(22), y: ft(15) }, false);
  return { store, s };
}

describe('levels', () => {
  it('writes heights as architects do', () => {
    expect(formatLevel(0, 'imperial')).toBe(`±0'-0"`);
    expect(formatLevel(3505.2, 'imperial')).toBe(`+11'-6"`);
    expect(formatLevel(-3048, 'imperial')).toBe(`-10'-0"`);
    expect(formatLevel(3350, 'metric')).toBe('+3.350');
    expect(formatLevel(-450, 'metric')).toBe('-0.450');
    expect(formatLevel(0.2, 'metric')).toBe('±0.000');
  });
});

describe('section lines', () => {
  const line = (label: string): PlanElement => ({ id: label, type: 'section', x1: 0, y1: 0, x2: 1, y2: 0, label });

  it('take the next free letter', () => {
    expect(nextSectionLabel({ elements: [] })).toBe('A');
    expect(nextSectionLabel({ elements: [line('A'), line('C')] })).toBe('B');
    const all = Array.from({ length: 26 }, (_, i) => line(String.fromCharCode(65 + i)));
    expect(nextSectionLabel({ elements: all })).toBe('AA');
  });

  it('look to their right, or their left when flipped', () => {
    // Drawn left to right across the page, a section looks down the page.
    expect(sectionLook({ x1: 0, y1: 0, x2: 100, y2: 0 })).toEqual({ x: -0, z: 1 });
    expect(sectionLook({ x1: 0, y1: 0, x2: 100, y2: 0, flip: true })).toEqual({ x: 0, z: -1 });
  });

  it('key their drawings so they can be found again', () => {
    const refs: DrawingRef[] = [
      { kind: 'plan', levelId: 'ground' },
      { kind: 'section', id: 'x:y' },
      { kind: 'elevation', side: 'left' },
    ];
    for (const ref of refs) expect(drawingFromKey(drawingKey(ref))).toEqual(ref);
    expect(drawingFromKey('elevation:up')).toBeNull();
    expect(drawingFromKey('nonsense')).toBeNull();
  });
});

describe('elevations', () => {
  it('face the road when there is a plot, and up the page when there is not', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    expect(frontLook(store.getState().doc)).toEqual({ x: 0, z: -1 });
    store.getState().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(25), y: ft(45) }));
    const doc = store.getState().doc;
    const f = frontLook(doc);
    expect(Math.hypot(f.x, f.z)).toBeCloseTo(1);
    const back = elevationLook(doc, 'back');
    expect([back.x + f.x, back.z + f.z]).toEqual([0, 0]);
    expect(elevationLook(doc, 'left')).toEqual(rightOf(f));
  });
});

describe('drawing a house', () => {
  it('cuts a section through walls and slabs, down into the basement', () => {
    const { s } = house();
    const doc = s().doc;
    const [line] = sectionLines(doc);
    expect(line.label).toBe('A');
    const d = sideDrawing(doc, { kind: 'section', id: line.id }, OPTS)!;
    expect(d.title).toBe('Section A–A');
    expect(d.cut.length).toBeGreaterThan(4);
    // The basement and its retaining walls go below the ground.
    expect(d.bounds!.minV).toBeLessThan(-2);
    // Two floors over the plinth, with a slab over each.
    expect(d.bounds!.maxV).toBeGreaterThan(6);
    expect(d.levels.map((l) => l.name)).toEqual([
      'Basement',
      'Natural ground',
      'Ground floor (plinth)',
      'First floor',
      'Top of roof slab',
    ]);
    expect(d.levels[1].label).toBe(`±0'-0"`);
  });

  it('draws elevations from above the ground, with no cut', () => {
    const { s } = house();
    const doc = s().doc;
    for (const side of ['front', 'back', 'left', 'right'] as const) {
      const d = sideDrawing(doc, { kind: 'elevation', side }, OPTS)!;
      expect(d.cut).toEqual([]);
      expect(d.bounds!.minV).toBeGreaterThanOrEqual(0);
      expect(d.lines.some((l) => l.heavy)).toBe(true);
    }
    // The front and back are as wide as the house; the sides as deep.
    const width = (side: 'front' | 'left') => {
      const b = sideDrawing(doc, { kind: 'elevation', side }, OPTS)!.bounds!;
      return b.maxU - b.minU;
    };
    expect(width('front')).toBeLessThan(width('left'));
  });

  it('lists every drawing, and forgets a section once its line is deleted', () => {
    const { s } = house();
    const refs = sideDrawingRefs(s().doc);
    expect(refs.map((r) => drawingTitle(s().doc, r))).toEqual([
      'Section A–A',
      'Front elevation',
      'Back elevation',
      'Left side elevation',
      'Right side elevation',
    ]);
    const id = sectionLines(s().doc)[0].id;
    s().select(id);
    s().deleteSelected();
    expect(sideDrawing(s().doc, { kind: 'section', id }, OPTS)).toBeNull();
    expect(drawingTitle(s().doc, { kind: 'section', id })).toBeNull();
  });
});
