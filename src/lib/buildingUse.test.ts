import { describe, expect, it } from 'vitest';
import { buildingPeople, buildingUseRows, exitsNeeded, occupantsOf, wcsNeeded } from './buildingUse';
import { fullCheck } from './fullCheck';
import { planHints } from './planHints';
import { plotRect } from './site';
import { emptyDoc } from './storage';
import type { Furniture, Opening, PlanDoc, PlanElement, Room, Stair } from '../types';

// Plan units are centimetres: 100 to the metre.
const M = 100;
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, levelId?: string): PlanElement => ({
  id,
  type: 'wall',
  ...{ x1: x1 * M, y1: y1 * M, x2: x2 * M, y2: y2 * M },
  thickness: 20,
  ...(levelId ? { levelId } : {}),
});
const door = (id: string, wallId: string, x: number, y: number, w = 1): Opening => ({
  id,
  type: 'door',
  wallId,
  x: x * M,
  y: y * M,
  angle: 0,
  width: w * M,
});
const room = (id: string, name: string, x: number, y: number, w: number, d: number, levelId?: string): Room => ({
  id,
  name,
  points: plotRect({ x: x * M, y: y * M }, { x: (x + w) * M, y: (y + d) * M }),
  ...(levelId ? { levelId } : {}),
});
const box = (w: number, d: number): PlanElement[] => [
  wall('top', 0, 0, w, 0),
  wall('right', w, 0, w, d),
  wall('bottom', w, d, 0, d),
  wall('left', 0, d, 0, 0),
];
const building = (elements: PlanElement[], rooms: Room[], use: 'office' | 'school' = 'office'): PlanDoc => ({
  ...emptyDoc(),
  plinthMm: 0,
  project: { type: 'building', use, units: 'metric' },
  elements,
  rooms,
});
const hintsOfUse = (doc: PlanDoc) => planHints(doc, { units: 'metric' }).filter((h) => h.kind === 'use');
const ids = (doc: PlanDoc) => hintsOfUse(doc).map((h) => h.id);

describe('non-residential checks', () => {
  it('counts people by room name and use, exits and WCs by the numbers', () => {
    expect(occupantsOf(room('a', 'Open office', 0, 0, 10, 9.3), 'office')).toBe(10);
    expect(occupantsOf(room('a', 'Classroom', 0, 0, 7, 8), 'school')).toBe(30);
    expect(occupantsOf(room('a', 'Corridor', 0, 0, 2, 20), 'school')).toBe(0);
    expect(occupantsOf(room('a', 'Toilets (men)', 0, 0, 3, 4), 'office')).toBe(0);
    expect(occupantsOf(room('a', 'Prayer hall', 0, 0, 12, 10), 'mosque')).toBe(185);
    expect([1, 49, 50, 500, 501, 1001].map(exitsNeeded)).toEqual([1, 1, 2, 2, 3, 4]);
    expect(wcsNeeded(33, 'office')).toBe(2);
    expect(wcsNeeded(150, 'office')).toBe(4);
    expect(wcsNeeded(120, 'school')).toBe(3);
    expect(wcsNeeded(400, 'shop')).toBe(1);
  });

  it('a small office: a narrow door, no toilets and no accessible toilet', () => {
    const doc = building([...box(20, 15), door('d', 'bottom', 10, 15, 0.8)], [room('o', 'Open office', 0, 0, 20, 15)]);
    expect(ids(doc)).toEqual(['use-doors-ground', 'use-toilets', 'use-accessible-toilet']);
    expect(hintsOfUse(doc)[1].text).toBe('No toilets: about 33 people need 2 WCs.');
  });

  it('a big floor with one way out: more exits, wider doors and a shorter walk', () => {
    const doc = building([...box(100, 15), door('d', 'bottom', 50, 15, 1)], [room('o', 'Open office', 0, 0, 100, 15)]);
    const found = hintsOfUse(doc);
    expect(found.map((h) => h.id)).toContain('use-exits-ground');
    expect(found.find((h) => h.id === 'use-exits-ground')!.text).toContain('it needs 2 exits to outside (it has 1)');
    expect(found.map((h) => h.id)).toContain('use-travel-ground');
    // 162 people × 5 mm = 810 mm: a 1 m door is wide enough.
    expect(found.map((h) => h.id)).not.toContain('use-exit-width-ground');
  });

  it('toilets with enough WCs and a roomy accessible toilet pass; a raised entrance wants a ramp', () => {
    const wc = (id: string, x: number): Furniture => ({
      id,
      type: 'furniture',
      kind: 'wc',
      x: x * M,
      y: 1 * M,
      w: 40,
      h: 70,
    });
    const doc = building(
      [
        ...box(20, 15),
        wall('t', 14, 0, 14, 15),
        door('d', 'bottom', 5, 15, 1),
        door('dt', 't', 14, 5, 1),
        wc('w1', 15),
        wc('w2', 16),
      ],
      [room('o', 'Open office', 0, 0, 14, 15), room('t', 'Accessible toilet', 14, 0, 6, 15)],
    );
    expect(ids(doc)).toEqual([]);
    expect(ids({ ...doc, plinthMm: 450 })).toEqual(['use-ramp']);
    const ramp: Stair = {
      id: 's',
      type: 'stair',
      x: 5 * M,
      y: 17 * M,
      shape: 'ramp',
      width: 1.2 * M,
      riseMm: 450,
      riserMm: 0,
      treadMm: 0,
      w: 120,
      h: 540,
    };
    expect(ids({ ...doc, plinthMm: 450, elements: [...doc.elements, ramp] })).toEqual([]);
  });

  it('upper floors need stairs down, wide enough, and a lift', () => {
    const base = emptyDoc().levels[0];
    const first = { id: 'first', name: 'First floor' };
    const stair = (w: number): Stair => ({
      id: 's',
      type: 'stair',
      x: 2 * M,
      y: 2 * M,
      shape: 'straight',
      width: w * M,
      riseMm: 3200,
      riserMm: 160,
      treadMm: 300,
      w: w * M,
      h: 600,
    });
    const doc: PlanDoc = {
      ...building(
        [
          ...box(20, 15),
          door('d', 'bottom', 5, 15, 1),
          ...box(20, 15).map((w) => ({ ...w, id: `${w.id}1`, levelId: 'first' })),
        ],
        [room('o', 'Open office', 0, 0, 20, 15), room('u', 'Open office', 0, 0, 20, 15, 'first')],
      ),
      levels: [base, first],
    };
    expect(ids(doc)).toContain('use-exits-first');
    const withStair = { ...doc, elements: [...doc.elements, stair(0.8)] };
    expect(ids(withStair)).not.toContain('use-exits-first');
    expect(ids(withStair)).toContain('use-stair-width-ground');
    expect(ids(withStair)).toContain('use-lift');
    expect(ids({ ...withStair, elements: [...doc.elements, stair(1.2)] })).not.toContain('use-stair-width-ground');
  });

  it('school corridors need 1.8 m once 100 pupils use the floor; houses get none of this', () => {
    const doc = building(
      [...box(30, 20), door('d', 'bottom', 15, 20, 1.2), door('d2', 'top', 15, 0, 1.2)],
      [
        room('c1', 'Classroom 1', 0, 0, 14, 8),
        room('c2', 'Classroom 2', 16, 0, 14, 8),
        room('k', 'Corridor', 0, 8, 30, 1.5),
      ],
      'school',
    );
    expect(hintsOfUse(doc).find((h) => h.id === 'use-corridor-k')?.text).toContain('a corridor wants at least');
    expect(hintsOfUse({ ...doc, project: undefined })).toEqual([]);
  });
});

