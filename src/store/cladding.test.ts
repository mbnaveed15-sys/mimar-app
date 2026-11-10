import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { quantities } from '../lib/quantities';
import { estimate, STARTER_RATES, STARTER_RATIOS } from '../lib/estimate';
import { planToDxf } from '../lib/exportDxf';
import { planToIfc } from '../lib/exportIfc';
import { planCheck } from '../lib/planCheck';
import { plotRect } from '../lib/site';
import { claddingBands, claddingPieces, outsideSide } from '../lib/cladding';
import { pointInPolygon } from '../geometry';
import { buildModel } from '../three/model';
import { wallsOf } from '../walls';
import { createPlannerStore } from './plannerStore';
import type { Opening, PlanDoc, Plot, Wall } from '../types';

const WALL = 3048;
const FT = 30.48;
const H = 4.5 * 2.54; // half a 9" wall, plan units

/** A 30' × 20' house of 9" walls (centre lines at x0, y0), with a window in the south wall. */
function house(x0 = 0, y0 = 0, plot?: Plot, w = 30 * FT, d = 20 * FT): PlanDoc {
  const doc = emptyDoc();
  const c = [
    { x: x0, y: y0 },
    { x: x0 + w, y: y0 },
    { x: x0 + w, y: y0 + d },
    { x: x0, y: y0 + d },
  ];
  const walls: Wall[] = c.map((p, i) => ({
    id: `w${i}`,
    type: 'wall',
    x1: p.x,
    y1: p.y,
    x2: c[(i + 1) % 4].x,
    y2: c[(i + 1) % 4].y,
    thickness: 2 * H,
  }));
  doc.elements = [
    ...(plot ? [plot] : []),
    ...walls,
    { id: 'win', type: 'window', wallId: 'w0', x: x0 + 15 * FT, y: y0, angle: 0, width: 4 * FT },
  ];
  return doc;
}

