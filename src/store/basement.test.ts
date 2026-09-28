import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { buildModel, levelBaseM, SLAB_MM } from '../three/model';
import { newId } from '../lib/ids';
import { basementOutline, buildLayout, layoutSite } from '../lib/layoutBuild';
import { DEFAULT_PROGRAM, generateLayouts } from '../lib/layoutGen';
import { estimate, STARTER_RATES, STARTER_RATIOS } from '../lib/estimate';
import { planCheck } from '../lib/planCheck';
import { quantities } from '../lib/quantities';
import { plotRect } from '../lib/site';
import { GROUND_LEVEL, type Plot, type Stair, type Wall } from '../types';
import { createPlannerStore } from './plannerStore';

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  return { store, s: () => store.getState() };
};

describe('a basement', () => {
  it('goes below the ground floor, at its own height, and floors above keep their names', () => {
    const { s } = setup();
    s().addBasement();
    const b = s().doc.levels[0];
    expect(b).toMatchObject({ name: 'Basement', basement: true });
    expect(s().activeLevel).toBe(b.id);
    // Only one.
    s().addBasement();
    expect(s().doc.levels.filter((l) => l.basement)).toHaveLength(1);
    s().addLevel();
    expect(s().doc.levels.map((l) => l.name)).toEqual(['Basement', 'Ground floor', 'First floor']);

    const wall = 3048;
    const plinth = s().doc.plinthMm / 1000;
    expect(levelBaseM(s().doc, GROUND_LEVEL, wall)).toBeCloseTo(plinth);
    expect(levelBaseM(s().doc, s().doc.levels[2].id, wall)).toBeCloseTo(plinth + (wall + SLAB_MM) / 1000);
    // 10' clear, under a 6" slab: its floor is that far below the ground floor.
    expect(levelBaseM(s().doc, b.id, wall)).toBeCloseTo(plinth - (SLAB_MM + 3048) / 1000);
    s().setBasementHeight(3658);
    expect(levelBaseM(s().doc, b.id, wall)).toBeCloseTo(plinth - (SLAB_MM + 3658) / 1000);
  });

  it('builds its walls to its own height, below the ground, and its stair climbs to the ground floor', () => {
    const { s } = setup();
    s().addBasement();
    s().setBasementHeight(2743); // 9'
    s().addWall({ x: 0, y: 0 }, { x: 500, y: 0 });
    s().addStair({ x: 200, y: 200 });
    const stair = s().doc.elements.find((el): el is Stair => el.type === 'stair')!;
    expect(stair.riseMm).toBeCloseTo(2743 + SLAB_MM);
    const model = buildModel(s().doc, { wallHeightMm: 3048, showFurniture: true });
    const wall = model.solids.find((p) => p.role === 'wall')!;
    expect(wall.y0).toBeLessThan(0);
    expect(wall.y0 + wall.h).toBeCloseTo(s().doc.plinthMm / 1000 - SLAB_MM / 1000);
  });

  it('keeps the ground floor first above it when saved and opened, dropping extra basements', () => {
    const doc = normaliseDoc({
      ...emptyDoc(),
      levels: [
        { id: 'ground', name: 'Ground floor' },
        { id: 'b', name: 'Basement', basement: true, heightMm: 3000 },
        { id: 'f', name: 'First floor' },
        { id: 'c', name: 'Cellar', basement: true },
      ],
    });
    expect(doc.levels.map((l) => l.id)).toEqual(['b', 'ground', 'f', 'c']);
    expect(doc.levels[0]).toEqual({ id: 'b', name: 'Basement', basement: true, heightMm: 3000 });
    expect(doc.levels[3]).toEqual({ id: 'c', name: 'Cellar' });
  });
});

