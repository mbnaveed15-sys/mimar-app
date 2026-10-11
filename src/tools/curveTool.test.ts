import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { createPlannerStore } from '../store/plannerStore';
import { applyMeasure, hover, measureReadout, press, release } from './controller';
import { finishStep } from './finish';
import { arcOf, pointAlong, projectOnWall, radiusOf, runLength } from '../lib/arc';
import { endDirection } from '../lib/curves';
import { mirrorItems, scaleItems } from '../lib/modify';
import { planToDxf } from '../lib/exportDxf';
import { faceOf, pushPull } from '../lib/pushPull';
import { infer } from '../lib/inference';
import type { PlanDoc, SketchLine, Wall } from '../types';
import { roomAreaSqMm } from '../rooms';

function setup() {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  store.getState().setViewport({ width: 1000, height: 800 });
  const s = store.getState;
  s().setTool('curve');
  // Off the grid, so the points land where they are clicked.
  s().setGrid({ snap: false });
  const click = (x: number, y: number) => {
    hover(store, { x, y });
    press(store, { x, y });
    release(store, false);
  };
  const walls = () => s().doc.elements.filter((el): el is Wall => el.type === 'wall');
  const lines = () => s().doc.elements.filter((el): el is SketchLine => el.type === 'line');
  return { store, s, click, walls, lines };
}

