import { describe, expect, it } from 'vitest';
import type { Block, Column, Opening, PlanDoc, PlanElement, Slab, Wall } from '../types';
import { edgeNormal, faceOf, pushPull } from './pushPull';
import { archPoints, circlePoints, draftOutline, openingProfileMm } from './shapes';
import { emptyDoc } from './storage';

const ctx = { wallHeightMm: 3048 };
const docWith = (...elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), elements });
const get = <T extends PlanElement>(doc: PlanDoc, id: string) => doc.elements.find((e) => e.id === id) as T;
// A 10 m wall along x, 230 mm thick.
const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 23 };
const square = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('which face was grabbed', () => {
  it('tells a wall’s top, ends and sides apart', () => {
    expect(faceOf(wall, [0, 1, 0], [5, 3, 0])).toEqual({ part: 'top' });
    expect(faceOf(wall, [1, 0, 0], [10, 1, 0])).toEqual({ part: 'end', end: 2 });
    expect(faceOf(wall, [-1, 0, 0], [0, 1, 0])).toEqual({ part: 'end', end: 1 });
    // The wall's left normal (-uy, ux) is +z (plan +y).
    expect(faceOf(wall, [0, 0, 1], [5, 1, 0.1])).toEqual({ part: 'side', sign: 1 });
    expect(faceOf(wall, [0, 0, -1], [5, 1, -0.1])).toEqual({ part: 'side', sign: -1 });
    expect(faceOf(wall, [0, -1, 0], [5, 0, 0])).toBeNull();
  });

  it('finds the slab edge nearest the hit, and flat shapes only have a top', () => {
    const slab: Slab = { id: 's', type: 'slab', points: square, thickness: 15 };
    expect(faceOf(slab, [1, 0, 0], [1, 3, 0.5])).toEqual({ part: 'edge', index: 1 });
    const flat: Block = { id: 'b', type: 'block', points: square, heightMm: 0, shape: 'rect' };
    expect(faceOf(flat, [0, -1, 0], [0.5, 0, 0.5])).toEqual({ part: 'top' });
    const win: Opening = { id: 'n', type: 'window', wallId: 'w', x: 500, y: 0, angle: 0, width: 90, flat: true };
    expect(faceOf(win, [0, 0, 1], [5, 1, 0.12])).toEqual({ part: 'into' });
    expect(faceOf({ ...win, flat: undefined }, [0, 0, 1], [5, 1, 0.12])).toBeNull();
  });
});

