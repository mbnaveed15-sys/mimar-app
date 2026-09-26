import { describe, expect, it } from 'vitest';
import { authorityById, plotMeasures, plotRule, plotSetbacks, ruleFor } from './bylaws';
import { builtAreaSqFt, planCheck } from './planCheck';
import { emptyDoc } from './storage';
import { plotRect } from './site';
import type { PlanDoc, PlanElement, Plot, Room } from '../types';

const FT = 30.48; // plan units per foot
const ft = (x: number, y: number) => ({ x: x * FT, y: y * FT });
const cda = authorityById('cda')!;

/** A plot w × d feet with the road along the bottom, under an authority. */
const plotOf = (w: number, d: number, authority: Plot['authority']): Plot => {
  const plot: Plot = {
    id: 'p',
    type: 'plot',
    points: plotRect(ft(0, 0), ft(w, d)),
    front: 2,
    setbacks: { front: 0, rear: 0, sides: 0 },
    authority,
  };
  const rule = plotRule(plot)?.rule;
  return rule ? { ...plot, setbacks: plotSetbacks(rule) } : plot;
};
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, levelId?: string): PlanElement => ({
  id,
  type: 'wall',
  ...{ x1: x1 * FT, y1: y1 * FT, x2: x2 * FT, y2: y2 * FT },
  thickness: 23,
  ...(levelId ? { levelId } : {}),
});
const room = (id: string, name: string, x: number, y: number, w: number, d: number): Room => ({
  id,
  name,
  points: plotRect(ft(x, y), ft(x + w, y + d)),
});
const ctx = { wallHeightMm: 3048, units: 'imperial' as const };
const docOf = (elements: PlanElement[], rooms: Room[] = []): PlanDoc => ({
  ...emptyDoc(),
  plinthMm: 457.2,
  elements,
  rooms,
});

describe('bylaw tables', () => {
  it('picks a CDA plot type by frontage first, then size', () => {
    expect(ruleFor(cda, 25 * 50, 25)?.label).toMatch(/up to 150/);
    expect(ruleFor(cda, 30 * 60, 30)?.label).toMatch(/151–200/);
    expect(ruleFor(cda, 50 * 90, 50)?.label).toMatch(/Type C, 400–1000/);
    // A 40×80 plot (356 sq yd) is type A by its frontage, not type B.
    expect(ruleFor(cda, 40 * 80, 40)?.label).toMatch(/Type A, 300–450/);
  });

  it('measures a plot and gives its setbacks, side 1 and side 2 either way round', () => {
    const plot = plotOf(50, 90, 'cda');
    expect(plotMeasures(plot).areaSqFt).toBeCloseTo(4500);
    expect(plotMeasures(plot).frontageFt).toBeCloseTo(50);
    const rule = plotRule(plot)!.rule!;
    expect(plotSetbacks(rule).front).toBeCloseTo(15 * 304.8);
    const lop = authorityById('dha-isb')!.rules[1]; // 201–249: side 1 only
    expect(plotSetbacks(lop)).toMatchObject({ sides: 3 * 304.8, side2: 0 });
    expect(plotSetbacks(lop, true)).toMatchObject({ sides: 0, side2: 3 * 304.8 });
  });

  it('uses Lahore marla for DHA Lahore and tells the two 2 kanal plots apart', () => {
    const dha = authorityById('dha-lhr')!;
    expect(ruleFor(dha, 25 * 45, 25)?.label).toBe('5 marla');
    expect(ruleFor(dha, 100 * 90, 100)?.label).toBe('2 kanal (100×90)');
    expect(ruleFor(dha, 75 * 120, 75)?.label).toBe('2 kanal (75×120)');
  });
});

