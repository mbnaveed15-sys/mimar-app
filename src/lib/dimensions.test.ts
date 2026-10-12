import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from './prefs';
import { emptyDoc, normaliseDoc } from './storage';
import { createPlannerStore } from '../store/plannerStore';
import type { Dimension, Furniture, PlanDoc, PlanElement, Wall } from '../types';
import { dimLine, linearAngle } from './dimLine';
import { remapTies, syncDimensions, tieFor, tieOn, tiePoint } from './dimensions';
import { breakWall, joinWalls, mirrorItems, scaleItems, stretchItems } from './modify';
import { copyItems, moveItems, rotateItems } from './selection';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
  thickness: 20,
  ...extra,
});
const plan = (...elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), elements });
const dimOf = (doc: PlanDoc, id = 'd') => doc.elements.find((el) => el.id === id) as Dimension;
const withEl = (doc: PlanDoc, el: PlanElement): PlanDoc => ({
  ...doc,
  elements: doc.elements.map((e) => (e.id === el.id ? el : e)),
});

/** A dimension measuring wall w from end to end, its line 50 below. */
function tiedAcross(w: Wall): Dimension {
  return {
    id: 'd',
    type: 'dimension',
    x1: w.x1,
    y1: w.y1,
    x2: w.x2,
    y2: w.y2,
    lx: w.x1,
    ly: w.y1 + 50,
    tie1: tieOn(w, { x: w.x1, y: w.y1 })!,
    tie2: tieOn(w, { x: w.x2, y: w.y2 })!,
  };
}

describe('dimension lines', () => {
  it('measures along its points, horizontally or vertically, and as a radius', () => {
    const base = { id: 'd', type: 'dimension' as const, x1: 0, y1: 0, x2: 300, y2: 400, lx: 0, ly: 0 };
    expect(dimLine(base).value).toBeCloseTo(500);
    expect(dimLine({ ...base, angle: 0 }).value).toBeCloseTo(300);
    expect(dimLine({ ...base, angle: 90 }).value).toBeCloseTo(400);
    // A horizontal dimension's line runs level through its line point, under both points.
    const h = dimLine({ ...base, angle: 0, ly: 500 });
    expect(h.a).toEqual({ x: 0, y: 500 });
    expect(h.b.x).toBeCloseTo(300);
    expect(h.b.y).toBeCloseTo(500);
    expect(dimLine({ ...base, radius: true }).value).toBeCloseTo(500);
  });

  it('picks horizontal above or below the points and vertical beside them', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 300, y: 100 };
    expect(linearAngle(a, b, { x: 150, y: 300 })).toBe(0);
    expect(linearAngle(a, b, { x: 150, y: -200 })).toBe(0);
    expect(linearAngle(a, b, { x: 500, y: 50 })).toBe(90);
    expect(linearAngle(a, b, { x: -50, y: 50 })).toBe(90);
    // Between them: along the longer spread.
    expect(linearAngle(a, b, { x: 100, y: 50 })).toBe(0);
  });
});

