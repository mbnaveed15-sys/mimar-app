import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc, normaliseDoc } from '../storage';
import { createPlannerStore } from '../../store/plannerStore';
import { buildModel, DEFAULT_WALL_HEIGHT_MM, levelBaseM, roofMesh } from '../../three/model';
import { mapOutline } from '../../geometry';
import { outsideOutline } from '../outline';
import { quantities } from '../quantities';
import { levelMarks, sideDrawing } from '../drawings/views';
import { planToDxf } from '../exportDxf';
import { press, release } from '../../tools/controller';
import { finishStep } from '../../tools/finish';
import type { Roof, Wall } from '../../types';
import {
  gableArea,
  gableEdges,
  gableWalls,
  lowEdgeOf,
  pitchOfRise,
  readPitch,
  riseIn12,
  roofShape,
  roofTopMm,
  slopedArea,
  triangulate,
  withOverhang,
} from './roof';

const FT = 30.48;
const TAN30 = Math.tan(Math.PI / 6);

/** A 30' × 20' house (wall centres) with the Roof tool's settings as given. */
function house(shape: Roof['shape'] = 'hip') {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = () => store.getState();
  s().addRectangle({ x: 0, y: 0 }, { x: 30 * FT, y: 20 * FT });
  s().setSite({ roofShape: shape });
  const walls = s().doc.elements.filter((el): el is Wall => el.type === 'wall');
  const outline = outsideOutline(walls)!;
  const xs = outline.map((p) => p.x);
  const ys = outline.map((p) => p.y);
  // The outside of the walls, feet.
  const W = (Math.max(...xs) - Math.min(...xs)) / FT;
  const D = (Math.max(...ys) - Math.min(...ys)) / FT;
  return { store, s, W, D };
}
const roofOf = (s: () => { doc: { elements: { type: string }[] } }) =>
  s().doc.elements.find((el): el is Roof => el.type === 'roof')!;

