import { describe, expect, it } from 'vitest';
import type { Plot, Point } from '../types';
import {
  buildableArea,
  guessSideKinds,
  insetPolygon,
  orientOutline,
  outlinePoints,
  outlineProblem,
  plotArea,
  plotSides,
  polygonArea,
  reversedSides,
  roadCorner,
  sideSetbacks,
  sideSlots,
  sideWallLines,
} from './plot';
import { plotRect } from './site';

const ft = (f: number) => (f * 304.8) / 10; // feet in plan units
const P = (x: number, y: number): Point => ({ x: ft(x), y: ft(y) });
const box = (pts: Point[]) => ({
  minX: Math.min(...pts.map((p) => p.x)),
  maxX: Math.max(...pts.map((p) => p.x)),
  minY: Math.min(...pts.map((p) => p.y)),
  maxY: Math.max(...pts.map((p) => p.y)),
});
const plot = (points: Point[], extra: Partial<Plot> = {}): Plot => ({
  id: 'p',
  type: 'plot',
  points,
  front: 2,
  setbacks: { front: 1524, rear: 609.6, sides: 0 },
  ...extra,
});

describe('any-shape setback line', () => {
  it('keeps a plot from before 1.30 exactly as it was', () => {
    // The old rule: front on the road edge, rear opposite, side 1 after the road, side 2 before it.
    const p = plot(plotRect({ x: 0, y: 0 }, P(25, 45)), {
      setbacks: { front: 1524, rear: 609.6, sides: 300, side2: 0 },
    });
    const b = box(buildableArea(p));
    expect(b.minY).toBeCloseTo(ft(2));
    expect(b.maxY).toBeCloseTo(ft(45) - ft(5));
    expect(b.minX).toBeCloseTo(30); // side 1 (the left, after the road going round)
    expect(b.maxX).toBeCloseTo(ft(25)); // side 2 (the right) has none
    expect(plotSides(p).map((s) => s.kind)).toEqual(['back', 'neighbour', 'road', 'neighbour']);
  });

  it('insets an L-shaped plot with a sharp inside corner', () => {
    // 40' wide at the road (bottom), 20' deep there; the left 20' goes back another 20'.
    const L = [P(0, 0), P(20, 0), P(20, 20), P(40, 20), P(40, 40), P(0, 40)];
    const pts = insetPolygon(
      L,
      L.map(() => ft(2)),
    ).points;
    expect(pts).toHaveLength(6);
    expect(polygonArea(pts)).toBeCloseTo(ft(36) * ft(16) + ft(16) * ft(20), 0);
    // The inside corner moves in diagonally: 2' from both of its sides.
    expect(pts.some((p) => Math.abs(p.x - ft(18)) < 0.01 && Math.abs(p.y - ft(22)) < 0.01)).toBe(true);
  });

  it('sets an angled side in square to itself', () => {
    // A plot whose right side leans: 30' at the road, 20' at the back.
    const pts = [P(0, 0), P(20, 0), P(30, 50), P(0, 50)];
    const inner = insetPolygon(pts, [0, ft(3), 0, 0]).points;
    // The leaning side moved 3' in, measured square to it.
    const a = inner[1];
    const b = inner[2];
    const along = { x: b.x - a.x, y: b.y - a.y };
    const l = Math.hypot(along.x, along.y);
    const dist = Math.abs(((pts[1].x - a.x) * along.y - (pts[1].y - a.y) * along.x) / l);
    expect(dist).toBeCloseTo(ft(3));
  });

  it('keeps a step in the back of the plot as a step in the building line', () => {
    const pts = [P(0, 0), P(20, 0), P(20, 1), P(30, 1), P(30, 40), P(0, 40)];
    const inner = insetPolygon(
      pts,
      pts.map(() => ft(5)),
    ).points;
    expect(inner).toHaveLength(6);
    expect(outlineProblem(inner)).toBeNull();
  });

  it('drops a short side the setbacks squeeze out', () => {
    // A 2' wide, 1' deep bump on the back of the plot, with 5' setbacks all round: it disappears.
    const pts = [P(0, 1), P(10, 1), P(10, 0), P(12, 0), P(12, 1), P(30, 1), P(30, 40), P(0, 40)];
    const inner = insetPolygon(
      pts,
      pts.map(() => ft(5)),
    );
    expect(box(inner.points).minY).toBeCloseTo(ft(6));
    expect(polygonArea(inner.points)).toBeCloseTo(ft(20) * ft(29));
    // The bump's three sides are gone; the two back sides either side of it line up.
    expect([...inner.edges].sort()).toEqual([0, 4, 5, 6, 7]);
  });

  it('keeps the bigger part where a narrow neck pinches the plot in two', () => {
    // Two 20' squares joined by a 4' neck, 3' setbacks: the neck closes.
    const pts = [
      P(0, 0),
      P(20, 0),
      P(20, 8),
      P(30, 8),
      P(30, 0),
      P(60, 0),
      P(60, 30),
      P(30, 30),
      P(30, 12),
      P(20, 12),
      P(20, 20),
      P(0, 20),
    ];
    const inner = insetPolygon(
      pts,
      pts.map(() => ft(3)),
    ).points;
    expect(inner.length).toBeGreaterThanOrEqual(3);
    expect(outlineProblem(inner)).toBeNull();
    // The bigger (30' × 30') part is the one kept.
    expect(box(inner).minX).toBeGreaterThan(ft(30));
  });

  it('leaves nothing when the setbacks swallow the plot', () => {
    const pts = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)];
    expect(
      insetPolygon(
        pts,
        pts.map(() => ft(6)),
      ).points,
    ).toEqual([]);
  });

  it('works the same whichever way round the corners go', () => {
    const cw = [P(0, 0), P(20, 0), P(20, 30), P(0, 30)];
    const a = insetPolygon(cw, [ft(1), ft(2), ft(3), ft(4)]).points;
    const { points: turned, edge } = orientOutline([...cw].reverse());
    expect(turned).toEqual(cw);
    const dist = [ft(1), ft(2), ft(3), ft(4)];
    const b = insetPolygon(
      [...cw].reverse(),
      [...cw].reverse().map((_, i) => dist[(3 - 1 - i + 4) % 4]),
    ).points;
    expect(polygonArea(b)).toBeCloseTo(polygonArea(a));
    expect(edge(0)).toBe(2);
  });
});

