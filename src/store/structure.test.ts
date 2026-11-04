import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { quantities } from '../lib/quantities';
import { estimate, STARTER_RATES, STARTER_RATIOS } from '../lib/estimate';
import { planToDxf } from '../lib/exportDxf';
import { planToIfc } from '../lib/exportIfc';
import { suggestedSheets } from '../lib/drawings/sheet';
import { levelContent } from '../lib/drawings/source';
import { planHints } from '../lib/planHints';
import { lintelsOf } from '../lib/structure/lintels';
import { structureCsv } from '../lib/structure/schedule';
import { buildModel, cutWallsByFrame } from '../three/model';
import { createPlannerStore } from './plannerStore';
import type { Column, PlanDoc, Plot, Wall } from '../types';
import { planCheck } from '../lib/planCheck';
import { plotRect } from '../lib/site';

const WALL = 3048;
const FT = 30.48;

/** A 30' × 20' house with a door, drawn as a loop of walls (it makes the room). */
const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = () => store.getState();
  const c = [
    { x: 0, y: 0 },
    { x: 30 * FT, y: 0 },
    { x: 30 * FT, y: 20 * FT },
    { x: 0, y: 20 * FT },
  ];
  c.forEach((p, i) => s().addWall(p, c[(i + 1) % 4]));
  s().addRoomAt({ x: 15 * FT, y: 10 * FT });
  s().placeOpening('door', { x: 7 * FT, y: 0 });
  s().setPlinthMm(610);
  return s;
};

