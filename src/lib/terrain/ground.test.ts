import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../storage';
import type { PlanDoc, PlanElement } from '../../types';
import { contourStepMm, groundOf, groundPoints, roundLevel, surveyItems } from './ground';
import { cutFillMap, groundContours, groundOnPlan, siteEarthworks } from './groundView';

/** A 10 m × 20 m plot (plan units: 10 mm), its road side along the bottom. */
const PLOT: PlanElement = {
  id: 'p',
  type: 'plot',
  front: 2,
  setbacks: { front: 0, rear: 0, sides: 0 },
  points: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 2000 },
    { x: 0, y: 2000 },
  ],
};

/** Ground rising 1 m from the road side (y = 2000) to the back (y = 0), a little past the plot. */
const SLOPE: PlanElement[] = [
  { id: 'a', type: 'level', x: -500, y: -500, zMm: 1250 },
  { id: 'b', type: 'level', x: 1500, y: -500, zMm: 1250 },
  { id: 'c', type: 'level', x: 1500, y: 2500, zMm: -250 },
  { id: 'd', type: 'level', x: -500, y: 2500, zMm: -250 },
];

const plan = (elements: PlanElement[], ground?: PlanDoc['ground']): PlanDoc => ({
  ...emptyDoc(),
  elements,
  ...(ground ? { ground } : {}),
});

describe('the ground', () => {
  it('is flat at ±0 with no levels, and nothing is cut or filled', () => {
    const g = groundOf(plan([PLOT]));
    expect(g.shaped).toBe(false);
    expect(g.graded).toBe(false);
    expect(g.naturalAt(500, 500)).toBe(0);
    expect(g.finishedAt(500, 500)).toBe(0);
    expect(siteEarthworks(g)).toEqual({ cutM3: 0, fillM3: 0, areaM2: 0 });
    expect(groundOnPlan(plan([PLOT]), false)).toBeNull();
  });

  it('follows the levels, and the plot is levelled to the road level by default', () => {
    const g = groundOf(plan([PLOT, ...SLOPE]));
    expect(g.shaped).toBe(true);
    expect(g.levelled).toBe(true);
    expect(g.naturalAt(500, 0)).toBeCloseTo(1000);
    expect(g.naturalAt(500, 2000)).toBeCloseTo(0);
    expect(g.finishedAt(500, 1000)).toBe(0);
    // Outside the plot the ground is left as it is.
    expect(g.finishedAt(1200, 1000)).toBeCloseTo(g.naturalAt(1200, 1000));
  });

  it('works out the earth to move: a wedge 10 m × 20 m rising 1 m is 100 m³ of cut', () => {
    const cut = siteEarthworks(groundOf(plan([PLOT, ...SLOPE])));
    expect(cut.cutM3).toBeCloseTo(100, 0);
    expect(cut.fillM3).toBeCloseTo(0, 5);
    expect(cut.areaM2).toBeCloseTo(200, 0);
    // Levelled half a metre up: 25 m³ cut at the back, 25 m³ filled at the front.
    const half = siteEarthworks(groundOf(plan([PLOT, ...SLOPE], { levelMm: 500 })));
    expect(half.cutM3).toBeCloseTo(25, 0);
    expect(half.fillM3).toBeCloseTo(25, 0);
    // Left natural: none.
    expect(siteEarthworks(groundOf(plan([PLOT, ...SLOPE], { grade: 'natural' }))).cutM3).toBe(0);
  });

  it('levels a pad at its own height, over the plot', () => {
    const pad: PlanElement = {
      id: 'pad',
      type: 'pad',
      zMm: 300,
      points: [
        { x: 200, y: 200 },
        { x: 800, y: 200 },
        { x: 800, y: 800 },
        { x: 200, y: 800 },
      ],
    };
    const g = groundOf(plan([PLOT, pad], { grade: 'natural' }));
    expect(g.graded).toBe(true);
    expect(g.finishedAt(500, 500)).toBe(300);
    expect(g.finishedAt(500, 1500)).toBe(0);
    // 6 m × 6 m raised 0.3 m.
    expect(siteEarthworks(g).fillM3).toBeCloseTo(10.8, 0);
  });

  it('draws contour lines at the interval, every fifth one heavier', () => {
    const g = groundOf(plan([PLOT, ...SLOPE]));
    const lines = groundContours(g, 250);
    // (A line exactly along the lowest edge of the survey isn't drawn.)
    expect(lines.map((c) => c.zMm)).toEqual([0, 250, 500, 750, 1000, 1250]);
    expect(lines.filter((c) => c.major).map((c) => c.zMm)).toEqual([0, 1250]);
    expect(contourStepMm(undefined, true)).toBe(500);
    expect(contourStepMm(undefined, false)).toBe(304.8);
    expect(contourStepMm({ contourMm: 1000 }, false)).toBe(1000);
  });

  it('tints cut and fill with a daylight line between them', () => {
    const map = cutFillMap(groundOf(plan([PLOT, ...SLOPE], { levelMm: 500 })));
    expect(map.cut.length).toBeGreaterThan(0);
    expect(map.fill.length).toBeGreaterThan(0);
    // The daylight line runs across the plot where the ground is at +0.5 m (halfway up, y = 1000).
    expect(map.daylight.length).toBeGreaterThan(0);
    for (const [a, b] of map.daylight) {
      expect(a.y).toBeCloseTo(1000, -1);
      expect(b.y).toBeCloseTo(1000, -1);
    }
    const shown = groundOnPlan(plan([PLOT, ...SLOPE], { cutFill: false }), false);
    expect(shown?.cutFill).toBeNull();
    expect(shown?.contours.length).toBeGreaterThan(0);
  });

  it('lets a survey win over satellite levels close to it', () => {
    const pts = groundPoints([
      { id: 's', type: 'level', x: 0, y: 0, zMm: 100 },
      { id: 'near', type: 'level', x: 500, y: 0, zMm: 900, approx: true },
      { id: 'far', type: 'level', x: 5000, y: 0, zMm: 900, approx: true },
    ]);
    expect(pts.map((p) => p.x)).toEqual([0, 5000]);
    expect(surveyItems(plan([PLOT, ...SLOPE]))).toHaveLength(4);
    expect(roundLevel(1234, true)).toBe(1250);
    expect(roundLevel(100, false)).toBeCloseTo(76.2);
  });
});
