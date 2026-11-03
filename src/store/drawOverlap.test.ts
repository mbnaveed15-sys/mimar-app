import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import { createPlannerStore } from './plannerStore';
import { polygonArea } from '../rooms';

const ft = (f: number) => (f * 304.8) / 10;
const P = (x: number, y: number) => ({ x: ft(x), y: ft(y) });

function setup() {
  const store = createPlannerStore(emptyDoc());
  return () => store.getState();
}
const walls = (s: ReturnType<ReturnType<typeof setup>>) => s.doc.elements.filter((e) => e.type === 'wall');
const areas = (s: ReturnType<ReturnType<typeof setup>>) =>
  s.doc.rooms.map((r) => Math.round(polygonArea(r.points) / (ft(1) * ft(1)))).sort((a, b) => a - b);

describe('drawing along and over what is there (1.51.10)', () => {
  it('a rectangle beside a room shares its wall instead of doubling it', () => {
    const s = setup();
    s().addRectangle(P(0, 0), P(12, 10));
    s().addRectangle(P(12, 0), P(24, 10));
    expect(walls(s())).toHaveLength(7);
    expect(areas(s())).toEqual([120, 120]);
  });

  it('a wall along an existing one adds only the new part, or nothing', () => {
    const s = setup();
    s().addWall(P(0, 0), P(12, 0));
    s().addWall(P(0, 0), P(12, 0));
    expect(walls(s())).toHaveLength(1);
    s().addWall(P(6, 0), P(20, 0));
    expect(walls(s())).toHaveLength(2);
    const added = walls(s())[1] as { x1: number; x2: number };
    expect([added.x1, added.x2].map((x) => Math.round(x / ft(1)))).toEqual([12, 20]);
  });

  it('a rectangle half over a room splits it, and one inside a room gets its own room', () => {
    const s = setup();
    s().addRectangle(P(0, 0), P(20, 16));
    s().addRectangle(P(2, 2), P(8, 8));
    expect(areas(s())).toContain(36);
    s().addRectangle(P(10, 8), P(26, 20));
    // The new rectangle's own part (16×12 less the overlap 10×8) and the overlap are rooms; Room 1 is cut.
    expect(areas(s())).toEqual(expect.arrayContaining([80, 112]));
    const total = areas(s()).reduce((a, b) => a + b, 0);
    expect(total).toBe(320 + 112 + 36);
  });
});

describe('stairs follow floor heights (1.51.10)', () => {
  it('a stair that climbed a floor still climbs it after the walls or the floor get taller', () => {
    const s = setup();
    s().addRectangle(P(0, 0), P(20, 30));
    s().addStair(P(10, 15));
    const rise = () => (s().doc.elements.find((e) => e.type === 'stair') as { riseMm: number }).riseMm;
    const first = rise();
    s().setWallHeightMm(s().wallHeightMm + 304.8);
    expect(rise()).toBeCloseTo(first + 304.8, 0);
    s().setLevelHeight(s().activeLevel, 3600);
    expect(rise()).toBeGreaterThan(3600);
  });
});