describe('cladding', () => {
  it('goes on each outside face and meets round the corners', () => {
    const store = createPlannerStore(house(), undefined, DEFAULT_PREFS);
    expect(store.getState().cladOutsideWalls('stone')).toBe(4);
    const doc = store.getState().doc;
    const walls = wallsOf(doc.elements);
    const pieces = claddingPieces(walls);
    expect(pieces.size).toBe(4);
    // Every piece lies outside the walls' outer faces (40 mm of stone beyond them).
    const outer = [
      { x: -H, y: -H },
      { x: 30 * FT + H, y: -H },
      { x: 30 * FT + H, y: 20 * FT + H },
      { x: -H, y: 20 * FT + H },
    ];
    for (const piece of pieces.values())
      for (const p of piece.outline) expect(pointInPolygon(p, outer) && !onEdge(p, outer)).toBe(false);
    // The outside corner square is covered by exactly one of the two pieces meeting there.
    const corner = { x: -H - 2, y: -H - 2 };
    expect([...pieces.values()].filter((p) => pointInPolygon(corner, p.outline))).toHaveLength(1);
    expect(outsideSide(walls[0], walls)).not.toBeNull();
  });

  it('is built in 3D round the window, measured, costed and exported', () => {
    const store = createPlannerStore(house(), undefined, DEFAULT_PREFS);
    const before = quantities(store.getState().doc, WALL).total;
    store.getState().cladOutsideWalls('acp');
    const doc = store.getState().doc;
    const model = buildModel(doc, { wallHeightMm: WALL, showFurniture: true });
    const skin = model.solids.filter((s) => s.id === 'clad:w0');
    expect(skin.length).toBeGreaterThan(2);
    // No piece of the south wall's cladding covers the window's middle (1.5 m up).
    const win = { x: 15 * FT * 0.01, y: 1.5 };
    expect(skin.some((s) => Math.abs(s.x - win.x) < s.w / 2 - 0.01 && s.y0 < win.y && s.y0 + s.h > win.y)).toBe(false);
    const q = quantities(doc, WALL).total;
    expect(q.cladding.acp).toBeGreaterThan(400);
    expect(q.outsideFaceSqft).toBeLessThan(before.outsideFaceSqft - 400);
    expect(estimate(q, STARTER_RATES, STARTER_RATIOS).lines.some((l) => l.id === 'clad-acp')).toBe(true);
    const dxf = planToDxf(doc, {
      units: 'imperial',
      marlaSqFt: 225,
      showDimensions: false,
      showFurniture: false,
      showRoomLabels: false,
      wallHeightMm: WALL,
    });
    expect(dxf).toContain('A-WALL-CLAD');
    expect(planToIfc(doc, { wallHeightMm: WALL, name: 'T', time: '2026-11-04T00:00:00Z' })).toContain('IFCCOVERING(');
    expect(normaliseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('counts as the building in the setbacks check, and warns when it reaches past the line', () => {
    // 5' setbacks; the walls' outer faces right on the building line.
    const plot: Plot = {
      id: 'p',
      type: 'plot',
      points: plotRect({ x: 0, y: 0 }, { x: 40 * FT, y: 30 * FT }),
      front: 2,
      setbacks: { front: 5 * 304.8, rear: 5 * 304.8, sides: 5 * 304.8 },
    };
    const doc = house(5 * FT + H, 5 * FT + H, plot, 30 * FT - 2 * H, 20 * FT - 2 * H);
    const store = createPlannerStore(doc, undefined, DEFAULT_PREFS);
    const ctx = { wallHeightMm: WALL, units: 'imperial' as const };
    expect(planCheck(store.getState().doc, ctx)!.rows.find((r) => r.id === 'setbacks')?.status).toBe('ok');
    store.getState().setWallCladding(['w0'], { kind: 'stone' });
    expect(store.getState().warnings.join(' ')).toMatch(/past the building line/);
    expect(planCheck(store.getState().doc, ctx)!.rows.find((r) => r.id === 'setbacks')?.status).toBe('fail');
    // Flipped onto the inside face, it is inside the line again.
    store.getState().setWallCladding(['w0'], { side: flip(store.getState().doc) });
    expect(planCheck(store.getState().doc, ctx)!.rows.find((r) => r.id === 'setbacks')?.status).toBe('ok');
    store.getState().setWallCladding(['w0'], null);
    expect(wallsOf(store.getState().doc.elements).some((w) => w.cladding)).toBe(false);
  });

  it('on an inside face stops at the walls it meets; the outside cladding still wraps the corner', () => {
    const store = createPlannerStore(house(), undefined, DEFAULT_PREFS);
    const s = store.getState();
    s.cladOutsideWalls('stone');
    const ct = 4; // 40 mm of stone, plan units
    const xs = (id: string) => {
      const o = claddingPieces(wallsOf(store.getState().doc.elements))
        .get(id)!
        .outline.map((p) => p.x);
      return [Math.min(...o), Math.max(...o)];
    };
    const ys = (id: string) => {
      const o = claddingPieces(wallsOf(store.getState().doc.elements))
        .get(id)!
        .outline.map((p) => p.y);
      return [Math.min(...o), Math.max(...o)];
    };
    // The east wall's cladding flipped onto its inside face: between the south and north walls' inside
    // faces (the north wall's cladding is outside, so nothing more to stop at).
    s.setWallCladding(['w1'], { side: flip(store.getState().doc, 1) });
    expect(ys('w1')[0]).toBeCloseTo(H, 1);
    expect(ys('w1')[1]).toBeCloseTo(20 * FT - H, 1);
    // The south wall's outside cladding carries on to the east wall's outer face.
    expect(xs('w0')[1]).toBeCloseTo(30 * FT + H, 1);
    // Both flipped inside: one runs to the wall's face, the other stops at that cladding.
    s.setWallCladding(['w0'], { side: flip(store.getState().doc, 0) });
    expect(xs('w0')[1]).toBeCloseTo(30 * FT - H, 1);
    expect(ys('w1')[0]).toBeCloseTo(H + ct, 1);
    // Another kind stays on the face it was on; Clad all puts it back outside.
    s.setWallCladding(['w0'], { kind: 'marble', thicknessMm: undefined });
    expect(wallsOf(store.getState().doc.elements)[0].cladding).toEqual({
      kind: 'marble',
      side: flip(house(), 0),
    });
    s.cladOutsideWalls('marble');
    expect(wallsOf(store.getState().doc.elements).some((w) => w.cladding?.side)).toBe(false);
  });

  it('breaks at openings on the plan and covers the edge of the slab on the wall', () => {
    const doc = house();
    const out = [
      { x: -H, y: -H },
      { x: 30 * FT + H, y: -H },
      { x: 30 * FT + H, y: 20 * FT + H },
      { x: -H, y: 20 * FT + H },
    ];
    const store = createPlannerStore(doc, undefined, DEFAULT_PREFS);
    store.getState().cladOutsideWalls('stone');
    const bare = quantities(store.getState().doc, WALL).total.cladding.stone!;
    const walls = wallsOf(store.getState().doc.elements);
    const win = store.getState().doc.elements.filter((el): el is Opening => el.type === 'window');
    const bands = claddingBands(claddingPieces(walls).get('w0')!, win);
    expect(bands).toHaveLength(2);
    // Neither band crosses the window (13' to 17' along the wall).
    for (const b of bands) expect(b.some((p) => p.x > 13 * FT + 1 && p.x < 17 * FT - 1)).toBe(false);
    // A 6" slab on the walls: the cladding rises over its edge, and is measured with it.
    store.getState().commit((d) => ({
      ...d,
      elements: [...d.elements, { id: 'slab', type: 'slab', points: out, thickness: 15.24 }],
    }));
    const model = buildModel(store.getState().doc, { wallHeightMm: WALL, showFurniture: true });
    const top = Math.max(...model.solids.filter((x) => x.id === 'clad:w1').map((x) => x.y0 + x.h));
    const wallTop = Math.max(...model.solids.filter((x) => x.id === 'w1').map((x) => x.y0 + x.h));
    expect(top - wallTop).toBeCloseTo(0.1524, 3);
    // 100' of wall, 6" of slab: 50 sq ft more.
    expect(quantities(store.getState().doc, WALL).total.cladding.stone! - bare).toBeCloseTo(50, 0);
  });
});

const onEdge = (p: { x: number; y: number }, poly: { x: number; y: number }[]) =>
  poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l;
    return cross < 0.5;
  });

/** The face opposite a wall's outside one (the south wall's unless told). */
function flip(doc: PlanDoc, i = 0): 'A' | 'B' {
  const walls = wallsOf(doc.elements);
  return outsideSide(walls[i], walls) === 'A' ? 'B' : 'A';
}
