import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { MM_PER_FOOT } from '../lib/units';
import { dimLine } from '../lib/dimLine';
import { createPlannerStore } from '../store/plannerStore';
import type { Dimension, PlanDoc, Wall } from '../types';
import { applyMeasure, hover, measureReadout, press, release, toolHint } from './controller';

const FT = MM_PER_FOOT / 10; // plan units per foot
const W1: Wall = { id: 'w1', type: 'wall', x1: 0, y1: 0, x2: 20 * FT, y2: 0, thickness: 22.86 };
const W2: Wall = { id: 'w2', type: 'wall', x1: 20 * FT, y1: 0, x2: 20 * FT, y2: 12 * FT, thickness: 22.86 };
const ARC: Wall = {
  id: 'arc',
  type: 'wall',
  x1: 0,
  y1: 30 * FT,
  x2: 20 * FT,
  y2: 30 * FT,
  bow: 5 * FT,
  thickness: 22.86,
};

const setup = (doc: PlanDoc = { ...emptyDoc(), elements: [W1, W2, ARC] }) => {
  const store = createPlannerStore(doc, undefined, DEFAULT_PREFS);
  store.getState().setViewport({ width: 1000, height: 800 });
  store.getState().setTool('dimension');
  return store;
};
const click = (store: ReturnType<typeof setup>, x: number, y: number) => {
  hover(store, { x, y });
  press(store, { x, y });
  release(store, false);
};
const dims = (store: ReturnType<typeof setup>) =>
  store.getState().doc.elements.filter((e): e is Dimension => e.type === 'dimension');

describe('the Dimension tool', () => {
  it('places a horizontal dimension on a wall’s ends, which then follows the wall', () => {
    const store = setup();
    click(store, 0, 0);
    click(store, 20 * FT, 0);
    hover(store, { x: 10 * FT, y: -3 * FT });
    expect(measureReadout(store.getState())).toEqual({ label: 'Dimension', value: `20' 0"` });
    click(store, 10 * FT, -3 * FT);
    const [d] = dims(store);
    expect(d).toMatchObject({ angle: 0, tie1: { id: 'w1' }, tie2: { id: 'w1' } });
    expect(store.getState().draft).toBeNull();
    // Lengthen the wall: the dimension reads the new length.
    store.getState().updateElement({ ...W1, x2: 25 * FT });
    expect(dimLine(dims(store)[0]).value).toBeCloseTo(25 * FT);
  });

  it('goes vertical when the pointer goes sideways, and takes a typed distance off the points', () => {
    const store = setup();
    click(store, 20 * FT, 0);
    click(store, 20 * FT, 12 * FT);
    hover(store, { x: 25 * FT, y: 6 * FT });
    expect(applyMeasure(store, `4'`)).toBe(true);
    const [d] = dims(store);
    expect(d.angle).toBe(90);
    expect(dimLine(d).a.x).toBeCloseTo(24 * FT);
    expect(dimLine(d).value).toBeCloseTo(12 * FT);
  });

  it('measures aligned, and carries on in a chain', () => {
    const store = setup();
    store.getState().setSite({ dimMode: 'aligned', dimChain: true });
    click(store, 0, 0);
    click(store, 8 * FT, 0);
    click(store, 4 * FT, -2 * FT);
    expect(store.getState().draft).toMatchObject({ type: 'dimension', chain: { angle: 0 } });
    expect(toolHint(store.getState())).toContain('chain');
    click(store, 14 * FT, 0);
    hover(store, { x: 18 * FT, y: 0 });
    expect(applyMeasure(store, `6'`)).toBe(true);
    const all = dims(store);
    expect(all).toHaveLength(3);
    expect(all.map((d) => Math.round(dimLine(d).value / FT))).toEqual([8, 6, 6]);
    // All on one line.
    expect(new Set(all.map((d) => Math.round(dimLine(d).a.y)))).toEqual(new Set([Math.round(-2 * FT)]));
  });

  it('shows a curved wall’s radius with one click', () => {
    const store = setup();
    store.getState().setSite({ dimMode: 'radius' });
    // The middle of the arc, bowing 5' down the plan from its chord.
    click(store, 10 * FT, 35 * FT);
    const [d] = dims(store);
    expect(d.radius).toBe(true);
    // r = c²/8s + s/2 = 400/40 + 2.5 = 12.5'.
    expect(dimLine(d).value / FT).toBeCloseTo(12.5, 3);
    click(store, 300 * FT, 300 * FT);
    expect(dims(store)).toHaveLength(1);
    expect(store.getState().warnings.length).toBeGreaterThan(0);
  });
});
