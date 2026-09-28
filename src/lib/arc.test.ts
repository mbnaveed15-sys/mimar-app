import { describe, expect, it } from 'vitest';
import { wallPolygon } from '../walls';
import { polygonArea, wallFaces } from '../rooms';
import { DEFAULT_PREFS } from './prefs';
import { emptyDoc } from './storage';
import { createPlannerStore } from '../store/plannerStore';
import { applyMeasure, hover, measureReadout, press, release } from '../tools/controller';
import { finishStep } from '../tools/finish';
import { infer } from './inference';
import { quantities } from './quantities';
import { planToDxf } from './exportDxf';
import { offsetWall as offsetItem, breakWall, mirrorItems, scaleItems } from './modify';
import { placeOnWallPiece } from './openingPlace';
import type { Opening, PlanDoc, Wall } from '../types';
import {
  arcOf,
  bowForRadius,
  bowThrough,
  offsetWall,
  partOf,
  placeOnArc,
  pointAlong,
  projectOnWall,
  reversed,
  runLength,
  straightPieces,
  wallPath,
} from './arc';

// A straight wall along the top of a D, and a half circle (radius 500) bowing up from it.
const flat: Wall = { id: 'a', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 20 };
const curve: Wall = { id: 'b', type: 'wall', x1: 1000, y1: 0, x2: 0, y2: 0, bow: 500, thickness: 20 };
const dist = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
const centre = { x: 500, y: 0 };