describe('more building uses, and the use checked as plan check rows', () => {
  it('counts people in halls, hotels, hospitals and warehouses', () => {
    expect(occupantsOf(room('a', 'Main hall', 0, 0, 20, 14), 'hall')).toBe(200);
    expect(occupantsOf(room('a', 'Wedding hall', 0, 0, 14, 10), 'hall')).toBe(100);
    expect(occupantsOf(room('a', 'Guest room', 0, 0, 4, 6), 'hotel')).toBe(2);
    expect(occupantsOf(room('a', 'Warehouse', 0, 0, 30, 20), 'warehouse')).toBe(13);
    expect(wcsNeeded(150, 'restaurant')).toBe(2);
  });

  it('asks for wide corridors in a hospital, and counts library WCs and accessible WCs', () => {
    const hospital = {
      ...building(box(30, 20), [room('c', 'Corridor', 0, 0, 2, 20), room('w', 'Ward', 2, 0, 28, 20)]),
    };
    const doc: PlanDoc = { ...hospital, project: { type: 'building', use: 'hospital', units: 'metric' } };
    expect(ids(doc)).toContain('use-corridor-c');
    const wc = (id: string, kind: Furniture['kind']): Furniture => ({
      id,
      type: 'furniture',
      kind,
      x: 100,
      y: 100,
      w: 90,
      h: 150,
    });
    const withWcs: PlanDoc = { ...doc, elements: [...doc.elements, wc('f1', 'wc-cubicle'), wc('f2', 'accessible-wc')] };
    expect(ids(withWcs)).not.toContain('use-toilets');
    expect(ids(withWcs)).not.toContain('use-accessible-toilet');
  });

  it('turns the hints into one row per kind, met or not', () => {
    const doc = building(box(10, 9.3), [room('o', 'Open office', 0, 0, 10, 9.3)]);
    const rows = buildingUseRows(hintsOfUse(doc), buildingPeople(doc, 'office'));
    expect(rows.find((r) => r.id === 'use-wcs')?.status).toBe('fail');
    expect(rows.find((r) => r.id === 'use-stairs')?.status).toBe('ok');
    expect(buildingUseRows([], 0).map((r) => r.id)).toEqual(['use-people']);
    const check = fullCheck(doc, { wallHeightMm: 3000, units: 'metric' })!;
    expect(check.rows.some((r) => r.id === 'use-wcs')).toBe(true);
  });

  it('asks for WCs to be placed rather than failing, and says which rows are not needed (1.43.1)', () => {
    const doc = building(box(10, 10), [room('o', 'Office', 0, 0, 7, 10), room('t', 'Toilet', 7, 0, 3, 3)]);
    const rows = fullCheck(doc, { wallHeightMm: 3000, units: 'metric' })!.rows;
    const row = (id: string) => rows.find((r) => r.id === id)!;
    expect(row('use-wcs').status).toBe('check');
    expect(row('use-stairs').actual).toMatch(/^Not needed/);
    expect(row('use-ramp').actual).toMatch(/^Not needed/);
    expect(row('use-lift').actual).toMatch(/^Not needed/);
    expect(row('use-exits').actual).toContain('needs 1 exit to outside');
  });
});