describe('pitched roofs', () => {
  it('go over the house, reaching 1′6″ past its walls, with the two short ends as gables', () => {
    const { s, W, D } = house('gable');
    expect(s().roofOverHouse()).toBe(true);
    const roof = roofOf(s);
    expect(roof).toMatchObject({ shape: 'gable', pitchDeg: 30, overhangMm: 457.2 });
    const xs = roof.points.map((p) => p.x);
    expect((Math.max(...xs) - Math.min(...xs)) / FT).toBeCloseTo(W + 3, 3);
    expect(
      gableEdges(roof).map((i) => {
        const a = roof.points[i];
        const b = roof.points[(i + 1) % 4];
        return Math.hypot(b.x - a.x, b.y - a.y) / FT;
      }),
    ).toEqual([expect.closeTo(D + 3, 3), expect.closeTo(D + 3, 3)]);
    // A shed roof falls to its longest side.
    expect(
      Math.hypot(
        ...[0, 1].map((k) => (k ? roof.points[1].y - roof.points[0].y : roof.points[1].x - roof.points[0].x)),
      ) / FT,
    ).toBeGreaterThan(0);
    const low = lowEdgeOf(roof);
    const a = roof.points[low];
    const b = roof.points[(low + 1) % 4];
    expect(Math.hypot(b.x - a.x, b.y - a.y) / FT).toBeCloseTo(W + 3, 3);
  });

  it('gable the ends of the wings of an L-shaped house', () => {
    const L = [
      [0, 0],
      [30, 0],
      [30, 12],
      [18, 12],
      [18, 24],
      [0, 24],
    ].map(([x, y]) => ({ x: x * FT, y: y * FT }));
    expect(gableEdges({ points: L })).toEqual([1, 4]);
    const roof: Roof = {
      id: 'r',
      type: 'roof',
      points: L,
      shape: 'gable',
      pitchDeg: 30,
      overhangMm: 0,
      thicknessMm: 150,
    };
    // Two gable walls, each a triangle rising half the wing's width up the slope.
    const walls = gableWalls(roof);
    expect(walls).toHaveLength(2);
    for (const w of walls) {
      const width = Math.max(...w.outline.map(([u]) => u)) - Math.min(...w.outline.map(([u]) => u));
      expect(Math.max(...w.outline.map(([, v]) => v))).toBeCloseTo((width / 2) * TAN30, 3);
    }
  });

  it('are measured along their slopes, with a ridge and hips on a hipped one', () => {
    const { s, W, D } = house('hip');
    s().roofOverHouse();
    const roof = roofOf(s);
    const shape = roofShape(roof);
    expect(shape.lines.filter((l) => l.kind === 'ridge')).toHaveLength(1);
    expect(shape.lines.filter((l) => l.kind === 'hip')).toHaveLength(4);
    const plan = (W + 3) * (D + 3);
    expect((slopedArea(roof) / FT / FT) * Math.cos(Math.PI / 6)).toBeCloseTo(plan, 3);
    // To the ridge: half the depth up the slope, less the drop over the overhang.
    expect(roofTopMm(roof, 3048)).toBeCloseTo(3048 + (D / 2) * TAN30 * 304.8 + 152.4 / Math.cos(Math.PI / 6), 0);
    const q = quantities(s().doc, 3048).floors[0];
    expect(q.roofSqft).toBeCloseTo(plan / Math.cos(Math.PI / 6), 1);
    // No flat slab is guessed over a roofed floor.
    expect(q.slabEstimateCft).toBe(0);
    expect(q.slabCft).toBeCloseTo((plan / Math.cos(Math.PI / 6)) * 0.5, 1);
  });

  it('raise gable walls from the top of the walls to meet the roof', () => {
    const { s, D } = house('gable');
    s().roofOverHouse();
    const roof = roofOf(s);
    const walls = gableWalls(roof);
    expect(walls).toHaveLength(2);
    // Each is a triangle as wide as the house, rising a half-depth's worth of slope.
    for (const w of walls) {
      const us = w.outline.map(([u]) => u / FT);
      expect(Math.max(...us) - Math.min(...us)).toBeCloseTo(D, 3);
      expect(Math.max(...w.outline.map(([, v]) => v)) / FT).toBeCloseTo((D / 2) * TAN30, 3);
    }
    expect(gableArea(roof) / FT / FT).toBeCloseTo(2 * ((D * D) / 4) * TAN30, 2);
    const q = quantities(s().doc, 3048).floors[0];
    const bare = quantities({ ...s().doc, elements: s().doc.elements.filter((el) => el.type !== 'roof') }, 3048)
      .floors[0];
    expect(q.brickworkCft - bare.brickworkCft).toBeCloseTo(((2 * (D * D)) / 4) * TAN30 * 0.75, 1);
  });

  it('are built in 3D as sloping faces with gable walls, and cut in sections', () => {
    const { s } = house('gable');
    s().roofOverHouse();
    const model = buildModel(s().doc, { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true });
    expect(model.roofs).toHaveLength(1);
    expect(model.roofs![0].faces).toHaveLength(2);
    expect(model.panels.filter((p) => p.role === 'wall' && p.id === roofOf(s).id)).toHaveLength(2);
    const { positions, indices } = roofMesh(model.roofs![0]);
    expect(indices.length % 3).toBe(0);
    const top = Math.max(...positions.filter((_, i) => i % 3 === 1));
    const base = levelBaseM(s().doc, 'ground', DEFAULT_WALL_HEIGHT_MM);
    expect(top).toBeCloseTo(base + roofTopMm(roofOf(s), DEFAULT_WALL_HEIGHT_MM) / 1000, 3);

    s().addSection({ x: 15 * FT, y: -5 * FT }, { x: 15 * FT, y: 25 * FT }, false);
    const line = s().doc.elements.find((el) => el.type === 'section')!;
    const d = sideDrawing(s().doc, { kind: 'section', id: line.id }, { wallHeightMm: 3048, units: 'imperial' })!;
    // The roof is cut: sloping strips above the tops of the walls.
    const wallTop = base + 3.048;
    const high = d.cut.filter((c) => c[0].some(([, v]) => v > wallTop + 0.5));
    expect(high.length).toBeGreaterThanOrEqual(2);
    // Marked at the tops of the walls and the ridge, with no flat roof slab.
    const marks = levelMarks(s().doc, { wallHeightMm: 3048, units: 'imperial' }).map((m) => m.name);
    expect(marks).toContain('Top of walls');
    expect(marks).toContain('Ridge');
    expect(marks).not.toContain('Top of roof slab');
  });

  it('are drawn from corners round the walls, finished by Enter', () => {
    const { store, s, W } = house('hip');
    s().setTool('roof');
    const click = (x: number, y: number) => {
      press(store, { x, y });
      release(store, false);
    };
    click(0, 0);
    click(30 * FT, 0);
    click(30 * FT, 20 * FT);
    click(0, 20 * FT);
    expect(s().draft).toMatchObject({ type: 'roof' });
    expect(finishStep(store)).toBe(true);
    const roof = roofOf(s);
    const xs = roof.points.map((p) => p.x);
    // Round the wall centres here, so 3' wider than them.
    expect((Math.max(...xs) - Math.min(...xs)) / FT).toBeCloseTo(33, 3);
    expect(W).toBeGreaterThan(30);
  });

  it('keep their settings when saved, mirrored or given another overhang', () => {
    const { s } = house('gable');
    s().roofOverHouse();
    const roof = { ...roofOf(s), gables: [1], lowEdge: 2 };
    const back = normaliseDoc(JSON.parse(JSON.stringify({ ...s().doc, elements: [roof] }))).elements[0] as Roof;
    expect(back).toMatchObject({ type: 'roof', shape: 'gable', gables: [1], lowEdge: 2, pitchDeg: 30 });
    const mirrored = mapOutline(roof, (p) => ({ x: -p.x, y: p.y }), true);
    // The gable end stays on the same side of the house.
    const edgeMid = (r: Roof, i: number) => {
      const a = r.points[i];
      const b = r.points[(i + 1) % r.points.length];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    expect(edgeMid(mirrored, mirrored.gables![0]).x).toBeCloseTo(-edgeMid(roof, 1).x);
    expect(edgeMid(mirrored, mirrored.gables![0]).y).toBeCloseTo(edgeMid(roof, 1).y);
    const wider = withOverhang(roof, 457.2 + 304.8)!;
    const xs = (r: Roof) => r.points.map((p) => p.x);
    expect(
      (Math.max(...xs(wider)) - Math.min(...xs(wider)) - (Math.max(...xs(roof)) - Math.min(...xs(roof)))) / FT,
    ).toBeCloseTo(2, 3);
    // The gable end is still the same side, moved out by the extra foot.
    const centre = { x: 15 * FT, y: 10 * FT };
    const away = (p: { x: number; y: number }) => Math.hypot(p.x - centre.x, p.y - centre.y);
    expect(wider.gables).toHaveLength(1);
    expect(away(edgeMid(wider, wider.gables![0])) - away(edgeMid(roof, 1))).toBeCloseTo(1 * FT, 3);
  });

  it('read a pitch in degrees or as a rise in 12, and go to the DXF', () => {
    expect(readPitch('30')).toBe(30);
    expect(readPitch('22.5°')).toBe(22.5);
    expect(readPitch('6 in 12')).toBeCloseTo(26.565, 3);
    expect(readPitch('6/12')).toBeCloseTo(26.565, 3);
    expect(readPitch('80')).toBeNull();
    expect(readPitch('steep')).toBeNull();
    expect(riseIn12(30)).toBeCloseTo(6.928, 3);
    expect(pitchOfRise(12)).toBeCloseTo(45);
    expect(
      triangulate([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 2, y: 1 },
        { x: 0, y: 4 },
      ]),
    ).toHaveLength(3);
    const { s } = house('hip');
    s().roofOverHouse();
    const dxf = planToDxf(s().doc, {
      units: 'imperial',
      marlaSqFt: 225,
      showDimensions: false,
      showFurniture: false,
      showRoomLabels: false,
    });
    expect(dxf).toContain('A-ROOF-OTLN');
    expect(dxf).toContain('HIP ROOF 30%%d');
  });
});
