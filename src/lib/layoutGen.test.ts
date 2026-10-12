import { describe, expect, it } from 'vitest';
import { newId } from './ids';
import { buildLayout, largestRect, layoutSite, terraceDepth, upperSite } from './layoutBuild';
import {
  DEFAULT_PROGRAM,
  feetToUnits as ft,
  generateLayouts,
  generateUpperLayouts,
  mirrorLayout,
  programArea,
  shared,
  type Layout,
  type Program,
} from './layoutGen';
import { planHints } from './planHints';
import { plotRect } from './site';
import { emptyDoc } from './storage';
import { createPlannerStore } from '../store/plannerStore';
import { DEFAULT_PREFS } from './prefs';
import type { PlanDoc, Plot } from '../types';

const small: Program = {
  ...DEFAULT_PROGRAM,
  bedrooms: 2,
  attachedBaths: 2,
  drawing: false,
  dining: false,
  store: false,
  powder: false,
};

/** Rooms of a plan never overlap and fill the building area exactly. */
function tiles(plan: Layout) {
  const rects = plan.rooms.flatMap((r) => r.rects);
  const area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  expect(area).toBeCloseTo(plan.W * plan.D, 0);
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      expect(ox > 1e-6 && oy > 1e-6).toBe(false);
    }
}

describe('plans from a room list', () => {
  it('lays out a 10-marla house three ways, every room reached', () => {
    const plans = generateLayouts(DEFAULT_PROGRAM, ft(32.6), ft(57.3), { seed: 3 });
    expect(plans).toHaveLength(3);
    expect(new Set(plans.map((p) => p.key)).size).toBe(3);
    for (const plan of plans) {
      tiles(plan);
      expect(plan.notes.some((n) => /can't be reached|no way in/.test(n))).toBe(false);
      const kinds = plan.rooms.map((r) => r.kind);
      expect(kinds.filter((k) => k === 'bath')).toHaveLength(3);
      for (const k of ['master', 'lounge', 'kitchen', 'dining', 'drawing', 'porch', 'stair', 'store', 'powder'])
        expect(kinds).toContain(k);
      // The porch is on the road side and the bedrooms' baths open off them.
      const porch = plan.rooms.find((r) => r.kind === 'porch')!;
      expect(porch.rects[0].y0).toBeCloseTo(0);
      for (const [i, r] of plan.rooms.entries())
        if (r.kind === 'bath') expect(plan.doors.some((d) => d.a === r.of && d.b === i)).toBe(true);
      // One main entrance into the lounge.
      expect(plan.doors.filter((d) => d.main)).toHaveLength(1);
    }
    // Better plans first.
    expect(plans[0].score).toBeLessThanOrEqual(plans[2].score);
  });

  it('fits a small 5-marla list, saying what is tight', () => {
    const plans = generateLayouts(small, ft(22.6), ft(37.3), { seed: 3 });
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      tiles(plan);
      expect(plan.notes.some((n) => /can't be reached/.test(n))).toBe(false);
    }
    expect(plans[0].notes.join(' ')).toMatch(/small/);
  });

  it('gives the same plans for the same seed, and others for another', () => {
    const a = generateLayouts(DEFAULT_PROGRAM, ft(34), ft(55), { seed: 5 });
    const b = generateLayouts(DEFAULT_PROGRAM, ft(34), ft(55), { seed: 5 });
    const c = generateLayouts(DEFAULT_PROGRAM, ft(34), ft(55), { seed: 6 });
    expect(a.map((p) => p.key)).toEqual(b.map((p) => p.key));
    expect(c.map((p) => p.key)).not.toEqual(a.map((p) => p.key));
  });

  it('finds nothing when the rooms can’t stand side by side', () => {
    expect(generateLayouts(DEFAULT_PROGRAM, ft(14), ft(30), { seed: 1 })).toEqual([]);
  });

  it('mirrors a plan left for right, keeping who is next to whom', () => {
    const [plan] = generateLayouts(DEFAULT_PROGRAM, ft(32.6), ft(57.3), { seed: 3 });
    const m = mirrorLayout(plan);
    tiles(m);
    const lounge = plan.rooms.findIndex((r) => r.kind === 'lounge');
    const kitchen = plan.rooms.findIndex((r) => r.kind === 'kitchen');
    expect(shared(m.rooms[lounge], m.rooms[kitchen])).toBeCloseTo(shared(plan.rooms[lounge], plan.rooms[kitchen]));
    expect(m.rooms[lounge].rects[0].x0).toBeCloseTo(plan.W - plan.rooms[lounge].rects[0].x1);
  });

  it('adds up the covered area the rooms need', () => {
    // 2 bedrooms with baths, lounge, kitchen, porch and stair, with a tenth for walls.
    const rooms = 14 * 16 + 12 * 14 + 2 * 5 * 8 + 15 * 18 + 9 * 12 + 11 * 18.5 + 7.5 * 11;
    expect(programArea(small)).toBeCloseTo(rooms * 1.1);
  });
});

describe('building a plan on a plot', () => {
  const setup = (w: number, d: number) => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    store.getState().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(w), y: ft(d) }));
    const plot = store.getState().doc.elements.find((e): e is Plot => e.type === 'plot')!;
    return { doc: store.getState().doc, plot };
  };

  it('finds the largest rectangle inside an L', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 50 },
      { x: 0, y: 50 },
    ];
    expect(largestRect(L)).toEqual({ x0: 0, y0: 0, x1: 20, y1: 50 });
  });

  it('puts the house inside the building line and the boundary walls, square to the road', () => {
    const { plot } = setup(35, 65);
    const site = layoutSite(plot)!;
    // 35' less two 9" boundary walls (and a 1" gap), less the house's own 9" outside walls.
    expect(site.W / ft(1)).toBeCloseTo(35 - 2 * (0.75 + 25 / 304.8) - 0.75, 1);
    // 65' less 5' front and 2' rear setbacks, less the outside walls.
    expect(site.D / ft(1)).toBeCloseTo(65 - 7 - 0.75, 1);
    // x runs along the road, y in from it (up the screen, away from the road at the bottom).
    expect(site.frame.v.y).toBeCloseTo(-1);
    expect(site.frame.u.x).toBeCloseTo(1);
    // A big plot's house doesn't spread further back than the rooms need.
    expect(layoutSite(plot, { needSqFt: 800 })!.D / ft(1)).toBeCloseTo(30 - 0.75, 1);
    // Nor past the bylaws' coverage.
    expect(layoutSite(plot, { maxAreaSqFt: 1000 })!.D).toBeLessThan(ft(1000 / 33));
  });

  it('builds walls, rooms, doors, windows and a stair that pass the plan hints’ reach checks', () => {
    const { doc, plot } = setup(35, 65);
    const site = layoutSite(plot)!;
    const [plan] = generateLayouts(DEFAULT_PROGRAM, site.W, site.D, { seed: 3 });
    const built = buildLayout(plan, site.frame, { newId, riseMm: 3200 });
    expect(built.rooms.map((r) => r.name).sort()).toEqual(plan.rooms.map((r) => r.name).sort());
    // Outside walls are 9", inside ones 4½".
    const t = new Set(built.walls.map((w) => Math.round(w.thickness! * 100)));
    expect(t).toEqual(new Set([2286, 1143]));
    expect(built.openings.filter((o) => o.type === 'door').length).toBe(plan.doors.length);
    expect(built.openings.some((o) => o.type === 'window' && o.windowKind === 'vent')).toBe(true);
    expect(built.stairs).toHaveLength(1);
    const next: PlanDoc = {
      ...doc,
      elements: [...doc.elements, ...built.walls, ...built.openings, ...built.stairs],
      rooms: built.rooms,
    };
    const hints = planHints(next, { units: 'imperial' });
    expect(hints.filter((h) => h.kind === 'reach').map((h) => h.text)).toEqual([]);
    // Doors and windows keep their gap from corners.
    expect(hints.some((h) => h.id === 'opening-gaps')).toBe(false);
    // Rooms close round their walls (none left as bare outlines but the porch).
    for (const r of built.rooms) expect(r.points.length).toBeGreaterThanOrEqual(4);
  });
});

