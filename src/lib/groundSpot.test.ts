import { describe, expect, it } from 'vitest';
import { groundSpot, settleOnGround } from './groundSpot';
import { GROUND_LEVEL, SITE_LEVEL, type Level, type PlanElement, type Wall } from '../types';

const c = [
  { x: 0, y: 0 },
  { x: 400, y: 0 },
  { x: 400, y: 300 },
  { x: 0, y: 300 },
];
const walls: Wall[] = c.map((p, i) => ({
  id: `w${i}`,
  type: 'wall',
  x1: p.x,
  y1: p.y,
  x2: c[(i + 1) % 4].x,
  y2: c[(i + 1) % 4].y,
  thickness: 23,
}));
const levels: Level[] = [
  { id: SITE_LEVEL, name: 'Ground (site)', site: true },
  { id: GROUND_LEVEL, name: 'Ground floor' },
];
const doc = { elements: walls as PlanElement[], rooms: [], levels };
const chair = (x: number, y: number, levelId?: string): PlanElement => ({
  id: 'f',
  type: 'furniture',
  kind: 'armchair',
  x,
  y,
  w: 60,
  h: 60,
  ...(levelId && { levelId }),
});

describe('floor or lawn on Ground, by where an item stands', () => {
  it('inside the house is the floor, outside it the lawn', () => {
    expect(groundSpot(doc, { x: 200, y: 150 })).toBe(GROUND_LEVEL);
    expect(groundSpot(doc, { x: 600, y: 150 })).toBe(SITE_LEVEL);
    // No lawn level yet, or no house yet: it can't tell.
    expect(groundSpot({ ...doc, levels: [levels[1]] }, { x: 600, y: 150 })).toBeNull();
    expect(groundSpot({ ...doc, elements: [] }, { x: 600, y: 150 })).toBeNull();
  });

  it('moves furniture between them, and leaves walls alone', () => {
    expect(settleOnGround(doc, chair(600, 150)).levelId).toBe(SITE_LEVEL);
    expect(settleOnGround(doc, chair(200, 150, SITE_LEVEL)).levelId).toBeUndefined();
    const outside: PlanElement = { ...walls[0], id: 'x', y1: 800, y2: 800 };
    expect(settleOnGround(doc, outside)).toBe(outside);
    // On another floor nothing changes.
    const upstairs = chair(600, 150, 'first');
    expect(settleOnGround(doc, upstairs)).toBe(upstairs);
  });
});
