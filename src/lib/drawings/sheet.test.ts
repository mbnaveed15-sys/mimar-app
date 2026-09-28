import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs';
import { emptyDoc } from '../storage';
import { createPlannerStore } from '../../store/plannerStore';
import {
  layoutSheet,
  NATURAL_DASH,
  PEN,
  planArea,
  sheetsOf,
  sidePrims,
  suggestedSheets,
  type Prim,
  type SheetSource,
} from './sheet';
import { sectionLines, sideCache } from './views';
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
  it('suggests a sheet per floor plan, one for the sections and one for the elevations', () => {
    const src = source(house());
    expect(planArea(src.doc, src.doc.levels[2].id)).toBeNull();
    const sheets = suggestedSheets(src);
    expect(sheets.map((s) => s.name)).toEqual(['Ground floor plan', 'First floor plan', 'Sections', 'Elevations']);
    expect(sheets.map((s) => s.id)).toEqual(['suggested-1', 'suggested-2', 'suggested-3', 'suggested-4']);
    expect(sheets.every((s) => s.paper === 'A3')).toBe(true);
    // A small house fits at the most detailed scale.
    expect(sheets[0].items).toEqual([{ drawing: { kind: 'plan', levelId: src.doc.levels[0].id }, scale: 50 }]);
    expect(sheets[3].items).toHaveLength(4);
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
        'Drawn with Mimar 1.35.0',
      ]),
    );
    // The section is filled where it is cut.
    expect(l.prims.some((p) => p.t === 'fill')).toBe(true);
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