describe('retaining walls, quantities, bylaws and plans for a basement', () => {
  const ft = (f: number) => (f * 304.8) / 10;
  /** A CDA 10-marla plot with a 30' × 40' house on it, and a basement. */
  const house = () => {
    const { store, s } = setup();
    s().setSite({ authority: 'cda' });
    s().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(35), y: ft(65) }));
    s().addRectangle({ x: ft(3), y: ft(12) }, { x: ft(32), y: ft(52) });
    s().addBasement();
    return { store, s };
  };

  it('builds 12" retaining walls under the house, their outer face under its outside walls', () => {
    const { s } = house();
    expect(s().addRetainingWalls('house')).toBe(true);
    const b = s().doc.levels[0];
    const walls = s().doc.elements.filter((el): el is Wall => el.type === 'wall' && el.levelId === b.id);
    expect(walls).toHaveLength(4);
    expect(walls.every((w) => w.kind === 'retaining' && Math.abs(w.thickness! - 30.48) < 1e-6)).toBe(true);
    // The house's outside face is 4½" out from its walls' centre lines; the retaining walls' outer face too.
    const xs = walls.flatMap((w) => [w.x1, w.x2]);
    expect(Math.min(...xs)).toBeCloseTo(ft(3) - 11.43 + 15.24);
    // Again replaces them (one undo step each time).
    s().addRetainingWalls('building');
    expect(s().doc.elements.filter((el) => el.type === 'wall' && el.kind === 'retaining')).toHaveLength(4);
    s().undo();
    const again = s().doc.elements.filter((el): el is Wall => el.type === 'wall' && el.kind === 'retaining');
    expect(Math.min(...again.flatMap((w) => [w.x1, w.x2]))).toBeCloseTo(ft(3) - 11.43 + 15.24);
  });

  it('opens the lawn over it in 3D', () => {
    const { s } = house();
    s().addRetainingWalls('house');
    const model = buildModel(s().doc, { wallHeightMm: 3048, showFurniture: true });
    const lawn = model.floors.find((f) => f.id === s().doc.elements.find((el) => el.type === 'plot')!.id)!;
    expect(lawn.holes).toHaveLength(1);
  });

  it('measures excavation, RCC retaining walls, the raft and waterproofing', () => {
    const { s } = house();
    s().addRetainingWalls('house');
    const b = s().doc.levels[0];
    const q = quantities(s().doc, 3048).floors.find((f) => f.levelId === b.id)!;
    expect(q.retainingCft).toBeGreaterThan(0);
    expect(q.brickworkCft).toBe(0);
    // The outline is about 30' × 40'; dug 10' + 6" slab − plinth, and the 1' raft.
    const plinthFt = s().doc.plinthMm / 304.8;
    expect(q.excavationCft).toBeCloseTo(29.75 * 40.75 * (10.5 - plinthFt + 1), -1);
    expect(q.raftCft).toBeCloseTo(29.75 * 40.75, -1);
    expect(q.waterproofSqft).toBeGreaterThan(q.raftCft);
    const lines = estimate(q, STARTER_RATES, STARTER_RATIOS).lines.map((l) => l.id);
    expect(lines).toEqual(expect.arrayContaining(['basementExcavation', 'retaining', 'raft', 'waterproofing']));
  });

  it('checks a CDA basement: under the house, 8′6″–12′ clear, and not a storey', () => {
    const { s } = house();
    s().addRetainingWalls('building');
    let check = planCheck(s().doc, { wallHeightMm: 3048, units: 'imperial' })!;
    expect(check.rows.find((r) => r.id === 'basement-extent')).toMatchObject({ status: 'fail' });
    s().addRetainingWalls('house');
    s().setBasementHeight(4000);
    check = planCheck(s().doc, { wallHeightMm: 3048, units: 'imperial' })!;
    expect(check.rows.find((r) => r.id === 'basement-extent')).toMatchObject({ status: 'ok' });
    expect(check.rows.find((r) => r.id === 'basement-height')).toMatchObject({ status: 'fail' });
    expect(check.rows.find((r) => r.id === 'storeys')?.actual).toBe('1');
  });

  it('makes basement plans inside its walls, with retaining outside walls, no windows, and the stair under the ground floor’s', () => {
    const { s } = house();
    s().setActiveLevel(GROUND_LEVEL);
    s().addStair({ x: ft(10), y: ft(20) });
    const groundStair = s().doc.elements.find((el): el is Stair => el.type === 'stair')!;
    s().addBasement();
    s().addRetainingWalls('house');
    const plot = s().doc.elements.find((el): el is Plot => el.type === 'plot')!;
    const within = basementOutline(s().doc, plot)!;
    const site = layoutSite(plot, { within, outer: 30.48 })!;
    const program = { ...DEFAULT_PROGRAM, basement: true, gym: true, servant: true, stair: false };
    const [plan] = generateLayouts(program, site.W, site.D, { seed: 2 });
    expect(plan.rooms.map((r) => r.name)).toEqual(
      expect.arrayContaining(['Hall', 'Gym', 'Servant room', 'Servant bath']),
    );
    expect(plan.notes.some((n) => /can't be reached/.test(n))).toBe(false);
    const built = buildLayout(plan, site.frame, {
      newId,
      riseMm: 3200,
      outer: { thickness: 30.48, kind: 'retaining', heightMm: 3200 },
      noWindows: true,
      stairAt: groundStair,
    });
    expect(built.openings.filter((o) => o.type === 'window')).toHaveLength(0);
    expect(built.walls.filter((w) => w.kind === 'retaining').length).toBeGreaterThanOrEqual(4);
    expect(built.stairs[0]).toMatchObject({ x: groundStair.x, y: groundStair.y });
    s().placeLayout(built, true);
    // The old retaining walls went; the plan's took their place.
    const retaining = s().doc.elements.filter((el) => el.type === 'wall' && el.kind === 'retaining');
    expect(retaining).toHaveLength(built.walls.filter((w) => w.kind === 'retaining').length);
  });
});
