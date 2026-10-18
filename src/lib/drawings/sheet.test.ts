import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc, normaliseDoc } from '../storage';
import { createPlannerStore } from '../../store/plannerStore';
import {
  layoutSheet,
  NATURAL_DASH,
  PEN,
  planArea,
  sheetScaleOf,
  sheetsOf,
  sidePrims,
  suggestedSheets,
  type Prim,
  type SheetSource,
} from './sheet';
import { sectionLines, sideCache } from './views';
import { drawingFromKey, drawingKey, drawingTitle } from './refs';
import { levelContent } from './source';
import type { PlanDoc, PlanElement, Sheet } from '../../types';

const ft = (f: number) => (f * 304.8) / 10;
const OPTS = { wallHeightMm: 3048, units: 'imperial' as const };

/** A 20' × 30' house with a first floor and a section across it. */
function house(): PlanDoc {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = store.getState;
  s().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  s().addSection({ x: -ft(2), y: ft(15) }, { x: ft(22), y: ft(15) }, false);
  s().addLevel();
  s().addRectangle({ x: 0, y: 0 }, { x: ft(20), y: ft(30) });
  s().addLevel(); // An empty second floor: it gets no plan.
  return s().doc;
}

const source = (doc: PlanDoc): SheetSource => ({
  doc,
  side: sideCache(doc, OPTS),
  projectName: 'Test house',
  version: '1.35.0',
  date: '28 September 2026',
});

const texts = (prims: Prim[]) => prims.flatMap((p) => (p.t === 'text' ? [p.text] : []));

