import { describe, expect, it } from 'vitest';
import { mapOutline } from '../geometry';
import { polygonArea } from '../rooms';
import type { Pad, Point, Slab } from '../types';
import { bendEdge, curveOf, edgeMiddles, isCurved, withCurve } from './curvedEdges';
import { emptyDoc, normaliseDoc } from './storage';

const square: Slab = {
  id: 's',
  type: 'slab',
  thickness: 15,
  points: [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 400 },
    { x: 0, y: 400 },
  ],
};

const near = (a: Point, b: Point) => {
  expect(a.x).toBeCloseTo(b.x, 3);
  expect(a.y).toBeCloseTo(b.y, 3);
};

describe('curved edges', () => {
  it('bends an edge through the point dragged to, keeping the corners', () => {
    const bent = bendEdge(square, 0, { x: 200, y: -100 });
    expect(isCurved(bent.curve)).toBe(true);
    expect(bent.points.length).toBeGreaterThan(8);
    expect(curveOf(bent)).toBe(bent.curve);
    // The grip sits where it was dragged; the other edges stay straight.
    near(edgeMiddles(bent)[0], { x: 200, y: -100 });
    near(edgeMiddles(bent)[1], { x: 400, y: 200 });
    // The outline bulges out: more area than the square.
    expect(polygonArea(bent.points)).toBeGreaterThan(400 * 400);
  });

  it('goes straight again close to the straight line, or with every edge straightened', () => {
    const bent = bendEdge(square, 0, { x: 200, y: -100 });
    const back = bendEdge(bent, 0, { x: 200, y: -2 }, 5);
    expect(back.curve).toBeUndefined();
    expect(back.points).toEqual(square.points);
    const c = curveOf(bent)!;
    expect(withCurve(bent, { ...c, mids: c.mids.map(() => null) }).points).toEqual(square.points);
  });

  it('keeps its curves when moved and mirrored', () => {
    const bent = bendEdge(square, 0, { x: 200, y: -100 });
    const moved = mapOutline(bent, (p) => ({ x: p.x + 50, y: p.y + 20 }));
    near(edgeMiddles(moved)[0], { x: 250, y: -80 });
    // Mirrored across the line x = 0: the outline is listed the other way round.
    const mirrored = mapOutline(bent, (p) => ({ x: -p.x, y: p.y }), true);
    expect(isCurved(mirrored.curve)).toBe(true);
    const mids = edgeMiddles(mirrored);
    expect(mids.some((m) => Math.abs(m.x + 200) < 1e-6 && Math.abs(m.y + 100) < 1e-6)).toBe(true);
    expect(polygonArea(mirrored.points)).toBeCloseTo(polygonArea(bent.points), 3);
  });

  it('drops the curve once the outline was changed another way', () => {
    const bent = bendEdge(square, 1, { x: 500, y: 200 });
    const stretched = { ...bent, points: bent.points.map((p, i) => (i === 0 ? { x: -50, y: -50 } : p)) };
    expect(curveOf(stretched)).toBeNull();
    expect(edgeMiddles(stretched)).toHaveLength(stretched.points.length);
  });

  it('saves and opens curved slabs and levelled areas', () => {
    const slab = bendEdge(square, 2, { x: 200, y: 500 });
    const pad: Pad = bendEdge({ id: 'p', type: 'pad', zMm: 300, points: square.points }, 3, { x: -80, y: 200 });
    const doc = normaliseDoc(JSON.parse(JSON.stringify({ ...emptyDoc(), elements: [slab, pad] })));
    expect(doc.elements.find((e) => e.id === 's')).toEqual(slab);
    expect(doc.elements.find((e) => e.id === 'p')).toEqual(pad);
    // A curve that no longer matches its outline is left out, keeping the outline as drawn.
    const broken = { ...slab, curve: { ...slab.curve!, corners: slab.curve!.corners.slice(1) } };
    const opened = normaliseDoc(JSON.parse(JSON.stringify({ ...emptyDoc(), elements: [broken] })));
    expect((opened.elements[0] as Slab).curve).toBeUndefined();
    expect((opened.elements[0] as Slab).points).toEqual(slab.points);
  });
});
