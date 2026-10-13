import { describe, expect, it } from 'vitest';
import { authorityById, plotRule, plotSetbacks, ruleFor } from './bylaws';
import { buildingAreaFor, buildingBylawsFor, buildingRuleFor, type BuildingMeasures } from './buildingBylaws';
import { appliedRule, appliedSetbacks } from './buildingCheck';
import { fullCheck } from './fullCheck';
import { planCheck } from './planCheck';
import { emptyDoc } from './storage';
import { plotRect } from './site';
import type { BuildingUse, PlanDoc, PlanElement, Plot, Room } from '../types';

const FT = 30.48; // plan units per foot
const MM_FT = 304.8;
const ft = (x: number, y: number) => ({ x: x * FT, y: y * FT });

/** A plot w × d feet with the road along the bottom, under an authority, with the setbacks given (ft). */
const plotOf = (
  w: number,
  d: number,
  authority: Plot['authority'],
  extra: Partial<Plot> = {},
  [front, rear, side1, side2]: number[] = [0, 0, 0, 0],
): Plot => ({
  id: 'p',
  type: 'plot',
  points: plotRect(ft(0, 0), ft(w, d)),
  front: 2,
  setbacks: { front: front * MM_FT, rear: rear * MM_FT, sides: side1 * MM_FT, side2: side2 * MM_FT },
  authority,
  ...extra,
});
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, levelId?: string): PlanElement => ({
  id,
  type: 'wall',
  ...{ x1: x1 * FT, y1: y1 * FT, x2: x2 * FT, y2: y2 * FT },
  thickness: 23,
  ...(levelId ? { levelId } : {}),
});
/** Four walls round a box, on a floor. */
const box = (x: number, y: number, w: number, d: number, levelId = 'ground', tag = levelId) => [
  wall(`${tag}1`, x, y, x + w, y, levelId),
  wall(`${tag}2`, x + w, y, x + w, y + d, levelId),
  wall(`${tag}3`, x + w, y + d, x, y + d, levelId),
  wall(`${tag}4`, x, y + d, x, y, levelId),
];
const room = (id: string, name: string, x: number, y: number, w: number, d: number, levelId?: string): Room => ({
  id,
  name,
  points: plotRect(ft(x, y), ft(x + w, y + d)),
  ...(levelId ? { levelId } : {}),
});
const ctx = { wallHeightMm: 3048, units: 'imperial' as const };
const buildingDoc = (use: BuildingUse, elements: PlanElement[], rooms: Room[] = []): PlanDoc => ({
  ...emptyDoc(),
  plinthMm: 0,
  elements,
  rooms,
  project: { type: 'building', use },
});
const measures = (sqft: number, use: BuildingUse, extra: Partial<BuildingMeasures> = {}): BuildingMeasures => ({
  sqft,
  frontageFt: 50,
  depthFt: sqft / 50,
  use,
  storeys: 1,
  ...extra,
});

