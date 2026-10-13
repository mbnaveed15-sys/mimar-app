import { describe, expect, it } from 'vitest';
import { splitPolygon, splitSolidsByLine } from './splitSolids';
import { divideWall } from './modify';
import { emptyDoc } from './storage';
import { createPlannerStore } from '../store/plannerStore';
import { DEFAULT_PREFS } from './prefs';
import type { Block, PlanDoc, PlanElement, Point, SketchLine, Slab, Wall } from '../types';
import { runLength } from './arc';

const area = (pts: Point[]) =>
  Math.abs(pts.reduce((s, a, i) => s + a.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * a.y, 0)) / 2;
const square: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const line = (x1: number, y1: number, x2: number, y2: number, extra: Partial<SketchLine> = {}): SketchLine => ({
  id: 'l',
  type: 'line',
  x1,
  y1,
  x2,
  y2,
  ...extra,
});

describe('layout lines split solids', () => {
  it('cuts an outline in two only when the line goes right across it', () => {
    const two = splitPolygon(square, { x: 40, y: -10 }, { x: 40, y: 110 });
    expect(two).toHaveLength(2);
    expect(two.map(area).sort((a, b) => a - b)).toEqual([4000, 6000]);
    // Part way in, along an edge, or outside: nothing.
    expect(splitPolygon(square, { x: 40, y: -10 }, { x: 40, y: 50 })).toHaveLength(1);
    expect(splitPolygon(square, { x: 0, y: -10 }, { x: 0, y: 110 })).toHaveLength(1);
    expect(splitPolygon(square, { x: 140, y: -10 }, { x: 140, y: 110 })).toHaveLength(1);
    // Corner to corner.
    const diag = splitPolygon(square, { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(diag.map(area)).toEqual([5000, 5000]);
  });

  it('cuts an L-shape crossed twice into three', () => {
    const l: Point[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    // A line across both arms of the L, through the gap between them.
    const parts = splitPolygon(l, { x: 120, y: -10 }, { x: -10, y: 120 });
    expect(parts).toHaveLength(3);
    expect(parts.reduce((s, p) => s + area(p), 0)).toBeCloseTo(area(l));
  });

  it('splits blocks and slabs on the same level, keeping their height, material and voids', () => {
    const block: Block = { id: 'b', type: 'block', points: square, heightMm: 900, shape: 'rect', material: 'm' };
    const slab: Slab = {
      id: 's',
      type: 'slab',
      points: square.map((p) => ({ x: p.x + 200, y: p.y })),
      thickness: 15,
      holes: [
        [
          { x: 280, y: 10 },
          { x: 290, y: 10 },
          { x: 290, y: 20 },
        ],
      ],
    };
    const upstairs: Block = { ...block, id: 'u', levelId: 'first' };
    const els: PlanElement[] = [block, slab, upstairs];
    const out = splitSolidsByLine(els, line(-10, 50, 400, 50));
    const blocks = out.filter((e): e is Block => e.type === 'block' && !e.levelId);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].id).toBe('b');
    expect(blocks.every((b) => b.heightMm === 900 && b.material === 'm' && b.shape === 'polygon')).toBe(true);
    const slabs = out.filter((e): e is Slab => e.type === 'slab');
    expect(slabs).toHaveLength(2);
    expect(slabs.filter((s) => s.holes?.length)).toHaveLength(1);
    expect(out.filter((e) => e.levelId === 'first')).toHaveLength(1);
    // A line through a void leaves that slab whole; a curved line cuts nothing.
    expect(splitSolidsByLine([slab], line(285, -10, 285, 110))).toEqual([slab]);
    expect(splitSolidsByLine(els, line(-10, 50, 400, 50, { bow: 20 }))).toBe(els);
  });

  it('happens when a layout line is drawn across a block, in one undo step', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = store.getState;
    s().commit((doc) => ({
      ...doc,
      elements: [{ id: 'b', type: 'block', points: square, heightMm: 0, shape: 'rect' }],
    }));
    s().addLine({ x: 50, y: -20 }, { x: 50, y: 120 });
    expect(s().doc.elements.filter((e) => e.type === 'block')).toHaveLength(2);
    expect(s().doc.elements.filter((e) => e.type === 'line')).toHaveLength(1);
    s().undo();
    expect(s().doc.elements).toHaveLength(1);
  });
});

describe('divide', () => {
  const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 23 };
  const doc = (el: PlanElement): PlanDoc => ({ ...emptyDoc(), elements: [el] });

  it('cuts a wall or line into equal parts', () => {
    const out = divideWall(doc(wall), 'w', { parts: 4 }).elements as Wall[];
    expect(out).toHaveLength(4);
    expect(out[0].id).toBe('w');
    expect(out.map((w) => w.x1)).toEqual([0, 250, 500, 750]);
    const lines = divideWall(doc(line(0, 0, 0, 300)), 'l', { parts: 3 }).elements as SketchLine[];
    expect(lines.map((l) => l.y2)).toEqual([100, 200, 300]);
  });

  it('cuts by a length from the start, the last piece taking what is left', () => {
    const out = divideWall(doc(wall), 'w', { every: 300 }).elements as Wall[];
    expect(out.map((w) => Math.round(w.x2 - w.x1))).toEqual([300, 300, 300, 100]);
    // Exactly divisible: no sliver at the end.
    expect(divideWall(doc(wall), 'w', { every: 250 }).elements).toHaveLength(4);
    // Longer than the wall: nothing to do.
    const d = doc(wall);
    expect(divideWall(d, 'w', { every: 2000 })).toBe(d);
  });

  it('divides a curved line into arcs on the same circle', () => {
    const arc = line(0, 0, 200, 0, { bow: 100 });
    const parts = divideWall(doc(arc), 'l', { parts: 2 }).elements as SketchLine[];
    expect(parts).toHaveLength(2);
    expect(parts[0].bow).toBeTruthy();
    expect(runLength(parts[0]) + runLength(parts[1])).toBeCloseTo(runLength(arc));
    // The middle of a half circle is its top.
    expect(parts[0].x2).toBeCloseTo(100);
    expect(Math.abs(parts[0].y2)).toBeCloseTo(100);
  });
});
