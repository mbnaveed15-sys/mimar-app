import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc, normaliseDoc } from '../storage';
import { createPlannerStore } from '../../store/plannerStore';
import { layoutSheet, type SheetSource } from './sheet';
import { drawingFromKey, drawingKey, sideCache } from './views';
import { paperMm, paperName, pdfPage, PAPER_SIZES } from '../paper';
import type { PlanDoc, SavedView, Sheet } from '../../types';

const ft = (f: number) => (f * 304.8) / 10;
const OPTS = { wallHeightMm: 3048, units: 'imperial' as const };

function house(): PlanDoc {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  store.getState().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  return store.getState().doc;
}

const source = (doc: PlanDoc): SheetSource => ({
  doc,
  side: sideCache(doc, OPTS),
  projectName: 'Test',
  version: '1.51.0',
  date: '13 October 2026',
});

const views = (doc: PlanDoc): SavedView[] => [
  {
    id: 'v1',
    name: 'Kitchen corner',
    kind: 'plan',
    levelId: doc.levels[0].id,
    area: { minX: 0, minY: 0, maxX: ft(10), maxY: ft(8) },
  },
  {
    id: 'v2',
    name: 'From the street',
    kind: '3d',
    camera: { target: [3, 1, 4.5], distance: 25, azimuth: 0.6, elevation: 0.4 },
  },
];

describe('paper', () => {
  it('has the usual sizes, landscape unless turned, and a custom size', () => {
    expect(PAPER_SIZES).toEqual(expect.arrayContaining(['A0', 'A2', 'B3', 'ARCH D', 'Letter', 'Tabloid', 'ANSI E']));
    expect(paperMm({ paper: 'A2' })).toEqual({ w: 594, h: 420 });
    expect(paperMm({ paper: 'A2', portrait: true })).toEqual({ w: 420, h: 594 });
    expect(paperMm({ paper: 'custom', customMm: { w: 700, h: 1000 } })).toEqual({ w: 700, h: 1000 });
    expect(paperName({ paper: 'ARCH D', portrait: true })).toBe('ARCH D portrait');
    expect(paperName({ paper: 'custom', customMm: { w: 700, h: 1000 } })).toBe('Custom 700 × 1000 mm');
    expect(pdfPage({ paper: 'custom', customMm: { w: 700, h: 1000 } })).toEqual({
      format: [700, 1000],
      orientation: 'portrait',
    });
  });

  it('lays a sheet out on portrait and custom paper', () => {
    const doc = house();
    const sheet: Sheet = {
      id: 's',
      name: 'Plan',
      paper: 'A3',
      portrait: true,
      items: [{ drawing: { kind: 'plan', levelId: doc.levels[0].id }, scale: 100 }],
    };
    expect(layoutSheet(source(doc), sheet, 0, 1).paper).toEqual({ w: 297, h: 420 });
    const custom = layoutSheet(source(doc), { ...sheet, paper: 'custom', customMm: { w: 1000, h: 300 } }, 0, 1);
    expect(custom.paper).toEqual({ w: 1000, h: 300 });
    expect(custom.prims.some((p) => p.t === 'text' && p.text.includes('Custom 1000 × 300 mm'))).toBe(true);
  });

  it('keeps sound paper settings when loading', () => {
    const doc = normaliseDoc({
      sheets: [
        { id: 'a', paper: 'B2', portrait: true, items: [] },
        { id: 'b', paper: 'custom', customMm: { w: 20, h: 900 }, items: [] },
        { id: 'c', paper: 'A11', items: [] },
      ],
    });
    expect(doc.sheets!.map((s) => [s.paper, s.portrait, s.customMm])).toEqual([
      ['B2', true, undefined],
      ['custom', undefined, { w: 420, h: 900 }],
      ['A3', undefined, undefined],
    ]);
  });
});

describe('saved views', () => {
  it('puts a part of a plan and a 3D view on a sheet', () => {
    const base = house();
    const doc = { ...base, views: views(base) };
    const sheet: Sheet = {
      id: 's',
      name: 'Views',
      paper: 'A3',
      items: [
        { drawing: { kind: 'view', id: 'v1' }, scale: 50 },
        { drawing: { kind: 'view', id: 'v2' }, scale: 100 },
        { drawing: { kind: 'view', id: 'v2', style: 'picture' }, scale: 100 },
      ],
    };
    const l = layoutSheet(source(doc), sheet, 0, 1);
    const plan = l.prims.find((p) => p.t === 'plan');
    // The view's own area, 10' × 8' at 1:50, with no room added round it.
    expect(plan).toMatchObject({ area: { minX: 0, minY: 0, maxX: ft(10), maxY: ft(8) }, scale: 50 });
    expect(plan && plan.t === 'plan' && plan.w).toBeCloseTo((10 * 304.8) / 50, 3);
    const picture = l.prims.find((p) => p.t === 'picture');
    expect(picture).toMatchObject({ camera: { distance: 25, azimuth: 0.6 } });
    const names = l.prims.flatMap((p) => (p.t === 'text' ? [p.text] : []));
    expect(names).toEqual(expect.arrayContaining(['KITCHEN CORNER', 'FROM THE STREET', '1:50, 1:100 on A3']));
    // The 3D view in lines is drawn (lines on the sheet beside the plan).
    const without = layoutSheet(source(doc), { ...sheet, items: sheet.items.slice(0, 1) }, 0, 1);
    const lines = (ps: typeof l.prims) => ps.filter((p) => p.t === 'line').length;
    expect(lines(l.prims) - lines(without.prims)).toBeGreaterThan(8);
  });

  it('drops a deleted view from the sheet', () => {
    const doc = house();
    const sheet: Sheet = {
      id: 's',
      name: 'V',
      paper: 'A3',
      items: [{ drawing: { kind: 'view', id: 'gone' }, scale: 50 }],
    };
    expect(layoutSheet(source(doc), sheet, 0, 1).prims.some((p) => p.t === 'plan')).toBe(false);
  });

  it('keys views, and keeps sound ones when loading', () => {
    for (const ref of [
      { kind: 'view', id: 'v2' },
      { kind: 'view', id: 'v2', style: 'picture' },
    ] as const)
      expect(drawingFromKey(drawingKey(ref))).toEqual(ref);
    const base = house();
    const doc = normaliseDoc({
      ...base,
      views: [...views(base), { id: 'x', kind: '3d', camera: { target: [0, 0] } }, { id: 'y', kind: 'plan' }],
    });
    expect(doc.views).toEqual(views(base));
  });

  it('saves the plan on screen as a view, and goes back to it', () => {
    const store = createPlannerStore(house(), undefined, DEFAULT_PREFS);
    const s = store.getState;
    s().setViewport({ width: 800, height: 600 });
    s().setView({ x: 10, y: 20, zoom: 2 });
    const v = s().saveView('plan');
    expect(v).toMatchObject({ name: 'View 1', kind: 'plan', area: { minX: 10, minY: 20, maxX: 410, maxY: 320 } });
    expect(s().doc.views).toHaveLength(1);
    s().setView({ x: 500, y: 500, zoom: 1 });
    s().goToView(v!.id);
    expect(s().view.x).toBeLessThan(20);
    // 3D can't be saved without the 3D view open.
    expect(s().saveView('3d')).toBeNull();
    s().undo();
    s().undo();
    expect(s().doc.views).toBeUndefined();
  });
});