describe('plot sides', () => {
  it('guesses the road, the back and the neighbours of any shape', () => {
    const L = [P(0, 0), P(20, 0), P(20, 20), P(40, 20), P(40, 40), P(0, 40)];
    // Road along the bottom (edge 4: (40,40) → (0,40)); the two tops face away from it.
    expect(guessSideKinds(L, 4)).toEqual(['back', 'neighbour', 'back', 'neighbour', 'road', 'neighbour']);
  });

  it('gives side 1 to the sides after the road going round, side 2 to the others', () => {
    const L = [P(0, 0), P(20, 0), P(20, 20), P(40, 20), P(40, 40), P(0, 40)];
    const p = plot(L, { front: 4 });
    expect(sideSlots(p)).toEqual(['rear', 'side2', 'rear', 'side2', 'front', 'side1']);
  });

  it('puts a second road side on its side setback, marked provisional', () => {
    const p = plot(plotRect({ x: 0, y: 0 }, P(40, 50)), {
      setbacks: { front: 1524, rear: 609.6, sides: 914.4, side2: 609.6 },
      sideList: [{ kind: 'back' }, { kind: 'road' }, { kind: 'road' }, { kind: 'neighbour' }],
    });
    const sb = sideSetbacks(p);
    expect(sb[1]).toMatchObject({ mm: 609.6, slot: 'side2', provisional: true });
    expect(sb[2]).toMatchObject({ mm: 1524, slot: 'front', provisional: false });
    // A typed setback wins and isn't provisional.
    const typed = sideSetbacks({
      ...p,
      sideList: p.sideList!.map((s, i) => (i === 1 ? { ...s, setbackMm: 1524 } : s)),
    });
    expect(typed[1]).toMatchObject({ mm: 1524, typed: true, provisional: false });
  });

  it('maps sides when a mirror turns the corners round', () => {
    const p = plot(plotRect({ x: 0, y: 0 }, P(20, 30)), {
      sideList: [{ kind: 'back' }, { kind: 'open' }, { kind: 'road' }, { kind: 'neighbour' }],
    });
    const r = reversedSides(p);
    const pts = [...p.points].reverse();
    // The road edge (bottom) is still the road, and the open side still the right-hand one.
    const road = r.sideList![r.front];
    expect(road.kind).toBe('road');
    const a = pts[r.front];
    const b = pts[(r.front + 1) % 4];
    expect(a.y).toBeCloseTo(ft(30));
    expect(b.y).toBeCloseTo(ft(30));
  });
});

