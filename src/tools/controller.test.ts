import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { MM_PER_FOOT } from '../lib/units';
import { createPlannerStore } from '../store/plannerStore';
import type { Furniture, Wall } from '../types';
import { applyMeasure, cancel, hover, press, release, toggleAxisLock, toggleCopy } from './controller';

const FT = MM_PER_FOOT / 10; // plan units per foot
const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  store.getState().setViewport({ width: 1000, height: 800 });
  return store;
};
const walls = (store: ReturnType<typeof setup>) =>
  store.getState().doc.elements.filter((e): e is Wall => e.type === 'wall');
const click = (store: ReturnType<typeof setup>, x: number, y: number) => {
  press(store, { x, y });
  release(store, false);
};

describe('SketchUp-style tools', () => {
  it('draws a chain of walls by clicking and typing lengths, and closes the loop', () => {
    const store = setup();
    store.getState().setTool('wall');
    click(store, 0, 0);
    hover(store, { x: 5 * FT, y: 0 });
    expect(applyMeasure(store, `30'`)).toBe(true);
    hover(store, { x: 30 * FT, y: 5 * FT });
    applyMeasure(store, '20');
    hover(store, { x: 20 * FT, y: 20 * FT });
    applyMeasure(store, '30');
    click(store, 0, 0);
    const ws = walls(store);
    expect(ws).toHaveLength(4);
    expect(ws[1]).toMatchObject({ x1: 30 * FT, y1: 0, x2: 30 * FT });
    expect(ws[1].y2).toBeCloseTo(20 * FT);
    expect(store.getState().draft).toBeNull(); // the loop closed
  });

  it('still draws a wall by dragging', () => {
    const store = setup();
    store.getState().setTool('wall');
    press(store, { x: 0, y: 0 });
    hover(store, { x: 10 * FT, y: 0 });
    release(store, true);
    expect(walls(store)).toHaveLength(1);
    expect(store.getState().draft).toBeNull();
  });

  it('locks to an axis with the arrow keys', () => {
    const store = setup();
    store.getState().setTool('wall');
    click(store, 0, 0);
    toggleAxisLock(store, 'y');
    hover(store, { x: 7 * FT, y: 10 * FT });
    const d = store.getState().draft;
    expect(d?.type === 'wall' && d.x2).toBe(0);
    expect(d?.type === 'wall' && d.y2).toBeCloseTo(10 * FT);
    expect(cancel(store)).toBe(true); // first Esc drops the lock
    expect(store.getState().axisLock).toBeNull();
  });

  it('makes a rectangle of walls and its room from typed width and depth', () => {
    const store = setup();
    store.getState().setTool('rectangle');
    press(store, { x: 0, y: 0 });
    hover(store, { x: 3 * FT, y: 3 * FT });
    expect(applyMeasure(store, `12',10'`)).toBe(true);
    expect(walls(store)).toHaveLength(4);
    expect(store.getState().doc.rooms).toHaveLength(1);
    expect(store.getState().past).toHaveLength(1); // one undo step
  });

  it('moves with Ctrl to copy, then 3x makes an array', () => {
    const store = setup();
    store.getState().setTool('furniture');
    store.getState().addFurniture({ x: 0, y: 0 });
    const item = store.getState().doc.elements[0] as Furniture;
    store.getState().select(item.id);
    store.getState().setTool('move');
    press(store, { x: 0, y: 0 });
    toggleCopy(store);
    hover(store, { x: 5 * FT, y: 0 });
    press(store, { x: 5 * FT, y: 0 });
    let items = store.getState().doc.elements.filter((e) => e.type === 'furniture') as Furniture[];
    expect(items.map((f) => f.x)).toEqual([0, 5 * FT]);
    expect(applyMeasure(store, '3x')).toBe(true);
    items = store.getState().doc.elements.filter((e) => e.type === 'furniture') as Furniture[];
    expect(items.map((f) => Math.round(f.x / FT))).toEqual([0, 5, 10, 15]);
    applyMeasure(store, '/5');
    items = store.getState().doc.elements.filter((e) => e.type === 'furniture') as Furniture[];
    expect(items.map((f) => Math.round(f.x / FT))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('Esc puts a moved item back', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    store.getState().setTool('move');
    press(store, { x: 5 * FT, y: 0 });
    hover(store, { x: 5 * FT, y: 8 * FT });
    expect(walls(store)[0].y1).not.toBe(0);
    cancel(store);
    expect(walls(store)[0]).toMatchObject({ y1: 0, y2: 0 });
    expect(store.getState().past).toHaveLength(1); // only the wall itself
  });

  it('rotates by a typed angle about the clicked centre', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    store.getState().setTool('rotate');
    press(store, { x: 0, y: 0 }); // the wall end
    expect(applyMeasure(store, '90')).toBe(true);
    const w = walls(store)[0];
    expect(w.x2).toBeCloseTo(0);
    expect(w.y2).toBeCloseTo(10 * FT);
  });

  it('explains what to type when the value does not fit', () => {
    const store = setup();
    store.getState().setTool('rectangle');
    expect(applyMeasure(store, `12',10'`)).toBe(false);
    expect(store.getState().warnings[0]).toMatch(/first corner/);
  });
});
