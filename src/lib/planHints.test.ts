import { describe, expect, it } from 'vitest';
import { planHints } from './planHints';
import { plotRect } from './site';
import { emptyDoc } from './storage';
import type { Opening, PlanDoc, PlanElement, Room, Stair } from '../types';

const FT = 30.48; // plan units per foot
const ft = (x: number, y: number) => ({ x: x * FT, y: y * FT });
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, levelId?: string): PlanElement => ({
  id,
  type: 'wall',
  ...{ x1: x1 * FT, y1: y1 * FT, x2: x2 * FT, y2: y2 * FT },
  thickness: 23,
  ...(levelId ? { levelId } : {}),
});
const opening = (id: string, type: 'door' | 'window', wallId: string, x: number, y: number, w = 3): Opening => ({
  id,
  type,
  wallId,
  x: x * FT,
  y: y * FT,
  angle: 0,
  width: w * FT,
});
const room = (id: string, name: string, x: number, y: number, w: number, d: number, levelId?: string): Room => ({
  id,
  name,
  points: plotRect(ft(x, y), ft(x + w, y + d)),
  ...(levelId ? { levelId } : {}),
});
const docOf = (elements: PlanElement[], rooms: Room[], levels = emptyDoc().levels): PlanDoc => ({
  ...emptyDoc(),
  levels,
  elements,
  rooms,
});
const hints = (doc: PlanDoc) => planHints(doc, { units: 'imperial' });
const texts = (doc: PlanDoc) => hints(doc).map((h) => h.text);

/**
 * A 30' × 40' house: a lounge on the right (entered from the road at the bottom), bedroom 1 top
 * left off the lounge, and bedroom 2 below it, entered through bedroom 1.
 */
const HOUSE: PlanElement[] = [
  wall('top', 0, 0, 30, 0),
  wall('right', 30, 0, 30, 40),
  wall('bottom', 30, 40, 0, 40),
  wall('left', 0, 40, 0, 0),
  wall('mid', 15, 0, 15, 40),
  wall('split', 0, 20, 15, 20),
  opening('front', 'door', 'bottom', 22, 40),
  opening('d1', 'door', 'mid', 15, 10),
  opening('d2', 'door', 'split', 7, 20),
  opening('w-lounge', 'window', 'right', 30, 20, 16),
  opening('w-bed1', 'window', 'left', 0, 10, 8),
];
const ROOMS = [
  room('lounge', 'Lounge', 15, 0, 15, 40),
  room('bed1', 'Bedroom 1', 0, 0, 15, 20),
  room('bed2', 'Bedroom 2', 0, 20, 15, 20),
];