describe('building bylaws', () => {
  const cda = buildingBylawsFor('cda')!;
  const dha = buildingBylawsFor('dha-isb')!;
  const lda = buildingBylawsFor('lda-builtup')!;

  it('has building bylaws for CDA, DHA Islamabad and every LDA area, and none for DHA Lahore', () => {
    expect(buildingBylawsFor('cda-private')?.name).toBe('CDA');
    expect(dha.name).toMatch(/DHA Islamabad/);
    expect(buildingBylawsFor('lda')).toBe(lda);
    expect(buildingBylawsFor('dha-lhr')).toBeUndefined();
    expect(buildingBylawsFor(undefined)).toBeUndefined();
  });

  it('starts each use on its usual area', () => {
    expect(buildingAreaFor(cda, undefined, 'office').id).toBe('cda-markaz');
    expect(buildingAreaFor(cda, undefined, 'school').id).toBe('cda-education');
    expect(buildingAreaFor(cda, undefined, 'factory').id).toBe('cda-industrial');
    expect(buildingAreaFor(dha, undefined, 'shop').id).toBe('dha-sector');
    expect(buildingAreaFor(dha, undefined, 'hospital').id).toBe('dha-amenity');
    expect(buildingAreaFor(lda, undefined, 'apartments').id).toBe('lda-apartments');
    expect(buildingAreaFor(lda, undefined, 'mosque').id).toBe('lda-public');
    // A picked area wins; an unknown one falls back.
    expect(buildingAreaFor(cda, 'cda-blue-north', 'office').id).toBe('cda-blue-north');
    expect(buildingAreaFor(cda, 'lda-cbd', 'office').id).toBe('cda-markaz');
  });

  it('reads CDA’s tables: Markaz and Blue Area categories, and industrial setbacks', () => {
    const markaz = buildingAreaFor(cda, 'cda-markaz', 'office');
    expect(markaz.limits(measures(899 * 9, 'office'))).toMatchObject({ far: 5, maxStoreys: 7 });
    expect(markaz.limits(measures(900 * 9, 'office'))).toMatchObject({ far: 6, maxStoreys: 9 });
    const blue = buildingAreaFor(cda, 'cda-blue-north', 'office');
    expect(blue.limits(measures(2000 * 9, 'office'))).toMatchObject({ far: 8, verandaMm: 7 * MM_FT });
    const industrial = buildingAreaFor(cda, 'cda-industrial', 'factory');
    expect(industrial.limits(measures(2000 * 9, 'factory', { storeys: 3 }))).toMatchObject({
      far: 1.5,
      altSides: [10, 20],
    });
    expect(industrial.limits(measures(2000 * 9, 'factory', { storeys: 3 })).setbacks?.front).toBeCloseTo(40 * MM_FT);
  });

  it('picks LDA’s height zone by plot size and road width', () => {
    const converted = buildingAreaFor(lda, 'lda-converted', 'shop');
    const two = 2 * 4500;
    expect(converted.limits(measures(two, 'shop', { roadFt: 40 }))).toMatchObject({ far: 6, maxStoreys: 10 });
    // A 30' road keeps it low rise (50'), whatever the size.
    const low = converted.limits(measures(two, 'shop', { roadFt: 30 }));
    expect(low.label).toMatch(/^Low rise/);
    expect(low.heightMm).toBeCloseTo(50 * MM_FT);
    // Without the road's width: by size, with a row asking for it.
    const untyped = converted.limits(measures(two, 'shop'));
    expect(untyped.label).toBe('Mid rise-2');
    expect(untyped.notes?.some((n) => n.id === 'bylaw-road')).toBe(true);
    // Apartments: low rise is 48'.
    const flats = buildingAreaFor(lda, 'lda-apartments', 'apartments').limits(measures(12 * 225, 'apartments'));
    expect(flats.heightMm).toBeCloseTo(48 * MM_FT);
  });

  it('works out parking and facilities by the authority’s rules', () => {
    const none = { coveredSqFt: 0, rooms: 0, flats: 0, beds: 0, classrooms: 0, clinicalSqFt: 0 };
    const markaz = buildingAreaFor(cda, 'cda-markaz', 'office').limits(measures(1000 * 9, 'office'));
    expect(cda.parking('office', { ...none, coveredSqFt: 7500 }, markaz)?.cars).toBe(10);
    expect(dha.parking('shop', { ...none, coveredSqFt: 5000 }, markaz)?.cars).toBe(10);
    expect(dha.parking('school', { ...none, coveredSqFt: 4000, classrooms: 12 }, markaz)?.cars).toBe(3);
    expect(lda.parking('hotel', { ...none, rooms: 30 }, markaz)?.cars).toBe(5);
    expect(dha.facilities.lift({ storeys: 1, sqft: 2000, use: 'shop' }).needed).toBe(true);
    expect(lda.facilities.lift({ storeys: 3, sqft: 7 * 225, use: 'shop' }).needed).toBe(false);
    expect(lda.facilities.lift({ storeys: 3, sqft: 8 * 225, use: 'shop' }).needed).toBe(true);
    expect(dha.facilities.emergencyStairs({ storeys: 4, sqft: 399 * 9, heightMm: 0 }).count).toBe(0);
    expect(dha.facilities.emergencyStairs({ storeys: 4, sqft: 400 * 9, heightMm: 0 }).count).toBe(1);
    expect(cda.facilities.emergencyStairs({ storeys: 5, sqft: 0, heightMm: 0 }).count).toBe(1);
  });
});

