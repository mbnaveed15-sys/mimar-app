import { describe, expect, it } from 'vitest';
import type { PlanDoc, PlanElement } from '../types';
import { estimate, estimateCsv, readRates, STARTER_RATES, STARTER_RATIOS, withRate } from './estimate';
import { quantities } from './quantities';
import { emptyDoc } from './storage';

const FT = 30.48; // plan units per foot
// A 10' square room (centre lines) of 9" walls, 10' high, with no plinth.
const corners = [
  [0, 0],
  [10, 0],
  [10, 10],
  [0, 10],
];
const walls: PlanElement[] = corners.map(([x, y], i) => {
  const [x2, y2] = corners[(i + 1) % 4];
  return { id: `w${i}`, type: 'wall', x1: x * FT, y1: y * FT, x2: x2 * FT, y2: y2 * FT, thickness: 0.75 * FT };
});
const room = {
  id: 'r',
  name: 'Room',
  material: 'mat_marble',
  points: corners.map(([x, y]) => ({ x: x * FT, y: y * FT })),
};
const doc = (...extra: PlanElement[]): PlanDoc => ({
  ...emptyDoc(),
  plinthMm: 0,
  elements: [...walls, ...extra],
  rooms: [room],
});
const H = 3048; // 10 ft

describe('quantities', () => {
  it('measures brickwork on centre lines, less doors, and the faces inside and out', () => {
    const door: PlanElement = { id: 'd', type: 'door', wallId: 'w0', x: 5 * FT, y: 0, angle: 0, width: 3 * FT };
    const q = quantities(doc(door), H).total;
    // 4 walls × 10' × 0.75' × 10', less a 3' × 7' door through 0.75'.
    expect(q.brickworkCft).toBeCloseTo(300 - 3 * 7 * 0.75, 1);
    expect(q.insideFaceSqft).toBeCloseTo(400 - 21, 1);
    expect(q.outsideFaceSqft).toBeCloseTo(400 - 21, 1);
    expect(q.doors).toBe(1);
    expect(q.flooring.marble).toBeCloseTo(100, 1);
    expect(q.foundationRft).toBeCloseTo(40, 1);
  });

  it('measures slabs less their voids, beams, round and square columns, and adds the plinth', () => {
    const slab: PlanElement = {
      id: 's',
      type: 'slab',
      thickness: 0.5 * FT,
      points: room.points,
      holes: [
        [
          { x: 0, y: 0 },
          { x: 2 * FT, y: 0 },
          { x: 2 * FT, y: 2 * FT },
          { x: 0, y: 2 * FT },
        ],
      ],
    };
    const beam: PlanElement = { id: 'b', type: 'beam', x1: 0, y1: 0, x2: 10 * FT, y2: 0, width: 0.75 * FT, depth: FT };
    const col: PlanElement = { id: 'c', type: 'column', x: 0, y: 0, w: FT, h: FT, shape: 'rect', heightMm: H };
    const q = quantities({ ...doc(slab, beam, col), plinthMm: 609.6 }, H).total;
    expect(q.slabCft).toBeCloseTo((100 - 4) * 0.5, 1);
    expect(q.beamCft).toBeCloseTo(7.5, 1);
    expect(q.columnCft).toBeCloseTo(10, 1);
    // A 2' plinth under the ground floor's walls.
    expect(q.brickworkCft).toBeCloseTo(4 * 10 * 0.75 * 12, 1);
  });
});

describe('estimate', () => {
  it('prices each item at its rate, adds steel for the concrete, and lists the materials', () => {
    const beam: PlanElement = { id: 'b', type: 'beam', x1: 0, y1: 0, x2: 10 * FT, y2: 0, width: 0.75 * FT, depth: FT };
    const q = quantities(doc(beam), H).total;
    const est = estimate(q, STARTER_RATES, STARTER_RATIOS);
    const line = (id: string) => est.lines.find((l) => l.id === id)!;
    expect(line('brickwork').amount).toBeCloseTo(300 * STARTER_RATES.brickwork, 0);
    // No slab drawn: one is estimated over the covered area, with its steel.
    expect(q.slabEstimateCft).toBeCloseTo(q.coveredSqft * 0.5, 2);
    expect(line('steel').qty).toBeCloseTo(
      7.5 * STARTER_RATIOS.steelBeam + q.slabEstimateCft * STARTER_RATIOS.steelSlab,
      2,
    );
    expect(line('electrical').qty).toBeCloseTo(q.coveredSqft, 2);
    expect(line('floor-marble').rate).toBe(STARTER_RATES.flooring.marble);
    expect(est.total).toBeCloseTo(
      est.lines.reduce((s, l) => s + l.amount, 0),
      2,
    );
    expect(est.materials.bricks).toBeCloseTo(300 * 13.5, 0);
    expect(est.materials.cementBags).toBeGreaterThan(0);
    // A changed rate changes the amount.
    const dearer = estimate(q, withRate(STARTER_RATES, 'flooring.marble', 1000), STARTER_RATIOS);
    expect(dearer.lines.find((l) => l.id === 'floor-marble')!.amount).toBeCloseTo(100 * 1000, 0);
    const csv = estimateCsv('House', est, { areaSqft: 110, grade: 'standard', rate: 7200 });
    expect(csv).toContain('Brickwork in 1:6 (walls and plinth),300,cft');
    expect(csv.split('\r\n')[3]).toBe('Item,Quantity,Unit,Rate (Rs),Amount (Rs),Note');
  });

  it('reads stored rates, keeping the starter value for anything missing or wrong', () => {
    const r = readRates({ brickwork: 500, rcc: -3, flooring: { tiles: 400, wood: 'x' } });
    expect(r.brickwork).toBe(500);
    expect(r.rcc).toBe(STARTER_RATES.rcc);
    expect(r.flooring.tiles).toBe(400);
    expect(r.flooring.wood).toBe(STARTER_RATES.flooring.wood);
    expect(r.area).toEqual(STARTER_RATES.area);
  });
});