describe('what a dimension end follows', () => {
  const w = wall('w', 0, 0, 400, 0);

  it('holds a wall by its end, its face corners and points along it', () => {
    for (const p of [
      { x: 0, y: 0 },
      { x: 400, y: 10 },
      { x: -10, y: -10 }, // the outside corner where another wall meets it
      { x: 150, y: -10 }, // on a face, part way along
      { x: 200, y: 0 },
    ]) {
      const tie = tieOn(w, p)!;
      expect(tie).toBeTruthy();
      const at = tiePoint(w, tie)!;
      expect(at.x).toBeCloseTo(p.x);
      expect(at.y).toBeCloseTo(p.y);
    }
    expect(tieOn(w, { x: 0, y: 0 })).toMatchObject({ u: 0, v: 0 });
    expect(tieOn(w, { x: 150, y: -10 })).toMatchObject({ u: 150 / 400 });
    // Off the wall: nothing to hold.
    expect(tieOn(w, { x: 200, y: 40 })).toBeNull();
    expect(tieOn(w, { x: 500, y: 0 })).toBeNull();
  });

  it('prefers a window to the wall it is in, and an item to the floor slab under it', () => {
    const win: PlanElement = { id: 'win', type: 'window', wallId: 'w', x: 200, y: 0, width: 100, angle: 0 };
    expect(tieFor([w, win], { x: 150, y: 10 })?.id).toBe('win');
    const sofa: Furniture = { id: 'f', type: 'furniture', x: 100, y: 100, w: 80, h: 40 };
    const slab: PlanElement = {
      id: 's',
      type: 'slab',
      thickness: 15,
      points: [
        { x: 60, y: 80 },
        { x: 300, y: 80 },
        { x: 300, y: 300 },
        { x: 60, y: 300 },
      ],
    };
    expect(tieFor([slab, sofa], { x: 60, y: 80 })?.id).toBe('f');
    expect(tieFor([slab], { x: 300, y: 300 })).toMatchObject({ id: 's', i: 2 });
    expect(tieFor([slab], { x: 200, y: 200 })).toBeUndefined();
  });

  it('keeps a turned item’s corner as it turns', () => {
    const sofa: Furniture = { id: 'f', type: 'furniture', x: 0, y: 0, w: 100, h: 40 };
    const tie = tieOn(sofa, { x: 50, y: 20 })!;
    const turned = tiePoint({ ...sofa, rotation: 90 }, tie)!;
    expect(turned.x).toBeCloseTo(-20);
    expect(turned.y).toBeCloseTo(50);
  });
});