describe('LDA houses', () => {
  const lda = authorityById('lda')!;

  it('is official, with coverage, FAR and height by plot size', () => {
    expect(lda.status).toBe('official');
    expect(ruleFor(lda, 4 * 225, 25)).toMatchObject({ label: 'Under 5 marla', coveragePct: 80, far: 2.4 });
    expect(ruleFor(lda, 4 * 225, 25)?.setbacks.rear).toBeCloseTo(5 * MM_FT);
    expect(ruleFor(lda, 10 * 225, 45)).toMatchObject({ label: '10 marla to under 1 kanal', far: 2.8 });
    expect(ruleFor(lda, 10 * 225, 45)?.heightMm).toBeCloseTo(45 * MM_FT);
    expect(ruleFor(lda, 25 * 225, 60)?.label).toBe('1 kanal to 30 marla');
    expect(ruleFor(lda, 35 * 225, 60)?.label).toBe('Over 30 marla to under 2 kanal');
    expect(ruleFor(lda, 4 * 4500, 100)?.setbacks.rear).toBeCloseTo(13 * MM_FT);
  });

  it('uses the older table on narrow roads in built-up areas, and frontage in open areas', () => {
    const plot = plotOf(30, 60, 'lda-builtup', { roadWidthMm: 20 * MM_FT }); // 8 marla, 20' road
    const narrow = plotRule(plot)!.rule!;
    expect(narrow).toMatchObject({ coveragePct: 80, far: 1.6 });
    expect(narrow.heightMm).toBeCloseTo(38 * MM_FT);
    expect(narrow.frontAsTyped).toBeTruthy();
    const wide = plotRule({ ...plot, roadWidthMm: 40 * MM_FT })!.rule!;
    expect(wide).toMatchObject({ coveragePct: 75, far: 2.3 });
    expect(wide.frontAsTyped).toBeUndefined();
    const open = plotRule(plotOf(40, 60, 'lda-open'))!.rule!;
    expect(open.setbacks.side1).toBeCloseTo(5 * MM_FT);
    expect(open.setbacks.side2).toBeCloseTo(5 * MM_FT);
  });

  it('checks the FAR and the height of the table row', () => {
    const plot = plotOf(25, 40, 'lda'); // 1,000 sq ft, under 5 marla: 1:2.4, 38'
    const s = plotSetbacks(plotRule(plot)!.rule!);
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'first', name: 'First floor' },
      { id: 'second', name: 'Second floor' },
      { id: 'third', name: 'Third floor' },
    ];
    const floors = levels.flatMap((l) => box(1, 6, 23, 28, l.id));
    const doc: PlanDoc = { ...emptyDoc(), elements: [{ ...plot, setbacks: s }, ...floors], levels };
    const check = planCheck(doc, ctx)!;
    expect(check.rows.find((r) => r.id === 'far')).toMatchObject({ status: 'fail', clause: '2.2.3' });
    expect(check.rows.find((r) => r.id === 'height')?.required).toMatch(/^At most 38'/);
    expect(check.rows.find((r) => r.id === 'storeys')).toMatchObject({ status: 'fail', actual: '4' });
  });
});