describe('sheets', () => {
  it('suggests a sheet per floor plan, one for the sections, one for the elevations and one for 3D views', () => {
    const src = source(house());
    expect(planArea(src.doc, src.doc.levels[2].id)).toBeNull();
    const sheets = suggestedSheets(src);
    expect(sheets.map((s) => s.name)).toEqual([
      'Ground floor plan',
      'First floor plan',
      'Sections',
      'Elevations',
      '3D views',
    ]);
    expect(sheets.map((s) => s.id)).toEqual([
      'suggested-1',
      'suggested-2',
      'suggested-3',
      'suggested-4',
      'suggested-5',
    ]);
    expect(sheets.every((s) => s.paper === 'A3')).toBe(true);
    // A small house fits at the most detailed scale.
    expect(sheets[0].items).toEqual([{ drawing: { kind: 'plan', levelId: src.doc.levels[0].id }, scale: 50 }]);
    expect(sheets[3].items).toHaveLength(4);
    // An isometric line drawing and the coloured 3D picture.
    expect(sheets[4].items.map((i) => i.drawing)).toEqual([
      { kind: 'view3d', style: 'iso' },
      { kind: 'view3d', style: 'picture' },
    ]);
    const l3d = layoutSheet(src, sheets[4], 5, 5);
    expect(l3d.prims.filter((p) => p.t === 'picture')).toHaveLength(1);
    expect(texts(l3d.prims)).toEqual(expect.arrayContaining(['ISOMETRIC VIEW', '3D VIEW']));
    expect(sheetsOf(src)).toEqual(sheets);
    // Once the plan has its own sheets (even none), those are used.
    expect(sheetsOf(source({ ...src.doc, sheets: [] }))).toEqual([]);
  });

  it('lays out a sheet with its drawings, their names and scales, and the title block', () => {
    const src = source(house());
    const section = sectionLines(src.doc)[0];
    const sheet: Sheet = {
      id: 's',
      name: 'Plan and section',
      paper: 'A3',
      items: [
        { drawing: { kind: 'plan', levelId: src.doc.levels[0].id }, scale: 100 },
        { drawing: { kind: 'section', id: section.id }, scale: 100 },
      ],
    };
    const l = layoutSheet(src, sheet, 1, 3);
    expect(l.overflow).toBe(false);
    expect(l.paper).toEqual({ w: 420, h: 297 });
    const plan = l.prims.find((p) => p.t === 'plan');
    expect(plan).toMatchObject({ levelId: src.doc.levels[0].id, scale: 100 });
    // A drawing moved on the sheet: 10 mm right and 5 mm up, and kept on save.
    const moved: Sheet = { ...sheet, items: [{ ...sheet.items[0], offsetMm: { x: 10, y: -5 } }, sheet.items[1]] };
    const shifted = layoutSheet(src, moved, 1, 3).prims.find((p) => p.t === 'plan');
    expect(shifted).toMatchObject({ x: (plan as { x: number }).x + 10, y: (plan as { y: number }).y - 5 });
    const saved = normaliseDoc(JSON.parse(JSON.stringify({ ...src.doc, sheets: [moved] })));
    expect(saved.sheets?.[0].items[0].offsetMm).toEqual({ x: 10, y: -5 });
    // Everything stays on the paper.
    for (const p of l.prims)
      if (p.t === 'line')
        for (const [x, y] of [p.a, p.b]) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(420);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(297);
        }
    expect(texts(l.prims)).toEqual(
      expect.arrayContaining([
        'Test house',
        'Plan and section',
        '28 September 2026',
        '2 of 3',
        'GROUND FLOOR PLAN',
        'SECTION A–A',
        'Scale 1:100',
        'Drawn with MIMAR 1.35.0',
      ]),
    );
    // The section is hatched where it is cut (brick walls, concrete slabs: thin lines), or filled solid.
    const fine = (prims: typeof l.prims) => prims.filter((p) => p.t === 'line' && p.w === PEN.fine).length;
    const solid = layoutSheet({ ...src, doc: { ...src.doc, drawing: { solidCuts: true } } }, sheet, 1, 3);
    expect(fine(l.prims)).toBeGreaterThan(fine(solid.prims) + 20);
    expect(solid.prims.some((p) => p.t === 'fill')).toBe(true);
    // Its dimensions: the heights and the cut walls, in feet and inches.
    expect(texts(l.prims).some((t) => /^\d+' \d+"$/.test(t))).toBe(true);
    const plain = layoutSheet({ ...src, doc: { ...src.doc, drawing: { sideDims: false } } }, sheet, 1, 3);
    expect(texts(plain.prims).length).toBeLessThan(texts(l.prims).length);
  });

  it('warns when the drawings do not fit', () => {
    const src = source(house());
    const sheet: Sheet = {
      id: 's',
      name: 'Elevations',
      paper: 'A4',
      items: (['front', 'back', 'left', 'right'] as const).map((side) => ({
        drawing: { kind: 'elevation', side },
        scale: 50,
      })),
    };
    expect(layoutSheet(src, sheet, 0, 1).overflow).toBe(true);
    expect(layoutSheet(src, { ...sheet, paper: 'A1' }, 0, 1).overflow).toBe(false);
  });

  it('draws a section to scale, with its levels', () => {
    const src = source(house());
    const d = src.side({ kind: 'section', id: sectionLines(src.doc)[0].id })!;
    const at = (scale: number) => {
      const xs = sidePrims(d, scale, 0, 0).flatMap((p) => (p.t === 'fill' ? p.rings.flat().map((q) => q[0]) : []));
      return Math.max(...xs) - Math.min(...xs);
    };
    // Twice the scale, half the size.
    expect(at(50)).toBeCloseTo(2 * at(100), 3);
    expect(texts(sidePrims(d, 100, 0, 0))).toEqual(expect.arrayContaining([`±0'-0"`, 'Natural ground']));
  });

  it('draws the ground as it is: the finished ground solid, the natural ground dashed', () => {
    const doc = house();
    const level = (id: string, y: number, zMm: number): PlanElement => ({ id, type: 'level', x: ft(10), y, zMm });
    const sloping: PlanDoc = {
      ...doc,
      elements: [...doc.elements, level('l1', -ft(20), 0), level('l2', ft(50), -2000)],
      ground: { levelMm: -500 },
    };
    // A levelled area under the front half of the house, so the natural ground shows beside it.
    sloping.elements.push({
      id: 'pad',
      type: 'pad',
      zMm: -500,
      points: [
        { x: -ft(5), y: -ft(5) },
        { x: ft(25), y: -ft(5) },
        { x: ft(25), y: ft(15) },
        { x: -ft(5), y: ft(15) },
      ],
    });
    // A section down the page, along the slope.
    sloping.elements.push({ id: 'b', type: 'section', x1: ft(10), y1: -ft(10), x2: ft(10), y2: ft(40), label: 'B' });
    const src = source(sloping);
    const d = src.side({ kind: 'section', id: 'b' })!;
    const prims = sidePrims(d, 100, 0, 0);
    const lines = prims.filter((p): p is Extract<Prim, { t: 'line' }> => p.t === 'line');
    const groundLines = lines.filter((p) => p.w === PEN.ground);
    // Not one straight line: it follows the ground.
    expect(groundLines.length).toBeGreaterThan(1);
    expect(groundLines.some((p) => Math.abs(p.a[1] - p.b[1]) > 0.1)).toBe(true);
    expect(lines.some((p) => p.dash === NATURAL_DASH)).toBe(true);
    expect(texts(prims)).toEqual(expect.arrayContaining([`±0'-0"`, 'Road level (datum)']));
  });
});

describe('services layouts', () => {
  /** The house with a socket, a light wired up, a water meter and a basin on the ground floor, and a split AC upstairs. */
  function serviced(): PlanDoc {
    const doc = house();
    const [ground, first] = doc.levels;
    const at = (id: string, kind: string, levelId: string, x: number): PlanElement =>
      ({ id, type: 'furniture', kind, x: ft(x), y: ft(5), w: 20, h: 20, levelId }) as PlanElement;
    return {
      ...doc,
      elements: [
        ...doc.elements,
        at('s1', 'socket', ground.id, 5),
        at('l1', 'light-ceiling', ground.id, 10),
        at('b1', 'water-meter', ground.id, 15),
        at('h1', 'basin', ground.id, 18),
        at('f1', 'ac-split', first.id, 10),
        {
          id: 'r1',
          type: 'run',
          system: 'lighting',
          points: [
            { x: ft(5), y: ft(5) },
            { x: ft(10), y: ft(5) },
          ],
          levelId: ground.id,
        } as PlanElement,
      ],
    };
  }

  it('suggests one sheet per trade, with each floor that has some of it', () => {
    const src = source(serviced());
    const [ground, first] = src.doc.levels;
    const sheets = suggestedSheets(src);
    expect(sheets.map((s) => s.name)).toEqual([
      'Ground floor plan',
      'First floor plan',
      'Electrical layout',
      'Air conditioning layout',
      'Water supply layout',
      'Sections',
      'Elevations',
      '3D views',
    ]);
    expect(sheets[2].items.map((i) => i.drawing)).toEqual([
      { kind: 'plan', levelId: ground.id, services: 'electrical' },
    ]);
    expect(sheets[3].items.map((i) => i.drawing)).toEqual([{ kind: 'plan', levelId: first.id, services: 'hvac' }]);
    // A plain plan draws no services; a layout only its own trade's.
    const prims = layoutSheet(src, sheets[2], 3, 8).prims.filter((p) => p.t === 'plan');
    expect(prims.map((p) => p.services)).toEqual(['electrical']);
    expect(layoutSheet(src, sheets[0], 1, 8).prims.find((p) => p.t === 'plan')?.services).toBe('none');
    expect(drawingTitle(src.doc, sheets[2].items[0].drawing)).toBe('Ground floor electrical layout');
    const key = drawingKey(sheets[2].items[0].drawing);
    expect(drawingFromKey(key)).toEqual(sheets[2].items[0].drawing);
    expect(drawingFromKey(`plan:${ground.id}`)).toEqual({ kind: 'plan', levelId: ground.id });
  });

  it('draws a plan with no services, one trade, or all of them', () => {
    const doc = serviced();
    const ground = doc.levels[0].id;
    const s = { ...DEFAULT_PREFS, doc, exportLines: true } as unknown as Parameters<typeof levelContent>[0];
    const ids = (services?: Parameters<typeof levelContent>[3]) =>
      levelContent(s, doc, ground, services)
        .doc.elements.filter((el) => el.type === 'furniture' || el.type === 'run')
        .map((el) => el.id);
    // Furniture always shows; services only on their own trade's layout.
    expect(ids('none')).toEqual(['h1']);
    // A trade's own layout shows no furniture: the basin only where its pipes go.
    expect(ids('electrical')).toEqual(['s1', 'l1', 'r1']);
    expect(ids('plumbing')).toEqual(['b1', 'h1']);
    expect(ids()).toEqual(['s1', 'l1', 'b1', 'h1', 'r1']);
  });

  it('keeps a services layout when the plan is opened again', () => {
    const doc = serviced();
    const ref = { kind: 'plan' as const, levelId: doc.levels[0].id, services: 'gas' as const };
    const sheets: Sheet[] = [{ id: 'a', name: 'Gas', paper: 'A3', items: [{ drawing: ref, scale: 100 }] }];
    const back = normaliseDoc(JSON.parse(JSON.stringify({ ...doc, sheets })));
    expect(back.sheets?.[0].items[0].drawing).toEqual(ref);
  });
});

describe('custom scales', () => {
  it('takes any whole 1:n from 1 to 10000', () => {
    expect(sheetScaleOf('75')).toBe(75);
    expect(sheetScaleOf(62.6)).toBe(63);
    expect(sheetScaleOf('0')).toBeNull();
    expect(sheetScaleOf('abc')).toBeNull();
    expect(sheetScaleOf(20000)).toBeNull();
  });

  it('keeps a typed scale when the plan is opened again', () => {
    const ref = { kind: 'plan', levelId: 'ground' };
    const doc = normaliseDoc({
      ...emptyDoc(),
      sheets: [
        {
          id: 's1',
          name: 'A',
          paper: 'A3',
          items: [
            { drawing: ref, scale: 75 },
            { drawing: ref, scale: -3 },
          ],
        },
      ],
    });
    expect(doc.sheets?.[0].items.map((i) => i.scale)).toEqual([75, 100]);
  });
});
