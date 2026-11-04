import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { quantities } from '../lib/quantities';
import { estimate, STARTER_RATES, STARTER_RATIOS } from '../lib/estimate';
import { planToDxf } from '../lib/exportDxf';
import { planToIfc } from '../lib/exportIfc';
import { planCheck } from '../lib/planCheck';
import { plotRect } from '../lib/site';
import { claddingPieces, outsideSide } from '../lib/cladding';
import { pointInPolygon } from '../geometry';
import { buildModel } from '../three/model';
import { wallsOf } from '../walls';
import { createPlannerStore } from './plannerStore';
import type { PlanDoc, Plot, Wall } from '../types';

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
});

const onEdge = (p: { x: number; y: number }, poly: { x: number; y: number }[]) =>
  poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / l;
    return cross < 0.5;
  });

/** The face opposite the south wall's outside one. */
function flip(doc: PlanDoc): 'A' | 'B' {
  const walls = wallsOf(doc.elements);
  return outsideSide(walls[0], walls) === 'A' ? 'B' : 'A';
}