describe('dimensions follow the plan', () => {
  const w = wall('w', 0, 0, 400, 0);
  const start = plan(w, tiedAcross(w));

  it('follows a wall that is moved, stretched or turned', () => {
    // Moved on its own: the dimension moves with it, line and all.
    let next = syncDimensions(start, moveItems(start, ['w'], 30, 40));
    expect(dimOf(next)).toMatchObject({ x1: 30, y1: 40, x2: 430, y2: 40, lx: 30, ly: 90 });
    // One end dragged further: that end follows, the line stays.
    next = syncDimensions(start, withEl(start, { ...w, x2: 600 }));
    expect(dimOf(next)).toMatchObject({ x1: 0, x2: 600, ly: 50 });
    expect(dimLine(dimOf(next)).value).toBeCloseTo(600);
    // Stretched with Stretch.
    next = syncDimensions(start, stretchItems(start, { minX: 350, minY: -50, maxX: 450, maxY: 20 }, 100, 0));
    expect(dimLine(dimOf(next)).value).toBeCloseTo(500);
    // Turned with the wall: both together keep their ties.
    next = syncDimensions(start, rotateItems(start, ['w', 'd'], { x: 0, y: 0 }, 90));
    expect(dimOf(next).tie1).toBeTruthy();
    expect(dimOf(next).tie2).toBeTruthy();
    expect(dimLine(dimOf(next)).value).toBeCloseTo(400);
  });

  it('keeps measuring through a split and a join', () => {
    const split = syncDimensions(start, breakWall(start, 'w', 0.25));
    const pieces = split.elements.filter((el) => el.type === 'wall');
    expect(pieces).toHaveLength(2);
    // The far end now belongs to the new piece; nothing moved.
    expect(dimOf(split)).toMatchObject({ x1: 0, x2: 400 });
    const far = pieces.find((p) => p.id !== 'w')!;
    expect(dimOf(split).tie2?.id).toBe(far.id);
    // Joined back: still the whole length.
    const joined = joinWalls(split, 'w', far.id, 1);
    expect(joined).toBeTruthy();
    const back = syncDimensions(split, joined!);
    expect(dimOf(back)).toMatchObject({ x1: 0, x2: 400 });
    expect(dimLine(dimOf(back)).value).toBeCloseTo(400);
  });

  it('lets go when its wall is deleted or the dimension is moved off it', () => {
    const gone = syncDimensions(start, { ...start, elements: start.elements.filter((el) => el.id !== 'w') });
    expect(dimOf(gone).tie1).toBeUndefined();
    expect(dimOf(gone)).toMatchObject({ x1: 0, x2: 400 });
    const moved = syncDimensions(start, moveItems(start, ['d'], 0, 200));
    expect(dimOf(moved).tie1).toBeUndefined();
    expect(dimOf(moved).tie2).toBeUndefined();
    // Its line moved by dragging: still following.
    const dragged = syncDimensions(start, withEl(start, { ...dimOf(start), ly: 120 }));
    expect(dimOf(dragged).tie1).toBeTruthy();
  });

  it('copies, mirrors and scales with what it measures', () => {
    const copied = copyItems(start, ['w', 'd'], 0, 300);
    const next = syncDimensions(start, copied.doc);
    const copyDim = next.elements.find((el) => el.type === 'dimension' && el.id !== 'd') as Dimension;
    const copyWall = next.elements.find((el) => el.type === 'wall' && el.id !== 'w')!;
    expect(copyDim.tie1?.id).toBe(copyWall.id);
    // A copy of just the dimension follows nothing.
    expect(remapTies(dimOf(start), new Map()).tie1).toBeUndefined();
    const mirrored = mirrorItems(start, ['w', 'd'], { x: 0, y: 100 }, { x: 10, y: 100 }, false);
    const m = syncDimensions(start, mirrored.doc);
    const mDim = m.elements.find((el) => el.type === 'dimension' && el.id !== 'd') as Dimension;
    expect(mDim.tie1 && mDim.tie2).toBeTruthy();
    expect(dimLine(mDim).value).toBeCloseTo(400);
    const scaled = syncDimensions(start, scaleItems(start, ['w', 'd'], { x: 0, y: 0 }, 2));
    expect(dimLine(dimOf(scaled)).value).toBeCloseTo(800);
  });

  it('a radius follows its curved wall', () => {
    const arc = wall('a', 0, 0, 400, 0, { bow: 100 });
    const r: Dimension = {
      id: 'd',
      type: 'dimension',
      radius: true,
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      lx: 0,
      ly: 0,
      tie2: { id: 'a', u: 0.5, v: 0 },
    };
    const doc = syncDimensions(plan(arc), plan(arc, r));
    // r = c²/8s + s/2 = 400²/800 + 50 = 250.
    expect(dimLine(dimOf(doc)).value).toBeCloseTo(250);
    const flatter = syncDimensions(doc, withEl(doc, { ...arc, bow: 50 }));
    expect(dimLine(dimOf(flatter)).value).toBeCloseTo(425);
    // Straightened: no radius to follow.
    expect(dimOf(syncDimensions(doc, withEl(doc, { ...arc, bow: 0 }))).tie2).toBeUndefined();
  });
});

describe('dimensions in the store', () => {
  it('follow walls through store edits, undo and saving', () => {
    const w = wall('w', 0, 0, 400, 0);
    const store = createPlannerStore(plan(w), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    const dim: Partial<Dimension> = tiedAcross(w);
    delete dim.id;
    const id = s().addDimension(dim as Omit<Dimension, 'id'>);
    s().updateElement({ ...w, x2: 500 });
    expect(dimLine(dimOf(s().doc, id)).value).toBeCloseTo(500);
    s().undo();
    expect(dimLine(dimOf(s().doc, id)).value).toBeCloseTo(400);
    const saved = normaliseDoc(JSON.parse(JSON.stringify(s().doc)));
    expect(dimOf(saved, id)).toEqual(dimOf(s().doc, id));
  });

  it('remembers views for Zoom previous', () => {
    const store = createPlannerStore(plan(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().setViewport({ width: 1000, height: 800 });
    const first = s().view;
    s().zoomToBox({ minX: 0, minY: 0, maxX: 100, maxY: 80 });
    expect(s().view.zoom).toBeCloseTo(9.84, 1);
    expect(s().zoomPrevious()).toBe(true);
    expect(s().view).toEqual(first);
    expect(s().zoomPrevious()).toBe(false);
  });
});