describe('plan hints', () => {
  it('finds a bedroom reached only through another, and a room with an outside wall but no window', () => {
    const t = texts(docOf(HOUSE, ROOMS));
    expect(t).toContain('Bedroom 2 is only reached through Bedroom 1.');
    expect(t).toContain('Bedroom 2 has an outside wall but no window.');
    // The lounge and bedroom 1 have windows in outside walls, and are reached from the entrance.
    expect(t.filter((x) => /Lounge|Bedroom 1/.test(x) && !/Bedroom 2/.test(x))).toEqual([]);
  });

  it('flags rooms with no door, rooms that cannot be reached, and a house with no entrance', () => {
    const noD2 = HOUSE.filter((el) => el.id !== 'd2');
    expect(texts(docOf(noD2, ROOMS))).toContain('Bedroom 2 has no door.');
    const noFront = HOUSE.filter((el) => el.id !== 'front');
    const t = texts(docOf(noFront, ROOMS));
    expect(t).toContain('Ground floor: no door leads outside (an entrance).');
    expect(t.some((x) => /can't be reached/.test(x))).toBe(false);
  });

  it('flags an inner room with no outside wall, and windows under a tenth of the floor', () => {
    // A store-like bedroom boxed in the middle of a bigger hall.
    const els: PlanElement[] = [
      wall('a', 0, 0, 40, 0),
      wall('b', 40, 0, 40, 40),
      wall('c', 40, 40, 0, 40),
      wall('d', 0, 40, 0, 0),
      wall('i1', 10, 10, 30, 10),
      wall('i2', 30, 10, 30, 30),
      wall('i3', 30, 30, 10, 30),
      wall('i4', 10, 30, 10, 10),
      opening('door', 'door', 'c', 20, 40),
      opening('inner', 'door', 'i1', 20, 10),
      opening('tiny', 'window', 'a', 5, 0, 2),
    ];
    const rooms = [room('hall', 'Hall', 0, 0, 40, 40), room('bed', 'Bedroom', 10, 10, 20, 20)];
    const t = texts(docOf(els, rooms));
    expect(t).toContain('Bedroom has no outside wall, so no window or fresh air.');
    const lounge = texts(docOf(els, [room('hall', 'Lounge', 0, 0, 40, 40), rooms[1]]));
    expect(lounge.some((x) => /^Lounge's windows are about 8 sq ft, less than a tenth/.test(x))).toBe(true);
  });

  it('gives good-practice sizes by name, unless the bylaws already flag the room', () => {
    const doc = docOf(HOUSE, [...ROOMS, room('k', 'Kitchen', 40, 0, 6, 8), room('cp', 'Car porch', 40, 20, 9, 16)]);
    const t = texts(doc);
    expect(t).toContain(`Kitchen is small for a kitchen (70 sq ft, 7' 0" wide): about 48 sq ft, 6' 0" wide.`);
    expect(t).toContain(`Car porch is small for a car porch (one car) (9' 0" × 18' 0"): about 144 sq ft, 9' 0" wide.`);
    expect(t.some((x) => /Bedroom 1 is small/.test(x))).toBe(false); // 15' × 20' is plenty
    const skipped = planHints(doc, { units: 'imperial', skipSizes: new Set(['k']) }).map((h) => h.text);
    expect(skipped.some((x) => /^Kitchen is small/.test(x))).toBe(false);
  });

  it('wants the kitchen next to the dining room or lounge, and the prayer room away from baths', () => {
    const els: PlanElement[] = [...HOUSE, wall('pw', 30, 30, 40, 30), opening('pd', 'door', 'pw', 35, 30)];
    const far = docOf(els, [...ROOMS, room('k', 'Kitchen', 60, 0, 10, 10)]);
    expect(texts(far)).toContain(`Kitchen isn't next to the dining room or lounge.`);
    // Next to the lounge, across the right wall.
    const near = docOf(els, [...ROOMS, room('k', 'Kitchen', 30, 0, 10, 10)]);
    expect(texts(near).some((x) => /next to the dining/.test(x))).toBe(false);
    const prayer = docOf(els, [...ROOMS, room('p', 'Prayer room', 30, 20, 10, 10), room('b', 'Bath', 30, 30, 10, 10)]);
    const h = hints(prayer).find((x) => x.kind === 'layout' && /Prayer/.test(x.text));
    expect(h?.text).toBe('Prayer room opens onto Bath.');
    expect(h?.ids).toEqual(['p', 'b', 'pd']);
  });

  it('starts an upper floor from its stairs, and says when no stair reaches it', () => {
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'first', name: 'First floor' },
    ];
    const up: PlanElement[] = [
      wall('t', 0, 0, 30, 0, 'first'),
      wall('r', 30, 0, 30, 40, 'first'),
      wall('b', 30, 40, 0, 40, 'first'),
      wall('l', 0, 40, 0, 0, 'first'),
      wall('m', 15, 0, 15, 40, 'first'),
      { ...opening('ud', 'door', 'm', 15, 20), levelId: 'first' },
    ];
    const upRooms = [
      room('fl', 'Family lounge', 15, 0, 15, 40, 'first'),
      room('fb', 'Bedroom 3', 0, 0, 15, 40, 'first'),
    ];
    const none = texts(docOf(up, upRooms, levels));
    expect(none).toContain('No stair reaches the First floor.');
    const stair: Stair = {
      id: 's',
      type: 'stair',
      x: 22 * FT,
      y: 30 * FT,
      shape: 'straight',
      width: 3 * FT,
      riseMm: 3200,
      riserMm: 160,
      treadMm: 280,
      w: 3 * FT,
      h: 10 * FT,
    };
    const withStair = texts(docOf([...up, stair], upRooms, levels));
    expect(withStair.some((x) => /stair|reached/.test(x))).toBe(false);
  });

  it('treats "Guest bath" and "Master bath" as baths, and names the floor for upper-floor hints', () => {
    const els: PlanElement[] = [...HOUSE, wall('bw', 30, 30, 40, 30), opening('bd', 'door', 'right', 30, 35)];
    const t = texts(docOf(els, [...ROOMS, room('gb', 'Guest bath', 30, 30, 10, 10)]));
    expect(t.some((x) => /^Guest bath/.test(x) && !/small for a bathroom/.test(x))).toBe(false);
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'first', name: 'First floor' },
    ];
    const up = texts(docOf([wall('u', 0, 0, 10, 0, 'first')], [room('x', 'Bedroom 9', 0, 0, 12, 12, 'first')], levels));
    expect(up).toContain('First floor: Bedroom 9 has no door.');
  });

  it('stays quick with absurdly long walls', () => {
    const huge = [wall('h', 0, 0, 3e6, 0), ...HOUSE];
    const start = performance.now();
    hints(docOf(huge, ROOMS));
    expect(performance.now() - start).toBeLessThan(2000);
  });
});
