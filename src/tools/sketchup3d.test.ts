import { afterEach, describe, expect, it } from 'vitest';
import { connectedTo } from '../components/usePlanInput';
import { protractor } from '../lib/protractor';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { MM_PER_FOOT } from '../lib/units';
import { createPlannerStore } from '../store/plannerStore';
import { levelBaseM } from '../three/model';
import { resetPickers, setPicker, type FaceHit, type Picker3D } from '../three/picker';
import type { Wall } from '../types';
import { applyMeasure, hover, measureReadout, press, release, toggleHeightLock } from './controller';
import { resetLastPush } from './shapeTools';

const FT = MM_PER_FOOT / 10;
const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  store.getState().setViewport({ width: 1000, height: 800 });
  return store;
};
type Store = ReturnType<typeof setup>;
const walls = (store: Store) => store.getState().doc.elements.filter((e): e is Wall => e.type === 'wall');

/** A stand-in for the 3D view: what is under the pointer and how far along a line it points. */
function fakePicker(over: Partial<Picker3D> = {}): Picker3D {
  const picker: Picker3D = {
    is3d: true,
    highlight: () => {},
    faceAt: () => null,
    onPlane: () => null,
    alongLine: () => null,
    ...over,
  };
  setPicker(picker);
  return picker;
}

afterEach(() => {
  resetPickers();
  resetLastPush();
});

describe('3D tape measure', () => {
  it('measures from a point up on an item to the floor, with the height difference', () => {
    const store = setup();
    store.getState().setView3d(true);
    store.getState().setTool('tape');
    const base = levelBaseM(store.getState().doc, 'ground', store.getState().wallHeightMm);
    let face: FaceHit | null = { id: 'x', point: [0, base + 1.2192, 0], normal: [0, 1, 0] };
    fakePicker({ faceAt: () => face });
    press(store, { x: 0, y: 0 });
    face = null;
    hover(store, { x: 0, y: 0 });
    press(store, { x: 0, y: 0 });
    const d = store.getState().draft;
    expect(d?.type === 'tape' && [d.za, d.zb]).toEqual([1219, 0]);
    expect(measureReadout(store.getState()).value).toContain('height −');
  });

  it('measures straight up with the up arrow (blue axis)', () => {
    const store = setup();
    store.getState().setView3d(true);
    store.getState().setTool('tape');
    fakePicker({ alongLine: () => 2.4384 });
    press(store, { x: 3 * FT, y: 0 });
    expect(toggleHeightLock(store)).toBe(true);
    hover(store, { x: 9 * FT, y: 5 * FT });
    const d = store.getState().draft;
    expect(d?.type === 'tape' && d.b).toEqual({ x: 3 * FT, y: 0 });
    expect(d?.type === 'tape' && d.zb).toBeCloseTo(2438.4);
    expect(measureReadout(store.getState()).value).toBe(`8' 0" (height +8' 0")`);
  });
});

describe('Push/Pull, SketchUp habits', () => {
  const pushSetup = () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    const wall = walls(store)[0];
    store.getState().setTool('pushpull');
    const state = { along: 0 as number | null, extents: [] as number[] };
    fakePicker({
      faceAt: () => ({ id: wall.id, point: [1, 3.048, 0], normal: [0, 1, 0] }),
      alongLine: () => state.along,
      extentsAlong: () => state.extents,
    });
    return { store, state };
  };

  it('a double-click pushes as far as the last push, and a typed distance changes the last push', () => {
    const { store, state } = pushSetup();
    press(store, { x: 0, y: 0 });
    state.along = 0.6;
    hover(store, { x: 0, y: 0 });
    release(store, true);
    expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 609.6);
    // Double-click the top again: the same push again.
    state.along = 0;
    press(store, { x: 0, y: 0 }, { clicks: 1 });
    release(store, false);
    press(store, { x: 0, y: 0 }, { clicks: 2 });
    expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 2 * 609.6);
    // Typed straight after: that push becomes 1' instead, in one undo step.
    expect(applyMeasure(store, `1'`)).toBe(true);
    expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 609.6 + 304.8);
    store.getState().undo();
    expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 609.6);
  });

  it('snaps the face to the top of another item nearby', () => {
    const { store, state } = pushSetup();
    // Another item's top 0.5 m above this one; pixels here are ~1 cm, so 8 of them reach it from 0.46 m.
    state.extents = [3.048 + 0.5];
    press(store, { x: 0, y: 0 });
    const alongAt = (y: number) => (y === 0 ? 0.46 : 0.46 - 0.01 * 8);
    let calls = 0;
    state.along = 0.46;
    fakePicker({
      faceAt: () => ({ id: walls(store)[0].id, point: [1, 3.048, 0], normal: [0, 1, 0] }),
      alongLine: () => (calls++ % 2 === 0 ? alongAt(0) : alongAt(8)),
      extentsAlong: () => state.extents,
    });
    hover(store, { x: 0, y: 0 });
    // 500 mm exactly, rather than the 18" (457 mm) step the pointer is at.
    expect(store.getState().draft).toMatchObject({ type: 'push', dist: 500 });
  });
});

describe('selecting walls SketchUp style', () => {
  it('takes a wall with its openings, then everything joined to it', () => {
    const store = setup();
    const s = store.getState();
    s.addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    s.addWall({ x: 10 * FT, y: 0 }, { x: 10 * FT, y: 10 * FT });
    s.addWall({ x: 30 * FT, y: 0 }, { x: 40 * FT, y: 0 });
    const [a, b, c] = walls(store);
    store.getState().placeOpening('door', { x: 5 * FT, y: 0 });
    const door = store.getState().doc.elements.find((e) => e.type === 'door')!;
    expect(connectedTo(store.getState(), a.id, false).sort()).toEqual([a.id, door.id].sort());
    const all = connectedTo(store.getState(), a.id, true);
    expect(all).toContain(b.id);
    expect(all).not.toContain(c.id);
  });
});

describe('Rotate protractor', () => {
  it('lines its ticks up with the start and sweeps the angle turned', () => {
    const p = protractor({ x: 0, y: 0 }, 10, { x: 0, y: 5 }, 90);
    expect(p.ticks).toHaveLength(24);
    expect(p.ticks[0][1].x).toBeCloseTo(0);
    expect(p.ticks[0][1].y).toBeCloseTo(10);
    const end = p.arc[p.arc.length - 1];
    expect(end.x).toBeCloseTo(-5.5);
    expect(end.y).toBeCloseTo(0);
    expect(protractor({ x: 0, y: 0 }, 10, undefined, 0).arc).toEqual([]);
  });
});