describe('push and pull', () => {
  it('raises a wall’s top and lengthens it from either end', () => {
    let doc = pushPull(docWith(wall), 'w', { part: 'top' }, 600, ctx).doc;
    expect(get<Wall>(doc, 'w').heightMm).toBeCloseTo(3648);
    doc = pushPull(doc, 'w', { part: 'end', end: 2 }, 1000, ctx).doc;
    expect(get<Wall>(doc, 'w').x2).toBeCloseTo(1100);
    doc = pushPull(doc, 'w', { part: 'end', end: 1 }, 500, ctx).doc;
    expect(get<Wall>(doc, 'w').x1).toBeCloseTo(-50);
  });

  it('thickens a wall towards the face pulled, keeping the other face and its openings with it', () => {
    const door: Opening = { id: 'd', type: 'door', wallId: 'w', x: 300, y: 0, angle: 0, width: 90 };
    const doc = pushPull(docWith(wall, door), 'w', { part: 'side', sign: 1 }, 230, ctx).doc;
    const w = get<Wall>(doc, 'w');
    expect(w.thickness).toBeCloseTo(46);
    // The far face stays at y = -11.5: the centre line moves 11.5 towards +y.
    expect(w.y1 - w.thickness! / 2).toBeCloseTo(-11.5);
    expect(get<Opening>(doc, 'd').y).toBeCloseTo(11.5);
  });

  it('never makes a wall thinner than an inch or shorter than 10 cm', () => {
    const doc = pushPull(docWith(wall), 'w', { part: 'side', sign: -1 }, -1000, ctx).doc;
    expect(get<Wall>(doc, 'w').thickness).toBeCloseTo(2.5);
    const short = pushPull(docWith(wall), 'w', { part: 'end', end: 2 }, -20000, ctx).doc;
    expect(get<Wall>(short, 'w').x2).toBeCloseTo(10);
  });

  it('gives a column its own height and widens one side', () => {
    const col: Column = { id: 'c', type: 'column', x: 0, y: 0, w: 30, h: 30, shape: 'rect' };
    let doc = pushPull(docWith(col), 'c', { part: 'top' }, -1000, ctx).doc;
    expect(get<Column>(doc, 'c').heightMm).toBeCloseTo(2048);
    doc = pushPull(doc, 'c', { part: 'side', axis: 'x', sign: 1 }, 100, ctx).doc;
    expect(get<Column>(doc, 'c')).toMatchObject({ w: 40, x: 5 });
  });

  it('moves one edge of a slab out, and thickens it downward from its bottom', () => {
    const slab: Slab = { id: 's', type: 'slab', points: square, thickness: 15 };
    let doc = pushPull(docWith(slab), 's', { part: 'edge', index: 1 }, 500, ctx).doc;
    expect(get<Slab>(doc, 's').points.map((p) => p.x)).toEqual([0, 150, 150, 0]);
    doc = pushPull(doc, 's', { part: 'bottom' }, 50, ctx).doc;
    expect(get<Slab>(doc, 's')).toMatchObject({ thickness: 20, elevMm: -50 });
  });

  it('pulls a flat shape up into a block, and pushes it wider round if it is a circle', () => {
    const flat: Block = {
      id: 'b',
      type: 'block',
      points: circlePoints({ x: 0, y: 0 }, 50),
      heightMm: 0,
      shape: 'circle',
    };
    let doc = pushPull(docWith(flat), 'b', { part: 'top' }, 900, ctx).doc;
    expect(get<Block>(doc, 'b').heightMm).toBe(900);
    doc = pushPull(doc, 'b', { part: 'edge', index: 3 }, 100, ctx).doc;
    const r = Math.hypot(get<Block>(doc, 'b').points[0].x, get<Block>(doc, 'b').points[0].y);
    expect(r).toBeCloseTo(60);
    // Pushing a flat shape on the floor down does nothing.
    expect(pushPull(docWith(flat), 'b', { part: 'top' }, -300, ctx).result).toBe('none');
  });

  it('pushes a shape on a slab down through it to make a void', () => {
    const slab: Slab = { id: 's', type: 'slab', points: square, thickness: 15 };
    const hole = square.map((p) => ({ x: 20 + p.x / 5, y: 20 + p.y / 5 }));
    const flat: Block = { id: 'b', type: 'block', points: hole, heightMm: 0, shape: 'rect', slabId: 's' };
    expect(pushPull(docWith(slab, flat), 'b', { part: 'top' }, -50, ctx).result).toBe('none');
    const out = pushPull(docWith(slab, flat), 'b', { part: 'top' }, -100, ctx);
    expect(out.result).toBe('void');
    expect(out.doc.elements.map((e) => e.id)).toEqual(['s']);
    expect(get<Slab>(out.doc, 's').holes).toEqual([hole]);
  });

  it('cuts a shape on a wall right through once pushed half-way in', () => {
    const win: Opening = {
      id: 'n',
      type: 'window',
      wallId: 'w',
      x: 500,
      y: 0,
      angle: 0,
      width: 90,
      flat: true,
      face: 1,
    };
    expect(pushPull(docWith(wall, win), 'n', { part: 'into' }, -100, ctx).result).toBe('none');
    expect(pushPull(docWith(wall, win), 'n', { part: 'into' }, 300, ctx).result).toBe('none');
    const out = pushPull(docWith(wall, win), 'n', { part: 'into' }, -120, ctx);
    expect(out.result).toBe('cut');
    const cut = get<Opening>(out.doc, 'n');
    expect(cut).toMatchObject({ open: true });
    expect(cut.flat).toBeUndefined();
    expect(cut.face).toBeUndefined();
  });
});

describe('shape outlines', () => {
  it('finds the outward side of an outline either way round', () => {
    for (const n of [edgeNormal(square, 1), edgeNormal([...square].reverse(), 1)]) {
      expect(n.x).toBeCloseTo(1);
      expect(n.y).toBeCloseTo(0);
    }
  });

  it('draws rectangles, circles, arches and polygons from clicks', () => {
    expect(draftOutline('rect', [{ x: 0, y: 0 }], { x: 10, y: 5 })).toHaveLength(4);
    expect(draftOutline('circle', [{ x: 0, y: 0 }], { x: 10, y: 0 })).toHaveLength(32);
    expect(draftOutline('circle', [{ x: 0, y: 0 }], { x: 0, y: 0 })).toHaveLength(0);
    expect(
      draftOutline(
        'polygon',
        [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
        { x: 5, y: 5 },
      ),
    ).toHaveLength(3);
    const arch = archPoints(0, 100, 0, 200);
    expect(Math.max(...arch.map((p) => p.y))).toBeCloseTo(200);
    expect(Math.min(...arch.map((p) => p.x))).toBeCloseTo(0);
  });

  it('gives each window shape its outline in millimetres from its centre and sill', () => {
    const base: Opening = { id: 'n', type: 'window', wallId: 'w', x: 0, y: 0, angle: 0, width: 100, heightMm: 1500 };
    const rect = openingProfileMm(base);
    expect(rect).toEqual([
      { x: -500, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 1500 },
      { x: -500, y: 1500 },
    ]);
    const round = openingProfileMm({ ...base, shape: 'circle', heightMm: 1000 });
    expect(Math.max(...round.map((p) => p.y))).toBeCloseTo(1000);
    expect(Math.min(...round.map((p) => p.x))).toBeCloseTo(-500);
    const arch = openingProfileMm({ ...base, shape: 'arch' });
    expect(Math.max(...arch.map((p) => p.y))).toBeCloseTo(1500);
  });
});