describe('corner plots', () => {
  const corner = plot(plotRect({ x: 0, y: 0 }, P(40, 50)), {
    setbacks: { front: 1524, rear: 609.6, sides: 914.4 },
    sideList: [{ kind: 'back' }, { kind: 'road' }, { kind: 'road' }, { kind: 'neighbour' }],
  });

  it('finds the corner between the two roads', () => {
    // Road 2 is the bottom (edge 2); road 1 the right (edge 1): they meet at corner 2 (bottom right).
    expect(roadCorner(corner)).toBe(2);
  });

  it('cuts that corner off when the splay is on', () => {
    const cut = { ...corner, splay: { sizeMm: 3048 } }; // 10'
    const pts = outlinePoints(cut);
    expect(pts).toHaveLength(5);
    expect(plotArea(cut)).toBeCloseTo(ft(40) * ft(50) - (ft(10) * ft(10)) / 2);
    // A 10' cut reaches past the 3' and 5' setbacks' corner, so the building line is cut too.
    expect(buildableArea(cut)).toHaveLength(5);
    // A 5' cut doesn't: the building line keeps its corner.
    const small = buildableArea({ ...corner, splay: { sizeMm: 1524 } });
    expect(small).toHaveLength(4);
    expect(polygonArea(small)).toBeCloseTo(polygonArea(buildableArea(corner)));
  });

  it('builds a wall along the cut corner too', () => {
    const wall = { heightMm: 2134, thicknessMm: 228.6 };
    const cut = {
      ...corner,
      splay: { sizeMm: 3048 },
      sideList: corner.sideList!.map((s) => ({ ...s, wall })),
    };
    const lines = sideWallLines(cut);
    expect(lines.map((l) => l.side)).toEqual([0, 1, 'splay', 2, 3]);
    // Each wall's centre line is half its thickness inside its side.
    const top = lines[0];
    expect(top.a.y).toBeCloseTo(11.43);
  });

  it('leaves out the walls of sides with none', () => {
    const lines = sideWallLines({
      ...corner,
      sideList: corner.sideList!.map((s, i) => (i === 3 ? s : { ...s, wall: { heightMm: 2134, thicknessMm: 114.3 } })),
    });
    expect(lines.map((l) => l.side)).toEqual([0, 1, 2]);
  });
});

describe('plot outlines', () => {
  it('refuses outlines that cross themselves', () => {
    expect(outlineProblem([P(0, 0), P(10, 10), P(10, 0), P(0, 10)])).toMatch(/cross/);
    expect(outlineProblem([P(0, 0), P(10, 0)])).toMatch(/three corners/);
    expect(outlineProblem([P(0, 0), P(10, 0), P(20, 0)])).toMatch(/no area/);
    expect(outlineProblem([P(0, 0), P(10, 0), P(10, 10), P(0, 10)])).toBeNull();
  });
});