describe('the Curve tool', () => {
  it('draws an arc through three points, carrying on from its end', () => {
    const { store, s, click, walls } = setup();
    s().setSite({ curveMode: 'arc3' });
    click(0, 0);
    click(200, -100);
    expect(measureReadout(s()).label).toBe('Radius');
    click(400, 0);
    expect(walls()).toHaveLength(1);
    expect(projectOnWall(walls()[0], { x: 200, y: -100 }).dist).toBeLessThan(0.01);
    // The next arc starts at its end.
    expect(s().draft).toMatchObject({ type: 'curve', points: [{ x: 400, y: 0 }] });
    click(500, 100);
    click(400, 200);
    expect(walls()).toHaveLength(2);
    expect(walls()[1]).toMatchObject({ x1: 400, y1: 0, x2: 400, y2: 200 });
    // Undo takes back the last arc and carries on from where it started.
    s().undo();
    expect(walls()).toHaveLength(1);
    expect(s().draft).toMatchObject({ type: 'curve', points: [{ x: 400, y: 0 }] });
    expect(finishStep(store)).toBe(true);
    expect(s().draft).toBeNull();
  });

  it('draws an arc by its ends and a bend, or a typed radius', () => {
    const { store, s, click, walls } = setup();
    s().setSite({ curveMode: 'arc' });
    click(0, 0);
    click(400, 0);
    hover(store, { x: 200, y: 150 });
    expect(applyMeasure(store, `40'`)).toBe(true);
    expect(radiusOf(walls()[0])).toBeCloseTo(1219.2, 3);
    expect(walls()[0].bow).toBeGreaterThan(0);
  });

  it('draws an arc round a centre, by a typed radius and angle', () => {
    const { store, s, click, walls } = setup();
    s().setSite({ curveMode: 'centre' });
    click(0, 0);
    hover(store, { x: 100, y: 0 });
    expect(applyMeasure(store, '3m')).toBe(true);
    expect(measureReadout(s()).label).toBe('Angle');
    expect(applyMeasure(store, '90')).toBe(true);
    const [w] = walls();
    expect(arcOf(w)!.r).toBeCloseTo(300, 6);
    expect(Math.abs(arcOf(w)!.sweep)).toBeCloseTo(Math.PI / 2, 6);
    // Counter-clockwise on screen (up is -y): from (300, 0) to (0, -300).
    expect(w.x2).toBeCloseTo(0, 6);
    expect(w.y2).toBeCloseTo(-300, 6);
  });

  it('sweeps a centre arc past a half circle with the pointer', () => {
    const { store, s, click, walls } = setup();
    s().setSite({ curveMode: 'centre' });
    click(0, 0);
    click(300, 0);
    for (let i = 1; i <= 27; i++) {
      const a = (i / 36) * Math.PI * 2;
      hover(store, { x: Math.cos(a) * 250, y: Math.sin(a) * 250 });
    }
    press(store, { x: 0, y: -250 });
    expect(Math.abs(arcOf(walls()[0])!.sweep)).toBeGreaterThan(Math.PI * 1.4);
  });

  it('carries on smoothly from the end of a wall with tangent arcs', () => {
    const { s, click, walls } = setup();
    s().addWall({ x: 0, y: 0 }, { x: 300, y: 0 });
    s().setSite({ curveMode: 'tangent' });
    click(300, 0);
    click(500, 200);
    click(500, 500);
    const [, first, second] = walls();
    const d0 = endDirection(first, false);
    expect(d0.x).toBeCloseTo(1, 6);
    expect(d0.y).toBeCloseTo(0, 6);
    const a = endDirection(first, true);
    const b = endDirection(second, false);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
  });

  it('draws a circle of walls with the room inside', () => {
    const { store, s, click, walls } = setup();
    s().setSite({ curveMode: 'circle' });
    click(0, 0);
    expect(applyMeasure(store, `10'`)).toBe(true);
    expect(walls()).toHaveLength(2);
    expect(walls().every((w) => Math.abs(radiusOf(w)! - 304.8) < 1e-6)).toBe(true);
    const [room] = s().doc.rooms;
    expect(room).toBeDefined();
    // About π × 10'² (to the inside face of the walls, so a little less).
    expect(roomAreaSqMm(room) / 92903.04).toBeGreaterThan(250);
    expect(roomAreaSqMm(room) / 92903.04).toBeLessThan(Math.PI * 100);
    // One step to undo.
    s().undo();
    expect(walls()).toHaveLength(0);
    expect(s().doc.rooms).toHaveLength(0);
  });

  it('drags out a circle, and draws an oval in a box by typed sizes', () => {
    const { store, s, walls } = setup();
    s().setSite({ curveMode: 'circle' });
    hover(store, { x: 0, y: 0 });
    press(store, { x: 0, y: 0 });
    hover(store, { x: 200, y: 0 });
    release(store, true);
    expect(walls()).toHaveLength(2);
    s().setSite({ curveMode: 'oval' });
    press(store, { x: 1000, y: 0 });
    release(store, false);
    hover(store, { x: 1100, y: 100 });
    expect(applyMeasure(store, `20',12'`)).toBe(true);
    const oval = walls().slice(2);
    expect(oval).toHaveLength(4);
    const xs = oval.flatMap((w) => [w.x1, w.x2]);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1000 - 1e-6);
    expect(s().doc.rooms).toHaveLength(2);
  });

  it('draws a freeform curve through clicked points, closing it on the first', () => {
    const { s, click, walls } = setup();
    s().setSite({ curveMode: 'freeform' });
    click(0, 0);
    click(200, -100);
    click(400, 0);
    click(200, 200);
    click(0, 0);
    expect(s().draft).toBeNull();
    // A pair of arcs between each two points, round all four.
    expect(walls()).toHaveLength(8);
    for (const p of [
      { x: 200, y: -100 },
      { x: 400, y: 0 },
      { x: 200, y: 200 },
    ])
      expect(Math.min(...walls().map((w) => projectOnWall(w, p).dist))).toBeLessThan(0.01);
    expect(s().doc.rooms).toHaveLength(1);
  });

  it('makes layout lines instead of walls when asked, and they turn into curved walls', () => {
    const { s, click, walls, lines } = setup();
    s().setSite({ curveMode: 'arc3', curveMake: 'line' });
    click(0, 0);
    click(200, -100);
    click(400, 0);
    expect(walls()).toHaveLength(0);
    expect(lines()).toHaveLength(1);
    expect(lines()[0].bow).toBeDefined();
    s().setSelection([lines()[0].id]);
    s().linesToWalls();
    expect(walls()).toHaveLength(1);
    expect(projectOnWall(walls()[0], { x: 200, y: -100 }).dist).toBeLessThan(0.01);
  });
});