describe('curved walls', () => {
  it('knows its circle, its length along the curve and its middle', () => {
    const arc = arcOf(curve)!;
    expect(arc.r).toBeCloseTo(500);
    expect(Math.abs(arc.sweep)).toBeCloseTo(Math.PI);
    expect(runLength(curve)).toBeCloseTo(500 * Math.PI);
    // Its bow is towards its side A, the left normal of its direction: up the screen here.
    expect(pointAlong(curve, 0.5).x).toBeCloseTo(500);
    expect(pointAlong(curve, 0.5).y).toBeCloseTo(-500);
    expect(arcOf(flat)).toBeNull();
    // Every point of its centre line is on the circle, and fine enough to be within 2 mm of it.
    const path = wallPath(curve);
    for (const p of path) expect(dist(p, centre)).toBeCloseTo(500);
    for (let i = 0; i + 1 < path.length; i++) {
      const mid = { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 };
      expect(500 - dist(mid, centre)).toBeLessThan(0.2);
    }
  });

  it('encloses a room with the area of the curve', () => {
    const faces = wallFaces([flat, curve]);
    expect(faces).toHaveLength(1);
    expect(polygonArea(faces[0]) / ((Math.PI * 500 * 500) / 2)).toBeCloseTo(1, 2);
  });

  it('bends through a point, or to a radius', () => {
    expect(bowThrough(curve, { x: 500, y: -500 })).toBeCloseTo(500);
    const a = Math.PI / 4;
    expect(bowThrough(curve, { x: 500 + 500 * Math.cos(a), y: -500 * Math.sin(a) })).toBeCloseTo(500);
    // A point on the other side bows it the other way.
    expect(bowThrough(curve, { x: 500, y: 100 })).toBeCloseTo(-100);
    expect(bowThrough(curve, { x: 300, y: 0 })).toBe(0);
    expect(bowForRadius(curve, 500)).toBeCloseTo(500);
    expect(bowForRadius(curve, 1000)).toBeCloseTo(1000 - Math.sqrt(1000 * 1000 - 500 * 500));
    expect(bowForRadius({ ...curve, bow: -3 }, 1000)).toBeLessThan(0);
  });

  it('offsets to an arc on the same centre, splits into arcs, and turns round', () => {
    const out = offsetWall(curve, 20);
    expect(arcOf(out)!.r).toBeCloseTo(520);
    expect(arcOf(out)!.cx).toBeCloseTo(500);
    const inside = offsetWall(curve, -20);
    expect(arcOf(inside)!.r).toBeCloseTo(480);
    const half = partOf(curve, 0, 0.5);
    expect(arcOf(half)!.r).toBeCloseTo(500);
    expect(half.x2).toBeCloseTo(500);
    expect(half.y2).toBeCloseTo(-500);
    expect(runLength(half)).toBeCloseTo(250 * Math.PI);
    const back = reversed(curve);
    expect(pointAlong(back, 0.5).y).toBeCloseTo(-500);
    expect(pointAlong(back, 0.25).x).toBeCloseTo(pointAlong(curve, 0.75).x);
    const p = projectOnWall(curve, { x: 500, y: -600 });
    expect(p.t).toBeCloseTo(0.5);
    expect(p.dist).toBeCloseTo(100);
  });

  it('is drawn as its two faces round the curve, closing its joins', () => {
    const poly = wallPolygon(curve, [flat, curve]);
    // Joined at both ends: each end reaches on by half the thickness, past the circle's ends.
    const radii = poly.map((p) => dist(p, centre));
    expect(Math.max(...radii)).toBeGreaterThan(510 - 1e-6);
    expect(Math.min(...radii)).toBeLessThan(490 + 1e-6);
    expect(poly.some((p) => p.y > 5)).toBe(true);
  });

  it('holds a door flat across the curve, in a straight piece of its own', () => {
    const at = placeOnArc(curve, { x: 500, y: -520 }, 100)!;
    expect(at.width).toBeCloseTo(100);
    expect(Math.abs(Math.sin((at.angle * Math.PI) / 180))).toBeCloseTo(0);
    // Its ends are on the arc, so its middle is a little inside it.
    const half = { x: Math.cos((at.angle * Math.PI) / 180) * 50, y: Math.sin((at.angle * Math.PI) / 180) * 50 };
    expect(dist({ x: at.x + half.x, y: at.y + half.y }, centre)).toBeCloseTo(500);
    const door: Opening = { id: 'd', type: 'door', wallId: 'b', ...at };
    const pieces = straightPieces(curve, [door], 10);
    const own = pieces.filter((p) => p.openings.length);
    expect(own).toHaveLength(1);
    expect(dist({ x: own[0].wall.x1, y: own[0].wall.y1 }, { x: own[0].wall.x2, y: own[0].wall.y2 })).toBeCloseTo(100);
    // The pieces run end to end round the curve, each joint closed on the outside.
    for (let i = 0; i + 1 < pieces.length; i++) {
      expect(pieces[i].wall.x2).toBeCloseTo(pieces[i + 1].wall.x1);
      expect(pieces[i].end).toBeGreaterThan(0);
    }
    expect(pieces[0].start).toBeUndefined();
  });

  it('places doors along the curve like a straight wall, clear of the corners', () => {
    const ctx = {
      walls: [flat, curve],
      openings: [],
      gap: 15,
      grid: null,
      tolerance: 5,
      fmt: (u: number) => `${u}`,
      noun: 'door',
    };
    const at = placeOnWallPiece(curve, { x: 500, y: -500 }, 100, ctx);
    expect(at.ok).toBe(true);
    if (!at.ok) return;
    expect(at.snap).toBe('wall-centre');
    expect(at.x).toBeCloseTo(500);
    expect(at.y).toBeLessThan(-490);
    const nearEnd = placeOnWallPiece(curve, { x: 990, y: -5 }, 100, ctx);
    expect(nearEnd.ok && nearEnd.s).toBeGreaterThanOrEqual(10 + 15 + 50 - 1e-6);
  });

  it('snaps to its ends, its middle, and on its curve', () => {
    const opts = { walls: [flat, curve], tolerance: 10, grid: 10 };
    expect(infer({ x: 503, y: -497 }, opts)).toMatchObject({ kind: 'midpoint' });
    const on = infer({ x: 500 + 500 * Math.cos(1) + 2, y: -500 * Math.sin(1) - 2 }, opts);
    expect(on.kind).toBe('on-wall');
    expect(dist(on.point, centre)).toBeCloseTo(500);
  });

  it('is measured along the curve, and splits, offsets, mirrors and scales as a curve', () => {
    const doc: PlanDoc = { ...emptyDoc(), plinthMm: 0, elements: [flat, curve] };
    const q = quantities(doc, 3048).floors[0];
    const ft = 1 / 30.48;
    const expected = (runLength(flat) + runLength(curve)) * ft * 20 * ft * (3048 / 304.8);
    expect(q.brickworkCft).toBeCloseTo(expected, 1);

    const split = breakWall(doc, 'b', 0.5);
    const halves = split.elements.filter((el): el is Wall => el.type === 'wall' && el.id !== 'a');
    expect(halves).toHaveLength(2);
    for (const h of halves) expect(arcOf(h)!.r).toBeCloseTo(500);

    const copy = offsetItem(curve, 30, { x: 500, y: -900 });
    expect(arcOf(copy)!.r).toBeCloseTo(530);

    const mirrored = mirrorItems(doc, ['b'], { x: 0, y: 100 }, { x: 1000, y: 100 }, false);
    const m = mirrored.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === mirrored.ids[0])!;
    expect(pointAlong(m, 0.5).y).toBeCloseTo(700);

    const scaled = scaleItems(doc, ['b'], { x: 0, y: 0 }, 2).elements.find((el) => el.id === 'b') as Wall;
    expect(arcOf(scaled)!.r).toBeCloseTo(1000);
  });

  it('goes to the DXF as true arcs', () => {
    const doc: PlanDoc = { ...emptyDoc(), elements: [flat, curve] };
    const dxf = planToDxf(doc, {
      units: 'metric',
      marlaSqFt: 225,
      showDimensions: true,
      showFurniture: true,
      showRoomLabels: true,
    });
    // Bulges on the wall's outline, and an arc for its dimension.
    expect(dxf).toMatch(/\r\n42\r\n-?1(\.0+)?\r\n/);
    expect(dxf).toContain('\r\nARC\r\n');
  });

  it('is drawn with the Arc wall option: start, end, then a point it passes through (or a typed radius)', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    store.getState().setViewport({ width: 1000, height: 800 });
    const s = store.getState;
    s().setTool('wall');
    s().setSite({ wallArc: true });
    const click = (x: number, y: number) => {
      press(store, { x, y });
      release(store, false);
    };
    click(0, 0);
    click(400, 0);
    expect(s().draft).toMatchObject({ type: 'wall', bend: true });
    hover(store, { x: 200, y: -200 });
    expect(measureReadout(s()).label).toBe('Radius');
    click(200, -200);
    const [first] = s().doc.elements.filter((el): el is Wall => el.type === 'wall');
    // Up the screen is its side B, going left to right.
    expect(first.bow).toBeCloseTo(-200, 0);
    expect(projectOnWall(first, { x: 200, y: -200 }).dist).toBeLessThan(0.01);
    // It carries on from the end: the next one by a typed radius, bowing the way the pointer went.
    click(400, 400);
    hover(store, { x: 450, y: 200 });
    expect(applyMeasure(store, `40'`)).toBe(true);
    const second = s().doc.elements.filter((el): el is Wall => el.type === 'wall')[1];
    expect(arcOf(second)!.r).toBeCloseTo(1219.2);
    expect(second.bow).toBeLessThan(0);
    // Enter while bending puts it in as it is and stops.
    click(0, 400);
    hover(store, { x: 200, y: 450 });
    expect(finishStep(store)).toBe(true);
    expect(s().doc.elements.filter((el) => el.type === 'wall')).toHaveLength(3);
    expect(s().draft).toBeNull();
  });
});
