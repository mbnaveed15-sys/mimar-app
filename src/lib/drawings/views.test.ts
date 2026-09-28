import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc } from '../storage';
import { plotRect } from '../site';
import { createPlannerStore } from '../../store/plannerStore';
import { groundAt, rightOf } from './hiddenLines';
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
import type { DrawingRef, GroundSettings, PlanDoc, PlanElement } from '../../types';

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

/**
 * A 20' × 30' house in a 40' × 60' plot, with a section down the page through both, on ground that
 * falls 3 m from the top of the page to the bottom (the road side).
 */
function slopingHouse(ground: GroundSettings): PlanDoc {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = store.getState;
  s().addPlot(plotRect({ x: -ft(10), y: -ft(15) }, { x: ft(30), y: ft(45) }));
  s().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  s().addSection({ x: ft(10), y: -ft(25) }, { x: ft(10), y: ft(55) }, false);
  const level = (id: string, x: number, y: number, zMm: number): PlanElement => ({ id, type: 'level', x, y, zMm });
  const levels = [
    level('l1', -ft(40), -ft(40), 0),
    level('l2', ft(60), -ft(40), 0),
    level('l3', -ft(40), ft(70), -3000),
    level('l4', ft(60), ft(70), -3000),
  ];
  return { ...s().doc, elements: [...s().doc.elements, ...levels], ground };
}

describe('drawing the ground', () => {
  it('follows the ground along a section', () => {
    const doc = slopingHouse({ grade: 'natural' });
    const [line] = sectionLines(doc);
    const d = sideDrawing(doc, { kind: 'section', id: line.id }, OPTS)!;
    const { finished, natural } = d.profile!;
    // Left as it is, the ground is only the natural ground, falling steadily across the drawing.
    expect(natural).toEqual([]);
    const vs = finished.map((p) => p[1]);
    expect(Math.max(...vs) - Math.min(...vs)).toBeGreaterThan(1.5);
    const falling = vs[vs.length - 1] < vs[0];
    for (let i = 1; i < vs.length; i++)
      expect(falling ? vs[i] <= vs[i - 1] + 1e-9 : vs[i] >= vs[i - 1] - 1e-9).toBe(true);
    // It runs as far as the drawing's ground.
    expect(finished[0][0]).toBeCloseTo(d.ground.u0);
    expect(finished[finished.length - 1][0]).toBeCloseTo(d.ground.u1);
    // Heights count from the road level.
    const datum = d.levels.find((l) => l.v === 0)!;
    expect(datum.name).toBe('Road level (datum)');
    expect(datum.label).toBe(`±0'-0"`);
    expect(d.levels.some((l) => l.name.includes('Natural ground'))).toBe(false);
  });

  it('shows the natural ground dashed where a levelled plot differs from it', () => {
    const doc = slopingHouse({ levelMm: -1000 });
    const [line] = sectionLines(doc);
    const d = sideDrawing(doc, { kind: 'section', id: line.id }, OPTS)!;
    const { finished, natural } = d.profile!;
    // Inside the plot the finished ground is level at -1 m; outside it, it is the natural ground.
    const flat = finished.filter((p) => Math.abs(p[1] + 1) < 1e-6);
    expect(flat.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(flat[flat.length - 1][0] - flat[0][0])).toBeCloseTo(ft(60) / 100, 1);
    expect(natural.length).toBeGreaterThan(0);
    // The natural ground runs above the finished ground on one side and below it on the other.
    const nat = natural.flat();
    expect(nat.some((p) => p[1] > -0.9)).toBe(true);
    expect(nat.some((p) => p[1] < -1.1)).toBe(true);
    for (const p of nat) expect(p[0]).toBeGreaterThanOrEqual(Math.min(...flat.map((q) => q[0])) - 0.01);
    // Levels mark where the plot is finished to.
    expect(d.levels.find((l) => l.name === 'Finished ground')?.v).toBeCloseTo(-1);
  });

  it('leaves out what is below the finished ground in an elevation', () => {
    const raised = slopingHouse({ levelMm: 1000 });
    const front = sideDrawing(raised, { kind: 'elevation', side: 'front' }, OPTS)!;
    // The plot is filled up to +1 m round the house, so nothing shows below it.
    expect(front.bounds!.minV).toBeGreaterThan(0.99);
    expect(front.profile!.finished.some((p) => Math.abs(p[1] - 1) < 1e-6)).toBe(true);
    // Across the slope, every line stays above the ground where it is.
    const side = sideDrawing(slopingHouse({ grade: 'natural' }), { kind: 'elevation', side: 'left' }, OPTS)!;
    const g = side.profile!.finished;
    expect(Math.max(...g.map((p) => p[1])) - Math.min(...g.map((p) => p[1]))).toBeGreaterThan(0.5);
    for (const l of side.lines)
      for (const p of [l.a, l.b]) expect(p[1]).toBeGreaterThanOrEqual(groundAt(g, p[0]) - 1e-6);
  });

  it('draws as before when there is no ground', () => {
    const { s } = house();
    const d = sideDrawing(s().doc, { kind: 'elevation', side: 'front' }, OPTS)!;
    expect(d.profile).toBeUndefined();
    expect(d.levels.some((l) => l.name === 'Natural ground')).toBe(true);
  });
});