describe('plan check', () => {
  it('has nothing to check without a plot under bylaws', () => {
    expect(planCheck(docOf([plotOf(50, 90, undefined)]), ctx)).toBeNull();
  });

  it('passes a house inside the building line, and flags a wall that crosses it', () => {
    // CDA 50×90 type C: front 15', rear 10', sides 5'. Road along the bottom (y = 90).
    const plot = plotOf(50, 90, 'cda');
    const house = [
      wall('a', 6, 11, 44, 11),
      wall('b', 44, 11, 44, 74),
      wall('c', 44, 74, 6, 74),
      wall('d', 6, 74, 6, 11),
    ];
    const ok = planCheck(docOf([plot, ...house]), ctx)!;
    expect(ok.rule?.label).toMatch(/Type C/);
    expect(ok.rows.find((r) => r.id === 'setbacks')).toMatchObject({ status: 'ok', clause: 'Schedule-I' });
    expect(ok.rows.find((r) => r.id === 'storeys')).toMatchObject({ status: 'ok', actual: '1' });
    // Pushed 5' towards the road: into the 15' front setback.
    const out = planCheck(docOf([plot, ...house, wall('e', 6, 80, 44, 80)]), ctx)!;
    expect(out.rows.find((r) => r.id === 'setbacks')).toMatchObject({ status: 'fail', ids: ['e'] });
  });

  it('checks height, rooms by name and the plinth', () => {
    const plot = plotOf(50, 90, 'cda');
    const doc = {
      ...docOf(
        [plot, wall('a', 6, 11, 44, 11), wall('b', 6, 11, 6, 40, 'first'), wall('c', 6, 11, 6, 40, 'roof')],
        [room('r1', 'Bedroom', 6, 11, 10, 8), room('r2', 'Kitchen', 20, 11, 8, 8), room('r3', 'Store', 30, 11, 3, 3)],
      ),
      levels: [
        { id: 'ground', name: 'Ground floor' },
        { id: 'first', name: 'First floor' },
        { id: 'roof', name: 'Second floor' },
      ],
    };
    const check = planCheck(doc, ctx)!;
    expect(check.rows.find((r) => r.id === 'storeys')).toMatchObject({ status: 'fail', actual: '3' });
    expect(check.rows.find((r) => r.id === 'height')?.status).toBe('fail');
    // Bedroom 80 sq ft (< 100); the store isn't a named kind of room.
    expect(check.rows.find((r) => r.id === 'rooms')).toMatchObject({ status: 'fail', ids: ['r1'] });
    expect(check.rows.find((r) => r.id === 'plinth')).toMatchObject({ status: 'ok' });
  });

  it('checks ground coverage and the first floor for DHA Islamabad, and a small house', () => {
    // 30×60 = 200 sq yd: up to 85% coverage.
    const plot = plotOf(30, 60, 'dha-isb');
    const big = [room('g', 'Lounge', 1, 1, 28, 55)];
    const check = planCheck(docOf([plot], big), ctx)!;
    expect(check.rows.find((r) => r.id === 'coverage')?.status).toBe('fail');
    expect(check.rows.find((r) => r.id === 'total')?.status).toBe('fail'); // < 2,000 sq ft
  });

  it('checks the mumty (not a storey) for DHA Islamabad: area, height and width', () => {
    const plot = plotOf(50, 90, 'dha-isb'); // 500 sq yd: mumty up to 9% = 405 sq ft
    const box = (x: number, y: number, w: number, d: number, levelId: string, tag: string) => [
      wall(`${tag}1`, x, y, x + w, y, levelId),
      wall(`${tag}2`, x + w, y, x + w, y + d, levelId),
      wall(`${tag}3`, x + w, y + d, x, y + d, levelId),
      wall(`${tag}4`, x, y + d, x, y, levelId),
    ];
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'first', name: 'First floor' },
      { id: 'roof', name: 'Roof' },
    ];
    const house = [...box(10, 20, 30, 50, 'ground', 'g'), ...box(10, 20, 30, 50, 'first', 'f')];
    const small = planCheck({ ...docOf([plot, ...house, ...box(15, 30, 15, 20, 'roof', 'm')]), levels }, ctx)!;
    const row = (c: typeof small, id: string) => c.rows.find((r) => r.id === id);
    expect(row(small, 'storeys')?.actual).toBe('2');
    expect(row(small, 'mumty-area')?.status).toBe('ok');
    expect(row(small, 'mumty-area')?.required).toMatch(/^At most 405 sq ft/);
    expect(row(small, 'mumty-height')?.status).toBe('ok'); // 10' walls + slab, under 11'
    expect(row(small, 'mumty-width')?.status).toBe('ok');
    const big = planCheck({ ...docOf([plot, ...house, ...box(10, 30, 30, 20, 'roof', 'm')]), levels }, ctx)!;
    expect(row(big, 'mumty-area')?.status).toBe('fail');
    expect(row(big, 'mumty-width')?.status).toBe('fail'); // 30' is more than half of 50'
    expect(row(big, 'mumty-width')?.ids).toHaveLength(4);
  });

  it('gives CDA a mumty of a third of the buildable block, left out of the height', () => {
    const plot = plotOf(30, 60, 'cda'); // 200 sq yd: 6' front and rear, no sides
    const levels = [
      { id: 'ground', name: 'Ground floor' },
      { id: 'mumty', name: 'Mumty' },
    ];
    const check = planCheck(
      { ...docOf([plot, wall('g', 0, 10, 30, 10), wall('m', 0, 20, 10, 20, 'mumty')]), levels },
      ctx,
    )!;
    expect(check.rows.find((r) => r.id === 'mumty-area')?.required).toMatch(/^At most 480 sq ft/);
    expect(check.rows.find((r) => r.id === 'height')?.actual).toMatch(/without the mumty/);
    expect(check.rows.find((r) => r.id === 'storeys')?.actual).toBe('1');
  });

  it('checks the car porch size for DHA Islamabad', () => {
    const plot = plotOf(50, 90, 'dha-isb'); // 500 sq yd: up to 30' × 35'
    const ok = planCheck(docOf([plot], [room('cp', 'Car porch', 5, 60, 20, 30)]), ctx)!;
    expect(ok.rows.find((r) => r.id === 'car-porch')?.status).toBe('ok');
    const long = planCheck(docOf([plot], [room('cp', 'Car porch', 5, 50, 20, 36)]), ctx)!;
    expect(long.rows.find((r) => r.id === 'car-porch')?.status).toBe('fail');
    const two = planCheck(
      docOf([plot], [room('a', 'Porch', 5, 60, 18, 18), room('b', 'Porch 2', 30, 60, 18, 18)]),
      ctx,
    )!;
    expect(two.rows.find((r) => r.id === 'car-porch')?.status).toBe('check');
  });

  it('measures covered area to the outer faces of the walls, counting each wall once and no lawns', () => {
    // A 20' × 30' house (wall centre lines) with a middle wall; 9" walls. Its outer faces are 20.75' × 30.75'.
    const house = [
      wall('t', 0, 0, 20, 0),
      wall('r', 20, 0, 20, 30),
      wall('b', 20, 30, 0, 30),
      wall('l', 0, 30, 0, 0),
      wall('m', 0, 15, 20, 15),
    ];
    const rooms = [
      room('a', 'Bedroom', 0, 0, 20, 15),
      room('b', 'Lounge', 0, 15, 20, 15),
      room('g', 'Lawn', 0, 40, 20, 10),
    ];
    const t = 23 / 30.48; // wall thickness in feet
    // Within a square foot: the four outside corner squares are left out.
    expect(Math.abs(builtAreaSqFt(docOf(house, rooms), 'ground') - (20 + t) * (30 + t))).toBeLessThan(1);
    // A courtyard enclosed by walls isn't covered (its walls are): about its 19' × 14' of open floor less.
    const full = builtAreaSqFt(docOf(house, rooms), 'ground');
    const court = builtAreaSqFt(
      docOf(house, [room('a', 'Bedroom', 0, 0, 20, 15), room('c', 'Courtyard', 0, 15, 20, 15)]),
      'ground',
    );
    expect(full - court).toBeCloseTo((20 - t) * (15 - t), -1);
  });

  it('takes baths named after bedrooms as baths, and picks bylaw rows by size when frontage alone would mislead', () => {
    const plot = plotOf(50, 90, 'cda');
    const check = planCheck(docOf([plot], [room('gb', 'Guest bath', 10, 20, 5, 8)]), ctx)!;
    expect(check.rows.find((r) => r.id === 'rooms')?.status).toBe('ok'); // 40 sq ft: fine for a bathroom
    // A 40×80 plot with the road on its long side is still type A by its size (356 sq yd), not type D.
    expect(ruleFor(cda, 40 * 80, 80)?.label).toMatch(/Type A, 300–450/);
    // LDA: a 1 kanal plot is in the 1–2 kanal band.
    expect(ruleFor(authorityById('lda')!, 50 * 90, 50)?.label).toBe('1–2 kanal');
  });
});