describe('a first floor from a room list', () => {
  /** A 35' × 65' plot with a ground floor from the room list on it (placed through the store). */
  const groundFloor = () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    store.getState().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(35), y: ft(65) }));
    const plot = store.getState().doc.elements.find((e): e is Plot => e.type === 'plot')!;
    const site = layoutSite(plot)!;
    const [plan] = generateLayouts(DEFAULT_PROGRAM, site.W, site.D, { seed: 3 });
    store.getState().placeLayout(buildLayout(plan, site.frame, { newId, riseMm: 3200 }));
    return { store, plot };
  };
  const upperList: Program = { ...DEFAULT_PROGRAM, upper: true, store: true, laundry: true, powder: false };

  it('says what is missing when there is no ground floor or stair', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    store.getState().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(35), y: ft(65) }));
    const plot = store.getState().doc.elements.find((e): e is Plot => e.type === 'plot')!;
    expect(upperSite(store.getState().doc, plot)).toMatch(/ground floor first/);
    const { store: s2, plot: p2 } = groundFloor();
    const noStair = { ...s2.getState().doc, elements: s2.getState().doc.elements.filter((e) => e.type !== 'stair') };
    expect(upperSite(noStair, p2)).toMatch(/stair on the ground floor/);
  });

  it('plans the rooms round the stair below, with a terrace in front, every room reached', () => {
    const { store, plot } = groundFloor();
    const at = upperSite(store.getState().doc, plot);
    if (typeof at === 'string') throw new Error(at);
    const stair = store.getState().doc.elements.find((e) => e.type === 'stair')!;
    expect(at.stairRoomId).toBeDefined();
    const terrace = terraceDepth(at, programArea(upperList));
    expect(terrace).toBeGreaterThan(ft(5));
    const plans = generateUpperLayouts(upperList, at.W, at.D, { ...at.ground, terrace }, { seed: 2 });
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      tiles(plan);
      expect(plan.notes.some((n) => /can't be reached/.test(n))).toBe(false);
      const kinds = plan.rooms.map((r) => r.kind);
      expect(kinds).toContain('terrace');
      expect(kinds).not.toContain('kitchen');
      expect(kinds.filter((k) => k === 'bath')).toHaveLength(3);
      // The stair room is where the stair is below, and the TV lounge opens off it.
      const hall = plan.rooms.find((r) => r.kind === 'stair')!.rects[0];
      const s = at.ground.stair;
      expect(hall.x0).toBeLessThanOrEqual(s.x0 + 1e-6);
      expect(hall.x1).toBeGreaterThanOrEqual(s.x1 - 1e-6);
      expect(hall.y0).toBeLessThanOrEqual(s.y0 + 1e-6);
      expect(hall.y1).toBeGreaterThanOrEqual(s.y1 - 1e-6);
      const lounge = plan.rooms.find((r) => r.kind === 'lounge')!;
      expect(lounge.name).toBe('TV lounge');
      // The terrace is in front, the whole width, with a door out to it.
      const t = plan.rooms.findIndex((r) => r.kind === 'terrace');
      expect(plan.rooms[t].rects[0]).toMatchObject({ x0: 0, y0: 0, x1: plan.W });
      expect(plan.doors.some((d) => d.b === t)).toBe(true);
    }

    // Built on the first floor: no stair of its own, a parapet round the terrace, and the stair room
    // below left open to it.
    const first = plans[0];
    const levelId = 'first';
    const built = buildLayout(first, at.frame, { newId, levelId, riseMm: 0, noStair: true });
    expect(built.stairs).toHaveLength(0);
    expect(built.walls.filter((w) => w.kind === 'parapet')).toHaveLength(3);
    expect(built.rooms.map((r) => r.name)).toContain('Terrace');
    store.getState().placeUpperLayout(built, levelId, at.stairRoomId);
    const doc = store.getState().doc;
    expect(doc.levels.map((l) => l.name)).toEqual(['Ground floor', 'First floor']);
    expect(store.getState().activeLevel).toBe(levelId);
    expect(doc.rooms.find((r) => r.id === at.stairRoomId)!.openAbove).toBe(true);
    expect(doc.elements.filter((e) => e.type === 'wall' && e.levelId === levelId).length).toBe(built.walls.length);
    // The ground floor is as it was, and the stair still climbs from it.
    expect(doc.elements.filter((e) => e.type === 'stair')).toEqual([stair]);
    // Placing again replaces the first floor (parapets too), in one undo step.
    expect(store.getState().upperClash().walls).toBe(built.walls.length);
    store
      .getState()
      .placeUpperLayout(
        buildLayout(plans[1] ?? first, at.frame, { newId, levelId, riseMm: 0, noStair: true }),
        levelId,
      );
    expect(store.getState().doc.levels).toHaveLength(2);
    store.getState().undo();
    expect(store.getState().doc.elements.filter((e) => e.levelId === levelId).length).toBe(
      built.walls.length + built.openings.length,
    );
    const hints = planHints(store.getState().doc, { units: 'imperial' });
    expect(hints.filter((h) => h.kind === 'reach').map((h) => h.text)).toEqual([]);
  });

  it('puts baths over the wet rooms below when it can, and keeps within the bylaws’ first-floor limit', () => {
    const { store, plot } = groundFloor();
    const at = upperSite(store.getState().doc, plot);
    if (typeof at === 'string') throw new Error(at);
    expect(at.ground.wet!.length).toBeGreaterThan(2);
    const plans = generateUpperLayouts(upperList, at.W, at.D, { ...at.ground, terrace: 0 }, { seed: 2 });
    const overWet = (plan: Layout) =>
      plan.rooms
        .filter((r) => r.kind === 'bath')
        .some((r) =>
          at.ground.wet!.some(
            (w) =>
              Math.min(r.rects[0].x1, w.x1) > Math.max(r.rects[0].x0, w.x0) &&
              Math.min(r.rects[0].y1, w.y1) > Math.max(r.rects[0].y0, w.y0),
          ),
        );
    expect(overWet(plans[0])).toBe(true);
    // A tight limit leaves a deeper terrace, but never past the stair.
    const deep = terraceDepth(at, programArea(upperList), 600);
    expect(deep).toBeGreaterThan(terraceDepth(at, programArea(upperList)));
    expect(deep).toBeLessThanOrEqual(at.ground.stair.y0 + 1e-6);
  });
});
