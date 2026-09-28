import { describe, expect, it } from 'vitest';
import { blockedZones, planHints } from '../lib/planHints';
import { emptyDoc } from '../lib/storage';
import type { Furniture, PlanDoc, PlanElement } from '../types';
import { FURNITURE_CATALOG, isFurnitureKind, type FurnitureKind } from './catalog';
import { toPlan, USE_ZONES, zoneOf, zoneRects } from './useZones';

const FT = 30.48; // plan units per foot
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): PlanElement => ({
  id,
  type: 'wall',
  ...{ x1: x1 * FT, y1: y1 * FT, x2: x2 * FT, y2: y2 * FT },
  thickness: 23,
});
/** A 12' × 12' room of 9" walls; their inside faces are 11.5 units in from the centre lines. */
const ROOM = [wall('t', 0, 0, 12, 0), wall('r', 12, 0, 12, 12), wall('b', 12, 12, 0, 12), wall('l', 0, 12, 0, 0)];
const FACE = 11.5;
const item = (id: string, kind: FurnitureKind, x: number, y: number, rotation = 0): Furniture => ({
  id,
  type: 'furniture',
  kind,
  x,
  y,
  w: FURNITURE_CATALOG[kind].w / 10,
  h: FURNITURE_CATALOG[kind].d / 10,
  ...(rotation ? { rotation } : {}),
});
const docOf = (elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), elements });
const blocked = (doc: PlanDoc, accessible = false) =>
  blockedZones(doc, accessible).map((b) => [b.item.id, b.sides.join(' ')]);

describe('use zones', () => {
  it('are given for library items only, each with a source', () => {
    for (const [kind, z] of Object.entries(USE_ZONES)) {
      expect(isFurnitureKind(kind), kind).toBe(true);
      expect(z!.source.length, kind).toBeGreaterThan(5);
    }
    expect(zoneOf('side-table')).toBeNull();
    expect(zoneOf(undefined)).toBeNull();
  });

  it('uses the wheelchair space only where there is one', () => {
    expect(zoneOf('wc')).toMatchObject({ front: 600, sides: 200 });
    expect(zoneOf('wc', true)).toMatchObject({ front: 720, sides: 870, oneSide: true });
    expect(zoneOf('bed-double', true)).toBe(zoneOf('bed-double'));
  });

  it('lies round the item, in front of it away from the wall side', () => {
    const rects = zoneRects({ front: 600, sides: 600 }, 137, 195);
    expect(rects).toEqual([
      { side: 'front', x: -68.5, y: 97.5, w: 137, h: 60 },
      { side: 'left', x: -128.5, y: -97.5, w: 60, h: 195 },
      { side: 'right', x: 68.5, y: -97.5, w: 60, h: 195 },
    ]);
    // Turned a quarter: the front faces left.
    const p = toPlan({ x: 100, y: 100, rotation: 90 }, { x: 0, y: 100 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(100);
  });
});

describe('blocked use zones', () => {
  const midX = 6 * FT;
  const bedAtTop = (x: number, kind: FurnitureKind = 'bed-double') =>
    item('bed', kind, x, FACE + FURNITURE_CATALOG[kind].d / 20);

  it('leave a bed in the middle of a room alone', () => {
    expect(blocked(docOf([...ROOM, bedAtTop(midX)]))).toEqual([]);
  });

  it('find a double bed pushed against a side wall', () => {
    const doc = docOf([...ROOM, bedAtTop(FACE + 68.5)]);
    expect(blocked(doc)).toEqual([['bed', 'left']]);
    expect(planHints(doc, { units: 'imperial' }).map((h) => h.text)).toContain(
      'Double bed needs more free space at one side (2\' 0").',
    );
  });

  it('let a single bed stand against a wall, but not in a corner with a wardrobe beside it', () => {
    expect(blocked(docOf([...ROOM, bedAtTop(FACE + 45, 'bed-single')]))).toEqual([]);
    const wardrobe = item('w', 'wardrobe', FACE + 90 + 5 + 30, FACE + 150 / 2 + 50, 90);
    expect(blocked(docOf([...ROOM, bedAtTop(FACE + 45, 'bed-single'), wardrobe]))).toContainEqual([
      'bed',
      'left right',
    ]);
  });

  it("don't count a bedside table", () => {
    const bed = bedAtTop(midX);
    const table = item('t', 'side-table', midX + 68.5 + 25, FACE + 22.5);
    expect(blocked(docOf([...ROOM, bed, table]))).toEqual([]);
  });

  it('find a wardrobe facing a wall too close, even turned', () => {
    // Along the left wall, turned so its front faces right, with a wall 2' in front.
    const w = item('w', 'wardrobe', FACE + 30, 6 * FT, 270);
    const near = wall('n', 2.8, 2, 2.8, 10);
    expect(blocked(docOf([...ROOM, w]))).toEqual([]);
    expect(blocked(docOf([...ROOM, w, near]))).toEqual([['w', 'front']]);
  });

  it('ask for more room round a WC with the wheelchair setting', () => {
    // A WC against the back wall, 1' 6" from the side wall to its centre.
    const wc = item('wc', 'wc', FACE + 45.7, FACE + 35);
    const small = [wall('t', 0, 0, 5, 0), wall('r', 5, 0, 5, 5), wall('b', 5, 5, 0, 5), wall('l', 0, 5, 0, 0)];
    expect(blocked(docOf([...small, wc]))).toEqual([]);
    expect(blocked(docOf([...small, wc]), true)).toEqual([['wc', 'front left right']]);
  });
});
