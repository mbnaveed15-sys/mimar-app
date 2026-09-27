import { describe, expect, it } from 'vitest';
import { newId } from '../lib/ids';
import { buildLayout, layoutSite } from '../lib/layoutBuild';
import { DEFAULT_PROGRAM, feetToUnits as ft, generateLayouts } from '../lib/layoutGen';
import { DEFAULT_PREFS } from '../lib/prefs';
import { plotRect } from '../lib/site';
import { emptyDoc } from '../lib/storage';
import type { Plot, Wall } from '../types';
import { createPlannerStore } from './plannerStore';

describe('placing a plan from the room list', () => {
  it('replaces the floor’s walls and rooms (not the boundary walls) in one undo step', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(35), y: ft(65) }));
    s().addWall({ x: ft(10), y: ft(10) }, { x: ft(20), y: ft(10) });
    s().addStair({ x: ft(15), y: ft(20) });
    expect(s().layoutClash()).toEqual({ walls: 1, rooms: 0, other: 1 });
    const plot = s().doc.elements.find((el): el is Plot => el.type === 'plot')!;
    const site = layoutSite(plot)!;
    const [plan] = generateLayouts(DEFAULT_PROGRAM, site.W, site.D, { seed: 3 });
    const built = buildLayout(plan, site.frame, { newId, riseMm: 3200 });
    const before = s().doc;
    s().placeLayout(built);
    const walls = s().doc.elements.filter((el): el is Wall => el.type === 'wall');
    expect(walls.filter((w) => w.kind === 'boundary')).toHaveLength(4);
    expect(walls.filter((w) => !w.kind)).toHaveLength(built.walls.length);
    expect(s().doc.rooms).toHaveLength(built.rooms.length);
    expect(s().doc.elements.filter((el) => el.type === 'stair')).toHaveLength(1);
    s().undo();
    expect(s().doc).toBe(before);
  });

  it('goes on the floor being viewed', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().addPlot(plotRect({ x: 0, y: 0 }, { x: ft(35), y: ft(65) }));
    s().addLevel();
    const plot = s().doc.elements.find((el): el is Plot => el.type === 'plot')!;
    const site = layoutSite(plot)!;
    const [plan] = generateLayouts(DEFAULT_PROGRAM, site.W, site.D, { seed: 3 });
    s().placeLayout(buildLayout(plan, site.frame, { newId, riseMm: 3200 }));
    const level = s().activeLevel;
    expect(s().doc.rooms.every((r) => r.levelId === level)).toBe(true);
    expect(
      s()
        .doc.elements.filter((el) => el.type === 'wall' && !el.kind)
        .every((el) => el.levelId === level),
    ).toBe(true);
  });
});