describe('Generate structure in the app', () => {
  it('adds the frame in one undo step, and every export carries it', () => {
    const s = setup();
    expect(s().doc.rooms.length).toBeGreaterThan(0);
    const before = s().doc.elements.length;
    const r = s().generateStructure()!;
    expect(r.counts.columns).toBeGreaterThan(4);
    expect(r.counts.footings).toBe(r.counts.columns);
    const doc = s().doc;
    expect(doc.frame?.madeFrom).toBeTruthy();
    expect(lintelsOf(doc, WALL)).toHaveLength(1);

    // 3D: columns, beams, lintel and footings; the frame-only view has no walls.
    const model = buildModel(doc, { wallHeightMm: WALL, showFurniture: true });
    expect(model.solids.some((p) => p.id?.startsWith('lintel:'))).toBe(true);
    const footing = model.slabs.find((sl) =>
      doc.elements.find((el) => el.id === sl.id && el.type === 'slab' && el.footing),
    );
    expect(footing!.y0).toBeLessThan(0);
    const frame = buildModel(doc, { wallHeightMm: WALL, showFurniture: true, frame: true });
    expect(frame.solids.some((p) => p.role === 'wall')).toBe(false);
    expect(frame.solids.some((p) => p.role === 'column')).toBe(true);

    // IFC, DXF, quantities, schedule, sheets.
    const ifc = planToIfc(doc, { wallHeightMm: WALL, name: 'Test', time: '2026-11-03T00:00:00Z' });
    expect(ifc).toContain('IFCFOOTING(');
    expect(ifc).toContain('.LINTEL.');
    const dxf = planToDxf(doc, {
      units: 'imperial',
      marlaSqFt: 225,
      showDimensions: false,
      showFurniture: false,
      showRoomLabels: false,
      wallHeightMm: WALL,
    });
    expect(dxf).toContain('S-FOOT');
    expect(dxf).toContain('S-LINT');
    const q = quantities(doc, WALL).total;
    expect(q.footingCft).toBeGreaterThan(0);
    expect(q.lintelCft).toBeGreaterThan(0);
    const cost = estimate(q, STARTER_RATES, STARTER_RATIOS);
    expect(cost.lines.some((l) => l.id === 'footing')).toBe(true);
    expect(structureCsv(doc, 'Test', 'imperial', WALL)).toContain('C1');
    const sheets = suggestedSheets({ doc, side: () => null, projectName: 'T', version: '1', date: '' });
    expect(sheets.map((x) => x.name)).toContain('Foundation plan');
    expect(sheets.filter((x) => x.name.endsWith(' framing plan'))).toHaveLength(1);
    // The foundation plan shows the footings; the floor plan doesn't.
    const look = { ...s(), doc };
    const plan = levelContent(look, doc, 'ground');
    expect(plan.doc.elements.some((el) => el.type === 'slab' && el.footing)).toBe(false);
    const found = levelContent(look, doc, 'ground', 'foundation');
    expect(found.doc.elements.some((el) => el.type === 'slab' && el.footing)).toBe(true);
    expect(found.marks).toBe(true);

    // It survives saving.
    expect(normaliseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);

    s().undo();
    expect(s().doc.elements.length).toBe(before);
    expect(s().doc.frame?.madeFrom).toBeUndefined();
  });

  it('says when the walls change, and Regenerate brings it up to date', () => {
    const s = setup();
    s().generateStructure();
    const wall = s().doc.elements.find((el) => el.type === 'wall')!;
    s().commit((doc) => ({
      ...doc,
      elements: doc.elements.map((el) => (el.id === wall.id && el.type === 'wall' ? { ...el, thickness: 34.29 } : el)),
    }));
    const stale = () => planHints(s().doc, { units: 'imperial' }).some((h) => h.id === 'frame-stale');
    expect(stale()).toBe(true);
    s().generateStructure();
    expect(stale()).toBe(false);
    s().removeStructure();
    expect(s().doc.elements.some((el) => 'auto' in el && el.auto)).toBe(false);
    expect(lintelsOf(s().doc, WALL)).toHaveLength(0);
  });

  it('cuts the walls round the columns, beams and lintels in 3D', () => {
    const s = setup();
    const volume = (doc: PlanDoc) =>
      buildModel(doc, { wallHeightMm: WALL, showFurniture: true })
        .solids.filter((p) => p.role === 'wall')
        .reduce((t, p) => t + p.w * p.d * p.h, 0);
    const before = volume(s().doc);
    s().generateStructure();
    // Plastered (the default): the walls stay whole and the frame is plastered like them.
    expect(volume(s().doc)).toBeCloseTo(before, 6);
    const plastered = buildModel(s().doc, { wallHeightMm: WALL, showFurniture: true });
    const wallColor = plastered.solids.find((p) => p.role === 'wall' && !p.id?.startsWith('plinth:'))!.color;
    expect(plastered.solids.filter((p) => p.role === 'column').every((p) => p.color === wallColor)).toBe(true);
    // Exposed: the walls stop at the frame.
    s().setFacade('exposed');
    const model = buildModel(s().doc, { wallHeightMm: WALL, showFurniture: true });
    expect(volume(s().doc)).toBeLessThan(before * 0.9);
    expect(model.solids.filter((p) => p.role === 'column').some((p) => p.color === wallColor)).toBe(false);
    // Nothing left to cut: no wall box overlaps the structure.
    expect(cutWallsByFrame(model.solids)).toHaveLength(model.solids.length);
    expect(normaliseDoc(JSON.parse(JSON.stringify(s().doc))).frame?.facade).toBe('exposed');
  });

  it('keeps everything it makes inside the building line, so the setbacks check passes', () => {
    // A 40' × 30' plot with 5' setbacks all round, and a 30' × 20' house built right up to them (9" walls).
    const doc = emptyDoc();
    doc.plinthMm = 610;
    const plot: Plot = {
      id: 'p',
      type: 'plot',
      points: plotRect({ x: 0, y: 0 }, { x: 40 * FT, y: 30 * FT }),
      front: 2,
      setbacks: { front: 5 * 304.8, rear: 5 * 304.8, sides: 5 * 304.8 },
    };
    const h = 4.5 * 2.54; // half a 9" wall
    const c = [
      { x: 5 * FT + h, y: 5 * FT + h },
      { x: 35 * FT - h, y: 5 * FT + h },
      { x: 35 * FT - h, y: 25 * FT - h },
      { x: 5 * FT + h, y: 25 * FT - h },
    ];
    const walls: Wall[] = c.map((p, i) => ({
      id: `w${i}`,
      type: 'wall',
      x1: p.x,
      y1: p.y,
      x2: c[(i + 1) % 4].x,
      y2: c[(i + 1) % 4].y,
      thickness: 2 * h,
    }));
    doc.elements = [plot, ...walls];
    const store = createPlannerStore(doc, undefined, DEFAULT_PREFS);
    const ctx = { wallHeightMm: WALL, units: 'imperial' as const };
    expect(planCheck(store.getState().doc, ctx)!.rows.find((r) => r.id === 'setbacks')?.status).toBe('ok');
    store.getState().generateStructure();
    const after = store.getState().doc;
    expect(after.elements.some((el) => el.type === 'slab' && el.footing)).toBe(true);
    const check = planCheck(after, ctx)!;
    expect(check.rows.find((r) => r.id === 'setback-items')).toBeUndefined();
    expect(check.rows.find((r) => r.id === 'setbacks')?.status).toBe('ok');
    // Columns sit flush with the walls' outer faces: none pokes out past them.
    for (const col of after.elements.filter((el): el is Column => el.type === 'column')) {
      const turned = Math.abs(Math.sin(((col.rotation ?? 0) * Math.PI) / 180)) > 0.5;
      const [hx, hy] = turned ? [col.h / 2, col.w / 2] : [col.w / 2, col.h / 2];
      expect(col.x - hx).toBeGreaterThanOrEqual(5 * FT - 0.5);
      expect(col.y - hy).toBeGreaterThanOrEqual(5 * FT - 0.5);
      expect(col.x + hx).toBeLessThanOrEqual(35 * FT + 0.5);
      expect(col.y + hy).toBeLessThanOrEqual(25 * FT + 0.5);
    }
  });

  it('turns a lintel off from its opening', () => {
    const s = setup();
    s().generateStructure();
    const door = s().doc.elements.find((el) => el.type === 'door')!;
    s().setOpeningLintel(door.id, { off: true });
    expect(lintelsOf(s().doc, WALL)).toHaveLength(0);
    s().setOpeningLintel(door.id, { off: null });
    expect(lintelsOf(s().doc, WALL)).toHaveLength(1);
  });
});
