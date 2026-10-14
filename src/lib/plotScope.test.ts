import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from './prefs';
import { emptyDoc } from './storage';
import { createPlannerStore } from '../store/plannerStore';
import { workingPlotId } from '../store/usePlanCheck';
import { fullCheck } from './fullCheck';
import { onPlot, plotOfItems, plotsOf } from './plotScope';

const ft = (x: number, y: number) => ({ x: x * 30.48, y: y * 30.48 });

describe('several plots', () => {
  it('checks the plot being worked on, with only what stands on it', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().addPlot([ft(0, 0), ft(25, 0), ft(25, 45), ft(0, 45)]);
    s().addPlot([ft(40, 0), ft(80, 0), ft(80, 90), ft(40, 90)]);
    const [a, b] = plotsOf(s().doc);
    // A wall on the second plot, and none on the first.
    s().addWall(ft(50, 20), ft(70, 20));
    const wall = s()
      .doc.elements.filter((el) => el.type === 'wall')
      .at(-1)!;
    expect(plotOfItems(s().doc, [wall.id])).toBe(b.id);

    const onA = onPlot(s().doc, a.id);
    expect(plotsOf(onA).map((p) => p.id)).toEqual([a.id]);
    expect(onA.elements.some((el) => el.id === wall.id)).toBe(false);
    const onB = onPlot(s().doc, b.id);
    expect(onB.elements.some((el) => el.id === wall.id)).toBe(true);

    // Picking the wall makes its plot the one checked, and stays so with nothing picked.
    s().setSelection([wall.id]);
    expect(workingPlotId(s())).toBe(b.id);
    s().setSelection([]);
    expect(workingPlotId(s())).toBe(b.id);
    const ctx = { wallHeightMm: 3000, units: 'imperial' as const };
    expect(fullCheck(s().doc, { ...ctx, plotId: b.id })?.note).toMatch(/^Plot 2 of 2/);
    expect(fullCheck(s().doc, { ...ctx, plotId: a.id })?.note).toMatch(/^Plot 1 of 2/);
  });
});
