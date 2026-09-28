import { describe, expect, it } from 'vitest';
import { buildModel, DEFAULT_WALL_HEIGHT_MM } from '../three/model';
import type { PlanDoc, PlanElement, Point, Room } from '../types';
import { builtAreaSqFt } from './planCheck';
import { planHints } from './planHints';
import { quantities } from './quantities';
import { emptyDoc, normaliseDoc } from './storage';
import { openRooms, overlaps, voidsOver, within } from './voids';

const FT = 30.48;
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [
  { x: x0 * FT, y: y0 * FT },
  { x: x1 * FT, y: y0 * FT },
  { x: x1 * FT, y: y1 * FT },
  { x: x0 * FT, y: y1 * FT },
];
/** A 20' square of walls on a floor, with a wall down the middle. */
const walls = (levelId?: string): PlanElement[] =>
  [
    [0, 0, 20, 0],
    [20, 0, 20, 20],
    [20, 20, 0, 20],
    [0, 20, 0, 0],
    [10, 0, 10, 20],
  ].map(([x1, y1, x2, y2], i) => ({
    id: `w${i}${levelId ?? ''}`,
    type: 'wall',
    x1: x1 * FT,
    y1: y1 * FT,
    x2: x2 * FT,
    y2: y2 * FT,
    thickness: 0.75 * FT,
    ...(levelId && { levelId }),
  }));

/** A lounge (left half, open to above or not) and a bedroom downstairs; a bedroom and a study upstairs. */
function house(open: boolean): PlanDoc {
  const base = emptyDoc();
  const lounge: Room = { id: 'lounge', name: 'Lounge', points: rect(0, 0, 10, 20), ...(open && { openAbove: true }) };
  return {
    ...base,
    plinthMm: 0,
    levels: [...base.levels, { id: 'first', name: 'First floor' }],
    elements: [
      ...walls(),
      ...walls('first'),
      { id: 'slab', type: 'slab', points: rect(-0.375, -0.375, 20.375, 20.375), thickness: 0.5 * FT },
    ],
    rooms: [
      lounge,
      { id: 'bed', name: 'Bedroom', points: rect(10, 0, 20, 20) },
      { id: 'bed2', name: 'Bedroom 2', points: rect(10, 0, 20, 20), levelId: 'first' },
      { id: 'study', name: 'Study', points: rect(6, 5, 14, 12), levelId: 'first' },
    ],
  };
}

describe('double-height rooms', () => {
  it('leave the floor above open over them, and only when there is a floor above', () => {
    const doc = house(true);
    expect(openRooms(doc, 'ground').map((r) => r.id)).toEqual(['lounge']);
    expect(voidsOver(doc, 'first').map((r) => r.id)).toEqual(['lounge']);
    expect(voidsOver(doc, 'ground')).toEqual([]);
    const top = { ...doc, rooms: doc.rooms.map((r) => ({ ...r, openAbove: true })) };
    expect(openRooms(top, 'first')).toEqual([]);
    // Saved and opened again.
    expect(normaliseDoc(JSON.parse(JSON.stringify(doc))).rooms[0].openAbove).toBe(true);
    expect(normaliseDoc(JSON.parse(JSON.stringify(house(false)))).rooms[0]).not.toHaveProperty('openAbove');
  });

  it('tells outlines inside, overlapping and only touching apart', () => {
    expect(within(rect(0, 0, 10, 20), rect(0, 0, 20, 20))).toBe(true);
    expect(within(rect(6, 5, 14, 12), rect(0, 0, 10, 20))).toBe(false);
    expect(overlaps(rect(6, 5, 14, 12), rect(0, 0, 10, 20))).toBe(true);
    expect(overlaps(rect(10, 0, 20, 20), rect(0, 0, 10, 20))).toBe(false);
    expect(overlaps(rect(0, 0, 10, 20), rect(0, 0, 10, 20))).toBe(true);
  });

  it('take the void out of the slab and the floor area above, and raise the walls beside them', () => {
    const open = quantities(house(true), 3048);
    const shut = quantities(house(false), 3048);
    const voidSqft = 10 * 20;
    expect(shut.floors[0].slabCft - open.floors[0].slabCft).toBeCloseTo(voidSqft * 0.5, 3);
    expect(builtAreaSqFt(house(false), 'first') - builtAreaSqFt(house(true), 'first')).toBeCloseTo(voidSqft, 3);
    // The walls round the lounge carry on up through the slab's depth.
    expect(open.floors[0].brickworkCft).toBeGreaterThan(shut.floors[0].brickworkCft);
  });

  it('are left open in 3D, and a room drawn over one is pointed out', () => {
    const model = buildModel(house(true), { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true });
    expect(model.slabs.find((s) => s.id === 'slab')!.holes).toHaveLength(1);
    expect(model.floors.some((f) => f.id === 'bed2')).toBe(true);
    const hints = planHints(house(true), { units: 'imperial' });
    expect(hints.filter((h) => h.id.startsWith('over-void-')).map((h) => h.ids)).toEqual([['study']]);
    expect(planHints(house(false), { units: 'imperial' }).some((h) => h.id.startsWith('over-void-'))).toBe(false);
  });
});
