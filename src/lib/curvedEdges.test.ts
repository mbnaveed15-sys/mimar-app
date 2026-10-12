import { describe, expect, it } from 'vitest';
import { mapOutline } from '../geometry';
import { polygonArea } from '../rooms';
import type { Pad, Point, Slab } from '../types';
import {
  bendEdge,
  bendHoleEdge,
  curvedHoleEdges,
  curveOf,
  edgeMiddles,
  holeEdgeMiddles,
  holeOutline,
  isCurved,
  straightHoles,
  withCurve,
} from './curvedEdges';
import { quantities } from './quantities';
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

  describe('voids', () => {
    const hole = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
      { x: 100, y: 200 },
    ];
    const holed: Slab = { ...square, holes: [hole, hole.map((p) => ({ x: p.x + 150, y: p.y + 150 }))] };

    it('bends a void’s edge from its middle grip, and makes it straight again', () => {
      expect(holeEdgeMiddles(holed)).toHaveLength(8);
      near(holeEdgeMiddles(holed)[0].p, { x: 150, y: 100 });
      const bent = bendHoleEdge(holed, 0, 0, { x: 150, y: 60 });
      expect(bent.holes![0].length).toBeGreaterThan(8);
      expect(bent.holes![1]).toEqual(holed.holes![1]);
      expect(bent.holeCurves).toEqual([curveOf(holeOutline(bent, 0)), null]);
      expect(curvedHoleEdges(bent)).toBe(1);
      // The grip is now on the curve, and the void is bigger by the bulge.
      near(holeEdgeMiddles(bent)[0].p, { x: 150, y: 60 });
      expect(polygonArea(bent.holes![0])).toBeGreaterThan(100 * 100 + (2 / 3) * 100 * 40);
      // Back near the straight line it is straight; the button straightens every void.
      expect(bendHoleEdge(bent, 0, 0, { x: 150, y: 101 }, 5).holeCurves).toBeUndefined();
      const straight = straightHoles(bent);
      expect(straight.holes).toEqual(holed.holes);
      expect(straight.holeCurves).toBeUndefined();
    });

    it('keeps a curved void when the slab is moved or mirrored, and saves it', () => {
      const bent = bendHoleEdge(holed, 1, 2, { x: 300, y: 400 });
      const moved = mapOutline(bent, (p) => ({ x: p.x + 50, y: p.y - 20 }));
      expect(curvedHoleEdges(moved)).toBe(1);
      near(holeEdgeMiddles(moved)[6].p, { x: 350, y: 380 });
      const mirrored = mapOutline(bent, (p) => ({ x: -p.x, y: p.y }), true);
      expect(curvedHoleEdges(mirrored)).toBe(1);
      expect(polygonArea(mirrored.holes![1])).toBeCloseTo(polygonArea(bent.holes![1]), 3);
      const doc = normaliseDoc(JSON.parse(JSON.stringify({ ...emptyDoc(), elements: [bent] })));
      expect(doc.elements[0]).toEqual(bent);
      // A curve that no longer matches its void is left out.
      const broken = { ...bent, holeCurves: [null, { corners: hole, mids: [null, null, null, null] }] };
      expect(normaliseDoc(JSON.parse(JSON.stringify({ ...emptyDoc(), elements: [broken] }))).elements[0]).toEqual({
        ...bent,
        holeCurves: undefined,
      });
    });

    it('counts the void’s curved area off the slab’s concrete', () => {
      const flat = quantities({ ...emptyDoc(), elements: [holed] }, 3048).total.slabCft;
      const bent = quantities({ ...emptyDoc(), elements: [bendHoleEdge(holed, 0, 0, { x: 150, y: 60 })] }, 3048).total
        .slabCft;
      expect(bent).toBeLessThan(flat);
    });
  });
});
