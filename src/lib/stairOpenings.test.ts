import { describe, expect, it } from 'vitest';
import { emptyDoc } from './storage';
import { stairLayout } from './site';
import { floorVoids, slabVoids, stairOpenings } from './voids';
import { polygonArea } from '../rooms';
import { buildModel } from '../three/model';
import { GROUND_LEVEL, type PlanDoc, type Stair } from '../types';

const stair = (shape: Stair['shape'], riseMm = 3200, id = 's'): Stair => {
  const st = { shape, width: 100, riseMm, treadMm: 254, riserMm: 0 };
  const l = stairLayout(st);
  return { id, type: 'stair', x: 300, y: 300, ...st, riserMm: l.riserMm, w: l.w, h: l.h };
};
const twoFloors = (stairs: Stair[]): PlanDoc => ({
  ...emptyDoc(),
  levels: [
    { id: GROUND_LEVEL, name: 'Ground floor' },
    { id: 'f1', name: 'First floor' },
  ],
  elements: stairs,
});

describe('stairwells', () => {
  it('cut the slab over a stair that climbs a floor, in its shape, and close when it goes', () => {
    const straight = stairOpenings(twoFloors([stair('straight')]), GROUND_LEVEL);
    expect(straight).toHaveLength(1);
    expect(straight[0].points).toHaveLength(4);
    // An L stair leaves an L-shaped opening, smaller than the box round it.
    const l = stair('L');
    const [ell] = stairOpenings(twoFloors([l]), GROUND_LEVEL);
    expect(ell.points).toHaveLength(6);
    expect(polygonArea(ell.points)).toBeLessThan(l.w * l.h - 1);
    // A spiral is round.
    const [spiral] = stairOpenings(twoFloors([stair('spiral')]), GROUND_LEVEL);
    expect(spiral.points.length).toBeGreaterThan(8);
    // Steps up to the plinth, and stairs on the top floor, cut nothing.
    expect(stairOpenings(twoFloors([stair('straight', 450)]), GROUND_LEVEL)).toEqual([]);
    expect(stairOpenings(twoFloors([{ ...stair('straight'), levelId: 'f1' }]), 'f1')).toEqual([]);
    // The floor above is open over it; with the stair gone, nothing is.
    expect(floorVoids(twoFloors([stair('straight')]), 'f1')).toHaveLength(1);
    expect(slabVoids(twoFloors([]), GROUND_LEVEL)).toEqual([]);
  });

  it('cut no second hole for a stair in a room already open to the floor above', () => {
    const well = {
      id: 'r',
      name: 'Stair',
      openAbove: true,
      points: [
        { x: -500, y: -500 },
        { x: 1100, y: -500 },
        { x: 1100, y: 1100 },
        { x: -500, y: 1100 },
      ],
    };
    const doc = { ...twoFloors([stair('straight')]), rooms: [well] };
    expect(slabVoids(doc, GROUND_LEVEL).map((r) => r.id)).toEqual(['r']);
  });

  it('leave a hole in a drawn slab over the stair', () => {
    const slab = {
      id: 'sl',
      type: 'slab' as const,
      points: [
        { x: 0, y: 0 },
        { x: 800, y: 0 },
        { x: 800, y: 800 },
        { x: 0, y: 800 },
      ],
      thickness: 15,
    };
    const doc = { ...twoFloors([stair('straight')]), elements: [slab, stair('straight')] };
    const built = buildModel(doc, { wallHeightMm: 3048, showFurniture: false });
    const shown = built.slabs.find((p) => p.id === 'sl')!;
    expect(shown.holes).toHaveLength(1);
  });
});
