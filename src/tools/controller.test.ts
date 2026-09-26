import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { MM_PER_FOOT } from '../lib/units';
import { createPlannerStore } from '../store/plannerStore';
import { resetPickers, setPicker } from '../three/picker';
import type { Block, Furniture, Wall } from '../types';
import {
  applyMeasure,
  cancel,
  hover,
  measureReadout,
  pasteToPlace,
  press,
  release,
  toggleAxisLock,
  toggleCopy,
  toggleHeightLock,
} from './controller';

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

  it('moves up and down the blue axis in 3D, by the pointer or a typed height', () => {
    const store = setup();
    store.getState().addFurniture({ x: 0, y: 0 });
    const item = store.getState().doc.elements[0] as Furniture;
    store.getState().select(item.id);
    store.getState().setTool('move');
    expect(toggleHeightLock(store)).toBe(false); // nothing is moving yet
    store.getState().setView3d(true);
    press(store, { x: 0, y: 0 });
    hover(store, { x: 0, y: 0 }, false, 400);
    expect(toggleHeightLock(store)).toBe(true);
    expect(store.getState().axisLock).toBe('z');
    // Across the floor is ignored; up the screen raises it.
    hover(store, { x: 9 * FT, y: 9 * FT }, false, 300);
    let moved = store.getState().doc.elements[0] as Furniture;
    expect(moved.x).toBe(0);
    expect(moved.elevMm).toBeGreaterThan(0);
    expect(measureReadout(store.getState()).label).toBe('Height');
    expect(applyMeasure(store, `2'`)).toBe(true);
    moved = store.getState().doc.elements[0] as Furniture;
    expect(moved.elevMm).toBeCloseTo(609.6);
    expect(store.getState().draft).toBeNull();
    expect(store.getState().axisLock).toBeNull();
    store.getState().undo();
    expect((store.getState().doc.elements[0] as Furniture).elevMm).toBeUndefined();
  });

  it('does not lock to the blue axis in 2D', () => {
    const store = setup();
    store.getState().addFurniture({ x: 0, y: 0 });
    store.getState().select(store.getState().doc.elements[0].id);
    store.getState().setTool('move');
    press(store, { x: 0, y: 0 });
    expect(toggleHeightLock(store)).toBe(false);
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
    // Counter-clockwise, as in AutoCAD: from pointing right to pointing up the screen (y is down).
    const w = walls(store)[0];
    expect(w.x2).toBeCloseTo(0);
    expect(w.y2).toBeCloseTo(-10 * FT);
  });

  it('explains what to type when the value does not fit', () => {
    const store = setup();
    store.getState().setTool('rectangle');
    expect(applyMeasure(store, `12',10'`)).toBe(false);
    expect(store.getState().warnings[0]).toMatch(/first corner/);
  });

  it('draws flat shapes on the floor: a rectangle by two clicks, a polygon closed on its first corner', () => {
    const store = setup();
    store.getState().setTool('shape');
    click(store, 0, 0);
    click(store, 4 * FT, 3 * FT);
    const blocks = () => store.getState().doc.elements.filter((e): e is Block => e.type === 'block');
    expect(blocks()).toHaveLength(1);
    expect(blocks()[0]).toMatchObject({ heightMm: 0, shape: 'rect' });
    store.getState().setShapeKind('polygon');
    for (const [x, y] of [
      [10, 0],
      [14, 0],
      [12, 3],
      [10, 0],
    ])
      click(store, x * FT, y * FT);
    expect(blocks()).toHaveLength(2);
    expect(blocks()[1].points).toHaveLength(3);
    // A circle by its radius, typed.
    store.getState().setShapeKind('circle');
    click(store, 20 * FT, 0);
    expect(applyMeasure(store, `2'`)).toBe(true);
    expect(blocks()[2]).toMatchObject({ shape: 'circle' });
    expect(blocks()[2].points).toHaveLength(32);
  });

  it('pushes and pulls faces through the 3D view, and only there', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    const wall = walls(store)[0];
    store.getState().setTool('pushpull');
    click(store, 0, 0);
    expect(store.getState().warnings.join(' ')).toContain('3D view');
    // A stand-in for the 3D view: the pointer is on the wall's top, and has moved 0.6 m up from it.
    let along = 0;
    setPicker({
      is3d: true,
      highlight: () => {},
      faceAt: () => ({ id: wall.id, point: [1, 3.048, 0], normal: [0, 1, 0] }),
      onPlane: () => null,
      alongLine: () => along,
    });
    try {
      press(store, { x: 0, y: 0 });
      along = 0.6;
      hover(store, { x: 0, y: 0 });
      expect(measureReadout(store.getState()).value).toBe(`2' 0"`); // 600 mm, in whole inches
      release(store, true);
      expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 609.6);
      store.getState().undo();
      expect(walls(store)[0].heightMm).toBeUndefined();
      // Or a click, then a typed distance.
      press(store, { x: 0, y: 0 });
      release(store, false);
      expect(applyMeasure(store, `1'`)).toBe(true);
      expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 304.8);
      // Esc puts it back.
      press(store, { x: 0, y: 0 });
      along = 1;
      hover(store, { x: 0, y: 0 });
      cancel(store);
      expect(walls(store)[0].heightMm).toBeCloseTo(3048 + 304.8);
    } finally {
      resetPickers();
    }
  });

  it('draws a wall to @x,y and to length<angle (y up, counter-clockwise), as in AutoCAD', () => {
    const store = setup();
    store.getState().setTool('wall');
    click(store, 0, 0);
    expect(applyMeasure(store, `@3',4'`)).toBe(true);
    expect(walls(store)[0].x2).toBeCloseTo(3 * FT);
    expect(walls(store)[0].y2).toBeCloseTo(-4 * FT);
    expect(applyMeasure(store, `10'<0`)).toBe(true);
    expect(walls(store)[1].x2).toBeCloseTo(13 * FT);
    expect(walls(store)[1].y2).toBeCloseTo(-4 * FT);
  });

  it('Ctrl+Z in a chain of walls takes back the last one and carries on from where it started', () => {
    const store = setup();
    store.getState().setTool('wall');
    click(store, 0, 0);
    click(store, 10 * FT, 0);
    click(store, 10 * FT, 10 * FT);
    expect(walls(store)).toHaveLength(2);
    store.getState().undo();
    expect(walls(store)).toHaveLength(1);
    const d = store.getState().draft;
    expect(d?.type === 'wall' && d.chain).toBe(true);
    expect(d?.type === 'wall' && [d.x1, d.y1]).toEqual([10 * FT, 0]);
  });

  it('Move keeps the selection when the base point is on another item', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    store.getState().addFurniture({ x: 5 * FT, y: 5 * FT });
    const bed = store.getState().doc.elements.find((e) => e.type === 'furniture')!;
    store.getState().select(bed.id);
    store.getState().setTool('move');
    press(store, { x: 0, y: 0 }); // on the wall's end
    const d = store.getState().draft;
    expect(d?.type === 'move' && d.ids).toEqual([bed.id]);
  });
});

describe('paste, AutoCAD style', () => {
  it('hangs the copies on the pointer until a click puts them down, as one undo step', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    store.getState().select(walls(store)[0].id);
    store.getState().copySelected();
    pasteToPlace(store);
    expect(store.getState().tool).toBe('move');
    expect(store.getState().draft).toMatchObject({ type: 'move', pasted: true });
    hover(store, { x: 20 * FT, y: 20 * FT });
    click(store, 20 * FT, 20 * FT);
    expect(store.getState().draft).toBeNull();
    const copy = walls(store)[1];
    expect([copy.x1, copy.y1]).toEqual([20 * FT, 20 * FT]);
    store.getState().undo();
    expect(walls(store)).toHaveLength(1);
  });

  it('Esc takes the paste back', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 10 * FT, y: 0 });
    store.getState().select(walls(store)[0].id);
    store.getState().copySelected();
    const history = store.getState().past.length;
    pasteToPlace(store);
    hover(store, { x: 20 * FT, y: 20 * FT });
    expect(walls(store)).toHaveLength(2);
    cancel(store);
    expect(walls(store)).toHaveLength(1);
    expect(store.getState().past.length).toBe(history);
  });
});