describe('building check', () => {
  it('checks a CDA Markaz office: its area, FAR, parking under 900 sq yd, lift and ramp', () => {
    const plot = plotOf(60, 100, 'cda'); // 667 sq yd: category 1
    const doc = buildingDoc('office', [plot, ...box(5, 5, 50, 90)], [room('o', 'Office', 5, 5, 50, 90)]);
    const check = fullCheck(doc, ctx)!;
    const row = (id: string) => check.rows.find((r) => r.id === id);
    expect(check.note).toBe('Markaz (commercial plots; also private schemes): Category 1, up to 899 sq yd');
    expect(row('building-bylaws')).toBeUndefined();
    // Not picked yet: a row asks for the area (the note above already names it and its table row).
    expect(row('bylaw-area')).toMatchObject({ status: 'check' });
    expect(row('setbacks')?.clause).toBe('Plot’s own');
    expect(row('bylaw-far')?.status).toBe('ok');
    expect(row('bylaw-storeys')).toMatchObject({ status: 'ok', actual: '1' });
    // A Markaz plot needs parking whatever its size: 1 per 750 sq ft.
    expect(row('bylaw-parking')).toMatchObject({ status: 'fail' });
    expect(row('bylaw-parking')?.required).toMatch(/1 per 750 sq ft/);
    expect(row('bylaw-ramp')?.status).toBe('fail');
    // One row for the ramp: the access code's own ramp row isn't repeated.
    expect(row('use-ramp')).toBeUndefined();
    expect(check.rows.filter((r) => r.label === 'Ramp to the entrance')).toHaveLength(1);
    expect(new Set(check.rows.map((r) => r.id)).size).toBe(check.rows.length);
    expect(row('bylaw-lift')).toBeUndefined(); // one storey
    expect(row('bylaw-veranda')?.status).toBe('check');
    expect(row('bylaw-public-toilets')?.status).toBe('check');
    // The building-use rows still follow.
    expect(row('use-exits')).toBeDefined();
    // Elsewhere, CDA needs parking only above 900 sq yd.
    const class3 = fullCheck({ ...doc, elements: [{ ...plot, bylawArea: 'cda-class3' }, ...box(5, 5, 50, 90)] }, ctx)!;
    expect(class3.rows.find((r) => r.id === 'bylaw-parking')).toMatchObject({ status: 'ok' });
    expect(class3.rows.find((r) => r.id === 'bylaw-parking')?.required).toMatch(/^Not needed/);
  });

  it('checks a DHA sector commercial building: footprint, lift, parking and height', () => {
    const plot = plotOf(30, 60, 'dha-isb'); // 200 sq yd
    const rooms = [room('s', 'Shop', 1, 1, 28, 40), room('p', 'Parking', 1, 41, 28, 18)];
    const doc = buildingDoc('shop', [plot, ...box(0.5, 0.5, 29, 59)], rooms);
    const check = fullCheck(doc, ctx)!;
    const row = (id: string) => check.rows.find((r) => r.id === id);
    expect(check.building?.area.id).toBe('dha-sector');
    expect(row('bylaw-plot')?.status).toBe('ok');
    expect(row('bylaw-coverage')?.status).toBe('ok');
    expect(row('bylaw-height')?.status).toBe('ok');
    expect(row('bylaw-lift')?.status).toBe('fail');
    // 504 sq ft of parking is 2 cars at 250 sq ft; the shop's floor area needs 3 at 1 per 500.
    expect(row('bylaw-parking')).toMatchObject({ status: 'fail' });
    expect(row('bylaw-parking')?.actual).toMatch(/^2 cars/);
    expect(row('bylaw-shops')?.status).toBe('ok');
    const withLift = fullCheck({ ...doc, rooms: [...rooms, room('l', 'Lift', 25, 1, 4, 4)] }, ctx)!;
    expect(withLift.rows.find((r) => r.id === 'bylaw-lift')?.status).toBe('ok');
    // Main commercial, picked: B+G+5.
    const main = fullCheck({ ...doc, elements: [{ ...plot, bylawArea: 'dha-main' }, ...doc.elements.slice(1)] }, ctx)!;
    expect(main.rows.find((r) => r.id === 'bylaw-area')).toBeUndefined();
    expect(main.note).toMatch(/^Main commercial/);
    expect(main.rows.find((r) => r.id === 'bylaw-storeys')?.required).toMatch(/^At most 6/);
  });

  it('checks an LDA converted plot with the typed front, and its road width', () => {
    const plot = plotOf(40, 112.5, 'lda-builtup', {}, [15, 7, 5, 0]); // 4,500 sq ft: 1 kanal
    const doc = buildingDoc('shop', [plot, ...box(6, 10, 28, 85)]);
    const rule = appliedRule(doc, plot)!;
    expect(rule.frontAsTyped).toBeTruthy();
    // The rear and sides from the table (3.6.1); the front stays as typed.
    expect(appliedSetbacks(rule, plot)).toMatchObject({ front: 15 * MM_FT });
    expect(appliedSetbacks(rule, plot).rear).toBeCloseTo(7 * MM_FT);
    const check = fullCheck(doc, ctx)!;
    const row = (id: string) => check.rows.find((r) => r.id === id);
    expect(row('setbacks')).toMatchObject({ status: 'ok', clause: '3.6.1' });
    expect(row('setbacks')?.required).toMatch(/^Front 15' 0" as typed/);
    expect(row('building-line')?.status).toBe('check');
    expect(row('bylaw-lift')?.status).toBe('fail'); // above 7 marla
    // Its zone goes by the road's width too: a row asks for it until it is typed.
    expect(row('bylaw-road')?.status).toBe('check');
    const typed = fullCheck(
      { ...doc, elements: [{ ...plot, roadWidthMm: 30 * MM_FT }, ...doc.elements.slice(1)] },
      ctx,
    )!;
    expect(typed.rows.find((r) => r.id === 'bylaw-road')).toBeUndefined();
    expect(typed.note).toMatch(/Low rise, road 30'/);
  });

  it('passes CDA industrial setbacks either way: 15’ and 15’, or 10’ and 20’', () => {
    const plot = plotOf(100, 200, 'cda', { bylawArea: 'cda-industrial' }, [30, 10, 10, 20]);
    const doc = buildingDoc('factory', [plot, ...box(25, 15, 50, 150)]);
    const check = fullCheck(doc, ctx)!;
    const row = (id: string) => check.rows.find((r) => r.id === id);
    expect(row('setbacks')?.required).toMatch(/\(or 10' 0" \/ 20' 0"\)/);
    expect(row('setbacks')?.status).toBe('ok');
    // The sides checked are the typed pair, not 15' and 15'.
    const sides = check.rows.filter((r) => r.id.startsWith('setback-side-')).map((r) => r.required);
    expect(sides).toEqual(expect.arrayContaining(['At least 10\' 0"', 'At least 20\' 0"']));
  });

  it('merges the lift rows of the authority and the access code into one', () => {
    const plot = plotOf(30, 60, 'dha-isb');
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'first', name: 'First floor' },
    ];
    const doc: PlanDoc = {
      ...buildingDoc(
        'office',
        [plot, ...box(0.5, 0.5, 29, 59), ...box(0.5, 0.5, 29, 59, 'first')],
        [room('o', 'Office', 1, 1, 28, 58), room('u', 'Office', 1, 1, 28, 58, 'first')],
      ),
      levels,
    };
    const rows = fullCheck(doc, ctx)!.rows;
    expect(rows.filter((r) => r.label === 'Lift')).toHaveLength(1);
    const lift = rows.find((r) => r.id === 'bylaw-lift')!;
    expect(lift.status).toBe('fail');
    expect(lift.clause).toBe('8.91.2; ACP 2006');
    expect(rows.find((r) => r.id === 'use-lift')).toBeUndefined();
  });

  it('leaves the sides CDA doesn’t fix to the plot, and asks for the road once', () => {
    // Blue Area south: only the sides are fixed; the front and rear are the plot's own.
    const plot = plotOf(60, 100, 'cda', { bylawArea: 'cda-blue-south' }, [12, 8, 5, 5]);
    const doc = buildingDoc('office', [plot, ...box(6, 9, 48, 78)]);
    const rule = appliedRule(doc, plot)!;
    expect(appliedSetbacks(rule, plot)).toMatchObject({ front: 12 * MM_FT, rear: 8 * MM_FT });
    const row = fullCheck(doc, ctx)!.rows.find((r) => r.id === 'setbacks')!;
    expect(row.required).toMatch(/rear 8' 0" as typed/);
    expect(row.status).toBe('ok');
    // LDA apartments: the area's own road row, not a second one from the zone.
    const flats = buildingDoc('apartments', [plotOf(50, 90, 'lda'), ...box(10, 10, 30, 60)]);
    expect(fullCheck(flats, ctx)!.rows.filter((r) => r.id === 'bylaw-road')).toHaveLength(1);
  });

  it('keeps the old row for authorities without building bylaws', () => {
    const doc = buildingDoc('office', [plotOf(50, 90, 'bahria-lhr'), ...box(10, 10, 20, 20)]);
    const check = fullCheck(doc, ctx)!;
    expect(check.rows.find((r) => r.id === 'building-bylaws')?.status).toBe('check');
    expect(check.rows.some((r) => r.id.startsWith('bylaw-'))).toBe(false);
  });

  it('works out the rule from the plot, the use and the storeys', () => {
    const plot = plotOf(60, 100, 'cda', { roadWidthMm: 100 * MM_FT });
    const r = buildingRuleFor(plot, 'shop', 2)!;
    expect(r.measures).toMatchObject({ storeys: 2, use: 'shop' });
    expect(r.measures.roadFt).toBeCloseTo(100);
    expect(r.measures.depthFt).toBeCloseTo(100);
    expect(r.picked).toBe(false);
  });
});