describe('curved layout lines', () => {
  const line: SketchLine = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 400, y2: 0, bow: 100 };
  const doc: PlanDoc = { ...emptyDoc(), elements: [line] };

  it('keep their curve through saving, mirroring and scaling', () => {
    expect(normaliseDoc(JSON.parse(JSON.stringify(doc))).elements[0]).toMatchObject({ bow: 100 });
    const mirrored = mirrorItems(doc, ['l'], { x: 0, y: 200 }, { x: 400, y: 200 }, true).doc.elements[0] as SketchLine;
    // It bows down to y = 100; mirrored across y = 200 it bows up from y = 400 to y = 300.
    expect(pointAlong(line, 0.5).y).toBeCloseTo(100, 6);
    expect(mirrored.y1).toBeCloseTo(400, 6);
    expect(pointAlong(mirrored, 0.5).y).toBeCloseTo(300, 6);
    const scaled = scaleItems(doc, ['l'], { x: 0, y: 0 }, 2).elements[0] as SketchLine;
    expect(scaled.bow).toBe(200);
  });

  it('go to the DXF as true arcs and are snapped to by their middle and centre', () => {
    const dxf = planToDxf(doc, {
      units: 'metric',
      marlaSqFt: 225,
      showDimensions: true,
      showFurniture: true,
      showRoomLabels: true,
    });
    // Bowing 100 over 400: a bulge of 0.5 (twice the bow over the length), bending below on the drawing.
    expect(dxf).toMatch(/A-ANNO-LAYT[\s\S]*\r\n42\r\n0\.5\r\n/);
    const at = (x: number, y: number) =>
      infer({ x, y }, { walls: [], lines: [line], tolerance: 10, from: null, grid: null, lock: null });
    expect(at(201, 98)).toMatchObject({ kind: 'midpoint' });
    const arc = arcOf(line)!;
    expect(at(arc.cx + 3, arc.cy)).toMatchObject({ kind: 'centre' });
    expect(
      at(arc.cx + arc.r * Math.cos(arc.a0 + arc.sweep / 4) + 2, arc.cy + arc.r * Math.sin(arc.a0 + arc.sweep / 4)).kind,
    ).toBe('on-line');
  });
});

describe('rounded rectangles and Push/Pull on curves', () => {
  it('rounds the Rectangle tool corners when asked', () => {
    const { store, s, walls } = setup();
    s().setTool('rectangle');
    s().setSite({ rectRadiusMm: 600 });
    press(store, { x: 0, y: 0 });
    release(store, false);
    hover(store, { x: 400, y: 300 });
    press(store, { x: 400, y: 300 });
    expect(walls()).toHaveLength(8);
    expect(
      walls()
        .filter((w) => radiusOf(w))
        .every((w) => Math.abs(radiusOf(w)! - 60) < 1e-6),
    ).toBe(true);
    expect(s().doc.rooms).toHaveLength(1);
  });

  it('pushes the side of a curved wall, keeping its centre', () => {
    const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 400, y2: 0, bow: 200, thickness: 23 };
    const doc: PlanDoc = { ...emptyDoc(), elements: [wall] };
    const arc = arcOf(wall)!;
    // A half circle bowing down the plan (+y) round (200, 0): grab its outside face at the bottom.
    const out0 = { x: 200, y: 200 + 11.5 };
    const face = faceOf(wall, [0, 0, 1], [out0.x / 100, 1, out0.y / 100]);
    expect(face).toMatchObject({ part: 'side' });
    const out = pushPull(doc, 'w', face!, 100, { wallHeightMm: 3000 }).doc.elements[0] as Wall;
    expect(out.thickness).toBeCloseTo(33, 6);
    const next = arcOf(out)!;
    expect(next.cx).toBeCloseTo(arc.cx, 6);
    expect(next.cy).toBeCloseTo(arc.cy, 6);
    // The inside face stays put: the centre line moves out by half the push.
    expect(next.r).toBeCloseTo(arc.r + 5, 6);
    // An end pushed out runs on round the circle.
    const longer = pushPull(doc, 'w', { part: 'end', end: 2 }, 500, { wallHeightMm: 3000 }).doc.elements[0] as Wall;
    expect(runLength(longer)).toBeCloseTo(runLength(wall) + 50, 6);
    expect(radiusOf(longer)).toBeCloseTo(arc.r, 6);
  });
});
