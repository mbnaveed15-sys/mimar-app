import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import type { PlanDoc, PlanElement } from '../types';
import { groundOf } from '../lib/terrain/ground';
import { buildModel, DEFAULT_WALL_HEIGHT_MM, M_PER_UNIT, SLAB_MM } from './model';

const opts = { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true };
// Without a plinth, so heights are measured from the floor.
const docWith = (...elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), plinthMm: 0, elements });
// A 10 m wall along x (plan units are 10 mm), 230 mm thick.
const wall: PlanElement = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 23 };

describe('3D model', () => {
  it('turns a plain wall into one box of full height, in metres', () => {
    const { solids } = buildModel(docWith(wall), opts);
    expect(solids).toHaveLength(1);
    expect(solids[0]).toMatchObject({ x: 5, z: 0, y0: 0, role: 'wall' });
    expect(solids[0].w).toBeCloseTo(10);
    expect(solids[0].d).toBeCloseTo(0.23);
    expect(solids[0].h).toBeCloseTo(3.048);
  });

  it('leaves a door-sized gap with a lintel above, and stands the door leaf open', () => {
    const door: PlanElement = { id: 'd', type: 'door', wallId: 'w', x: 500, y: 0, angle: 0, width: 90 };
    const { solids } = buildModel(docWith(wall, door), opts);
    const walls = solids.filter((s) => s.role === 'wall');
    expect(walls).toHaveLength(3); // left, right, above the door
    const lintel = walls.find((s) => s.y0 > 0)!;
    expect(lintel.y0).toBeCloseTo(2.134);
    expect(lintel.w).toBeCloseTo(0.9);
    const leaf = solids.find((s) => s.role === 'door')!;
    expect(leaf.d).toBeCloseTo(0.9);
    expect(leaf.x).toBeCloseTo(4.55); // hinge at the left edge of the opening
    expect(leaf.z).toBeCloseTo(-0.45); // swung open to the same side as in 2D
  });

  it('puts windows between the sill and the head, with glass', () => {
    const win: PlanElement = { id: 'n', type: 'window', wallId: 'w', x: 500, y: 0, angle: 0, width: 120 };
    const { solids } = buildModel(docWith(wall, win), opts);
    expect(solids.filter((s) => s.role === 'wall')).toHaveLength(4);
    const glass = solids.find((s) => s.role === 'glass')!;
    expect(glass.y0).toBeCloseTo(0.914);
    expect(glass.h).toBeCloseTo(2.134 - 0.914);
    expect(glass.opacity).toBeLessThan(1);
  });

  it('drops the lintel when walls are lower than the door', () => {
    const door: PlanElement = { id: 'd', type: 'door', wallId: 'w', x: 500, y: 0, angle: 0, width: 90 };
    const { solids } = buildModel(docWith(wall, door), { ...opts, wallHeightMm: 2100 });
    expect(solids.filter((s) => s.role === 'wall')).toHaveLength(2);
  });

  it('builds furniture from its footprint and rotation, and hides it with the layer', () => {
    const bed: PlanElement = {
      id: 'b',
      type: 'furniture',
      kind: 'bed-double',
      x: 300,
      y: 300,
      w: 137,
      h: 195,
      rotation: 90,
    };
    const shown = buildModel(docWith(bed), opts).solids;
    expect(shown.length).toBeGreaterThan(2);
    expect(shown.every((s) => s.role === 'furniture' && s.rotY === -Math.PI / 2)).toBe(true);
    expect(Math.max(...shown.map((s) => s.y0 + s.h))).toBeCloseTo(1.0); // headboard
    expect(buildModel(docWith(bed), { ...opts, showFurniture: false }).solids).toHaveLength(0);
  });

  it('gives each side of a wall its own material, side A facing its left normal', () => {
    const model = buildModel(docWith({ ...wall, material: 'mat_brick', materialA: 'mat_wood' }), opts);
    expect(model.solids[0].color).toBe('#B7410E');
    expect(model.solids[0].sides?.plus).toMatchObject({ color: '#C29B6C', finish: { pattern: 'wood' } });
    expect(model.solids[0].sides?.minus).toBeUndefined();
  });

  it('uses painted colours and turns rooms into floors', () => {
    const doc: PlanDoc = {
      ...docWith({ ...wall, material: 'mat_brick' }),
      rooms: [
        {
          id: 'r',
          name: 'Room',
          material: 'mat_wood',
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };
    const model = buildModel(doc, opts);
    expect(model.solids[0].color).toBe('#B7410E');
    expect(model.floors[0]).toEqual({
      y: 0,
      points: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      color: '#C29B6C',
      finish: { pattern: 'wood', spanM: 0.72, name: 'Wood' }, // four 180 mm planks
      id: 'r',
      level: 'ground',
    });
    expect(model.solids[0].finish?.pattern).toBe('brick');
    expect(model.solids[0]).toMatchObject({ id: 'w', level: 'ground' });
  });

  it('raises the ground floor on the plinth, with the walls running down into it', () => {
    const { solids } = buildModel({ ...docWith(wall), plinthMm: 450 }, opts);
    expect(solids).toHaveLength(2);
    expect(solids.find((s) => s.y0 > 0)!.y0).toBeCloseTo(0.45);
    expect(solids.find((s) => s.y0 === 0)!.h).toBeCloseTo(0.45);
  });

  it('stacks floors, with columns, beams and slabs on each', () => {
    const doc: PlanDoc = {
      ...docWith(
        wall,
        { ...wall, id: 'w2', levelId: 'first' },
        { id: 'c', type: 'column', x: 0, y: 0, w: 23, h: 30, shape: 'rect', levelId: 'first' },
        { id: 'b', type: 'beam', x1: 0, y1: 0, x2: 500, y2: 0, width: 23, depth: 46 },
        {
          id: 's',
          type: 'slab',
          thickness: 15,
          points: [
            { x: 0, y: 0 },
            { x: 500, y: 0 },
            { x: 500, y: 500 },
          ],
        },
      ),
      levels: [
        { id: 'ground', name: 'Ground floor' },
        { id: 'first', name: 'First floor' },
      ],
    };
    const { solids, slabs } = buildModel(doc, opts);
    const storey = (DEFAULT_WALL_HEIGHT_MM + SLAB_MM) / 1000;
    expect(solids.find((s) => s.role === 'wall' && s.y0 > 1)!.y0).toBeCloseTo(storey);
    expect(solids.find((s) => s.role === 'column')).toMatchObject({ y0: storey });
    const beam = solids.find((s) => s.role === 'beam')!;
    expect(beam.y0 + beam.h).toBeCloseTo(3.048);
    expect(slabs[0].y0).toBeCloseTo(3.048);
    expect(slabs[0].h).toBeCloseTo(0.15);
  });
});

describe('3D site', () => {
  it('stands boundary walls on the ground at their own height, with gates open to the sky', () => {
    const boundary: PlanElement = { ...wall, kind: 'boundary', heightMm: 2133.6 };
    const gate: PlanElement = { id: 'g', type: 'door', wallId: 'w', x: 500, y: 0, width: 300, angle: 0, gate: true };
    const { solids } = buildModel({ ...docWith(boundary, gate), plinthMm: 450 }, opts);
    const walls = solids.filter((s) => s.role === 'wall');
    expect(walls).toHaveLength(2); // either side of the gate, no lintel, no plinth piece
    expect(walls.every((s) => s.y0 === 0 && Math.abs(s.h - 2.1336) < 1e-6)).toBe(true);
    expect(solids.filter((s) => s.role === 'door')).toHaveLength(2);
  });

  it('builds stairs from their treads, and lays a lawn over the plot', () => {
    const stair: PlanElement = {
      id: 'st',
      type: 'stair',
      x: 0,
      y: 0,
      shape: 'straight',
      width: 91.44,
      riseMm: 3200,
      riserMm: 3200 / 18,
      treadMm: 254,
      w: 91.44,
      h: 431.8,
    };
    const plot: PlanElement = {
      id: 'p',
      type: 'plot',
      front: 2,
      setbacks: { front: 0, rear: 0, sides: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    };
    const { solids, floors } = buildModel(docWith(stair, plot), opts);
    const steps = solids.filter((s) => s.role === 'stair');
    expect(steps).toHaveLength(17);
    expect(Math.max(...steps.map((s) => s.h))).toBeCloseTo((17 * 3200) / 18 / 1000);
    expect(floors).toHaveLength(1);
    expect(floors[0].y).toBe(0);
  });

  it('lifts items by their height above the floor', () => {
    const col: PlanElement = { id: 'c', type: 'column', x: 0, y: 0, w: 23, h: 30, shape: 'rect', elevMm: 500 };
    const raised = { ...wall, elevMm: 1000 } as PlanElement;
    const { solids } = buildModel(docWith(raised, col), opts);
    expect(solids.find((s) => s.role === 'column')!.y0).toBeCloseTo(0.5);
    expect(solids.find((s) => s.role === 'wall')!.y0).toBeCloseTo(1);
  });

  it('puts a window at its own sill height and keeps its size', () => {
    const win: PlanElement = { id: 'n', type: 'window', wallId: 'w', x: 500, y: 0, angle: 0, width: 120, sillMm: 1200 };
    const glass = buildModel(docWith(wall, win), opts).solids.find((s) => s.role === 'glass')!;
    expect(glass.y0).toBeCloseTo(1.2);
    expect(glass.h).toBeCloseTo(2.134 - 0.914);
  });

  it('builds a niche as the wall behind plus a layer with the outline cut out, and a projection out front', () => {
    const niche: PlanElement = {
      id: 'n',
      type: 'window',
      wallId: 'w',
      x: 300,
      y: 0,
      angle: 0,
      width: 60,
      flat: true,
      face: 1,
      depthMm: -100,
    };
    const ledge: PlanElement = {
      id: 'p',
      type: 'window',
      wallId: 'w',
      x: 700,
      y: 0,
      angle: 0,
      width: 60,
      flat: true,
      face: -1,
      depthMm: 300,
    };
    const { panels } = buildModel(docWith(wall, niche, ledge), opts);
    const behind = panels.find((p) => p.id === 'n')!;
    const front = panels.find((p) => p.holes?.length)!;
    expect(behind.depth).toBeCloseTo(0.13);
    expect(front.depth).toBeCloseTo(0.1);
    // Face 1 is +z for a wall along +x: the cut layer is on that side, the wall behind on the other.
    expect(front.z).toBeCloseTo(0.065);
    expect(behind.z).toBeCloseTo(-0.05);
    const out = panels.find((p) => p.id === 'p')!;
    expect(out).toMatchObject({ role: 'wall', depth: 0.3 });
    expect(out.z).toBeCloseTo(-(0.115 + 0.15));
  });
});

describe('3D terrain and site', () => {
  // A 10 m square plot (plan units are 10 mm).
  const plot: PlanElement = {
    id: 'p',
    type: 'plot',
    front: 0,
    setbacks: { front: 0, rear: 0, sides: 0 },
    points: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ],
  };
  // Ground rising 1 mm per plan unit (10%) to the east, surveyed well past the plot.
  const slope: PlanElement[] = [
    [-500, -500],
    [1500, -500],
    [1500, 1500],
    [-500, 1500],
  ].map(([x, y], i) => ({ id: `l${i}`, type: 'level', x, y, zMm: x }));
  const site = (ground: PlanDoc['ground'], ...elements: PlanElement[]): PlanDoc => ({
    ...docWith(...elements),
    ground,
  });
  /** Scene corners of a mesh as [x, y, z]. */
  const corners = (positions: number[]) =>
    Array.from({ length: positions.length / 3 }, (_, i) => positions.slice(3 * i, 3 * i + 3));

  it('leaves a flat site as it was: the lawn at ±0, no ground meshes', () => {
    const doc = docWith(wall, plot);
    const model = buildModel(doc, opts);
    expect(model.terrain).toBeUndefined();
    expect(model.groundY).toBeUndefined();
    expect(model.floors.find((f) => f.id === 'p')!.y).toBe(0);
    expect(model).toEqual(buildModel(doc, { ...opts, terrain: false }));
  });

  it('raises the lawn of a plot levelled at +600, with a bank down to the ground round it', () => {
    const model = buildModel(site({ levelMm: 600 }, plot), opts);
    expect(model.floors.find((f) => f.id === 'p')!.y).toBeCloseTo(0.6);
    expect(model.guides![0].y).toBeCloseTo(0.612);
    const bank = model.terrain!.find((t) => t.kind === 'bank')!;
    const ys = corners(bank.positions).map((p) => p[1]);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(0.6);
    expect(model.groundY!).toBeLessThan(0);
  });

  it('lays the lawn and the natural ground round it on a sloping survey', () => {
    const doc = site({ grade: 'natural' }, plot, ...slope);
    const model = buildModel(doc, opts);
    const ground = groundOf(doc);
    const lawn = model.terrain!.find((t) => t.kind === 'lawn')!;
    expect(lawn).toMatchObject({ id: 'p', level: 'ground' });
    expect(model.floors.find((f) => f.id === 'p')).toBeUndefined();
    for (const [x, y, z] of corners(lawn.positions))
      expect(y).toBeCloseTo(ground.finishedAt(x / M_PER_UNIT, z / M_PER_UNIT) / 1000, 6);
    const natural = model.terrain!.find((t) => t.kind === 'natural')!;
    const ring = corners(natural.positions);
    for (const [x, y, z] of ring) expect(y).toBeCloseTo(ground.naturalAt(x / M_PER_UNIT, z / M_PER_UNIT) / 1000, 6);
    // It reaches 10 m past the levels, and leaves the plot to the lawn.
    expect(Math.min(...ring.map((p) => p[0]))).toBeCloseTo(-15);
    expect(ring.some(([x, , z]) => x > 0.5 && x < 9.5 && z > 0.5 && z < 9.5)).toBe(false);
    // The ground plane sits under the lowest ground.
    expect(model.groundY!).toBeLessThan(Math.min(...ring.map((p) => p[1])));
    // The setback line lies on the lawn.
    expect(
      model.guides![0].ys!.every((y, i) => Math.abs(y - (model.guides![0].points[i][0] / 10 + 0.012)) < 1e-6),
    ).toBe(true);
  });

  it('meshes the lawn over a levelled plot where a levelled area cuts into it', () => {
    const pad: PlanElement = {
      id: 'pad',
      type: 'pad',
      zMm: -900,
      points: [
        { x: 800, y: 200 },
        { x: 1300, y: 200 },
        { x: 1300, y: 800 },
        { x: 800, y: 800 },
      ],
    };
    const model = buildModel(site({ levelMm: 300 }, plot, pad, ...slope), opts);
    const lawn = model.terrain!.find((t) => t.kind === 'lawn')!;
    const ys = new Set(corners(lawn.positions).map((p) => Math.round(p[1] * 1000)));
    expect([...ys].sort((a, b) => a - b)).toEqual([-900, 300]);
    const own = model.terrain!.find((t) => t.kind === 'pad')!;
    expect(own.id).toBe('pad');
    // Outside the plot only, at its height.
    expect(corners(own.positions).every(([x, y]) => x >= 10 - 1e-9 && Math.abs(y + 0.9) < 1e-9)).toBe(true);
  });

  it('steps boundary walls down the slope, each step on the ground under it', () => {
    const boundary: PlanElement = { ...wall, kind: 'boundary', heightMm: 2000 };
    const doc = site({ grade: 'natural' }, plot, boundary, ...slope);
    const steps = buildModel(doc, opts)
      .solids.filter((s) => s.role === 'wall')
      .sort((a, b) => a.x - b.x);
    expect(steps).toHaveLength(3); // 10 m in steps of about 3 m
    expect(steps.reduce((w, s) => w + s.w, 0)).toBeCloseTo(10, 6);
    for (const s of steps) {
      const [from, to] = [s.x - s.w / 2, s.x + s.w / 2];
      // The ground rises 0.1 m a metre: the base is at the lower end, the top 2 m over the middle.
      expect(s.y0).toBeCloseTo(from / 10, 6);
      expect(s.y0 + s.h).toBeCloseTo(s.x / 10 + 2, 6);
      expect(s.rotY).toBeCloseTo(0);
      expect(to).toBeGreaterThan(from);
    }
    // Along x on the plan is along x in the scene, one step after another.
    steps.slice(1).forEach((s, i) => expect(s.x - s.w / 2).toBeCloseTo(steps[i].x + steps[i].w / 2, 6));
  });

  it('steps a wall at an angle along its own length', () => {
    const along: PlanElement = {
      id: 'b',
      type: 'wall',
      kind: 'boundary',
      x1: 0,
      y1: 0,
      x2: 600,
      y2: 600,
      thickness: 23,
    };
    const steps = buildModel(site({ grade: 'natural' }, plot, along, ...slope), opts).solids.filter(
      (s) => s.role === 'wall',
    );
    expect(steps.length).toBeGreaterThan(1);
    for (const s of steps) {
      // Each step's middle lies on the wall's line (x = z on the plan).
      expect(s.x).toBeCloseTo(s.z, 6);
      expect(s.y0).toBeLessThan(s.x / 10);
    }
  });

  it('runs the plinth down to the finished ground, and the steps up it', () => {
    const doc: PlanDoc = { ...site({ levelMm: -300 }, plot, { ...wall, y1: 500, y2: 500 }, ...slope), plinthMm: 450 };
    const solids = buildModel(doc, opts).solids;
    const plinth = solids.find((s) => s.role === 'wall' && s.y0 < 0)!;
    expect(plinth.y0).toBeCloseTo(-0.3);
    expect(plinth.y0 + plinth.h).toBeCloseTo(0.45);
    expect(solids.find((s) => s.role === 'wall' && s.y0 > 0.4)!.y0).toBeCloseTo(0.45);

    const stair: PlanElement = {
      id: 'st',
      type: 'stair',
      x: 300,
      y: 700,
      shape: 'straight',
      width: 100,
      riseMm: 450,
      riserMm: 150,
      treadMm: 300,
      w: 100,
      h: 90,
    };
    const steps = buildModel({ ...doc, elements: [...doc.elements, stair] }, opts).solids.filter(
      (s) => s.role === 'stair',
    );
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.every((s) => Math.abs(s.y0 + 0.3) < 1e-9)).toBe(true);
    expect(Math.max(...steps.map((s) => s.y0 + s.h))).toBeCloseTo(0.3); // the last riser is up to the floor
  });

  it('stands neighbouring buildings on the ground as blocks, and lays roads on it', () => {
    const building: PlanElement = {
      id: 'nb',
      type: 'context',
      kind: 'building',
      heightMm: 9000,
      points: [
        { x: 1200, y: 0 },
        { x: 1400, y: 0 },
        { x: 1400, y: 300 },
        { x: 1200, y: 300 },
      ],
    };
    const road: PlanElement = {
      id: 'rd',
      type: 'context',
      kind: 'road',
      points: [
        { x: -300, y: -500 },
        { x: 1300, y: -500 },
      ],
    };
    const flat = buildModel(docWith(plot, building, road), opts);
    expect(flat.context).toHaveLength(1);
    expect(flat.context![0]).toMatchObject({ id: 'nb', y0: 0, h: 9, role: 'block' });
    const strip = flat.terrain!.find((t) => t.kind === 'road')!;
    expect(strip.id).toBe('rd');
    const pts = corners(strip.positions);
    expect(pts.every((p) => Math.abs(p[1] - 0.01) < 1e-9)).toBe(true);
    expect(Math.max(...pts.map((p) => p[2])) - Math.min(...pts.map((p) => p[2]))).toBeCloseTo(6); // 6 m wide
    expect(flat.groundY).toBe(0);

    // On the slope: the block's foot is at its lowest corner, its top 9 m over its middle; the road follows the ground.
    const sloped = buildModel(site({ grade: 'natural' }, plot, building, road, ...slope), opts);
    const block = sloped.context![0];
    expect(block.y0).toBeCloseTo(1.2);
    expect(block.y0 + block.h).toBeCloseTo(1.3 + 9);
    for (const [x, y, z] of corners(sloped.terrain!.find((t) => t.kind === 'road')!.positions))
      expect(y).toBeCloseTo(
        groundOf(site({ grade: 'natural' }, ...slope)).naturalAt(x / M_PER_UNIT, z / M_PER_UNIT) / 1000 + 0.01,
        6,
      );
  });

  it('builds a 5-marla plot with 50 levels quickly, and keeps the ground when only walls change', () => {
    const marla: PlanElement = {
      ...plot,
      points: [
        { x: 0, y: 0 },
        { x: 762, y: 0 },
        { x: 762, y: 1372 },
        { x: 0, y: 1372 },
      ],
    };
    const levels: PlanElement[] = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`,
      type: 'level',
      x: -400 + (i % 7) * 260,
      y: -400 + Math.floor(i / 7) * 310,
      zMm: ((i * 37) % 11) * 120,
    }));
    const doc = site({ grade: 'natural' }, marla, ...levels);
    const started = performance.now();
    const first = buildModel(doc, opts);
    const took = performance.now() - started;
    expect(took).toBeLessThan(1000); // well under 100 ms on a desktop; generous for slow test machines
    const again = buildModel({ ...doc, elements: [...doc.elements, wall] }, opts);
    expect(again.terrain).toBe(first.terrain);
  });
});
