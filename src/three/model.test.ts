import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import type { PlanDoc, PlanElement } from '../types';
import { buildModel, DEFAULT_WALL_HEIGHT_MM, SLAB_MM } from './model';

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
