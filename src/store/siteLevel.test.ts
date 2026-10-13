import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { buildModel, levelBaseM, SLAB_MM } from '../three/model';
import { builtAreaSqFt, storeyLevelIds } from '../lib/planCheck';
import { quantities } from '../lib/quantities';
import { levelAbove, levelBelow } from '../lib/voids';
import { levelWallMm, withSiteLevel } from '../lib/levels';
import { GROUND_LEVEL, SITE_LEVEL, type Stair, type Wall } from '../types';
import { createPlannerStore } from './plannerStore';

const WALL = 3048;

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  return { store, s: () => store.getState() };
};

/** A closed square of walls, 500 units a side. */
const square = (s: () => ReturnType<ReturnType<typeof setup>['store']['getState']>) => {
  const c = [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 500 },
    { x: 0, y: 500 },
  ];
  c.forEach((p, i) => s().addWall(p, c[(i + 1) % 4]));
};

const wallSolids = (doc: ReturnType<typeof emptyDoc>, levelId: string) =>
  buildModel(doc, { wallHeightMm: WALL, showFurniture: true }).solids.filter(
    (p) => p.role === 'wall' && p.level === levelId,
  );

describe('the Ground (site) level', () => {
  it('is added under the ground floor (after a basement) when first picked, and is not a storey', () => {
    const { s } = setup();
    s().addBasement();
    const basement = s().doc.levels[0].id;
    s().showSiteLevel();
    expect(s().activeLevel).toBe(SITE_LEVEL);
    expect(s().doc.levels.map((l) => l.id)).toEqual([basement, SITE_LEVEL, GROUND_LEVEL]);
    s().showSiteLevel();
    expect(s().doc.levels.filter((l) => l.site)).toHaveLength(1);
    // Floors above are still named by how far up they are.
    s().addLevel();
    expect(s().doc.levels.map((l) => l.name)).toEqual(['Basement', 'Ground (site)', 'Ground floor', 'First floor']);

    const plinth = s().doc.plinthMm / 1000;
    expect(levelBaseM(s().doc, SITE_LEVEL, WALL)).toBeCloseTo(0);
    expect(levelBaseM(s().doc, GROUND_LEVEL, WALL)).toBeCloseTo(plinth);
    expect(levelBaseM(s().doc, s().doc.levels[3].id, WALL)).toBeCloseTo(plinth + (WALL + SLAB_MM) / 1000);
    expect(levelBaseM(s().doc, basement, WALL)).toBeCloseTo(plinth - (SLAB_MM + 3048) / 1000);
    // Its floor is the lawn.
    s().setGround({ levelMm: 150 });
    expect(levelBaseM(s().doc, SITE_LEVEL, WALL)).toBeCloseTo(0.15);
    expect(levelWallMm(s().doc, SITE_LEVEL, WALL)).toBeCloseTo(s().doc.plinthMm - 150);
    // The double-height rooms of the basement still open into the ground floor.
    expect(levelAbove(s().doc, basement)).toBe(GROUND_LEVEL);
    expect(levelBelow(s().doc, GROUND_LEVEL)).toBe(basement);
    expect(levelAbove(s().doc, SITE_LEVEL)).toBeNull();
  });

  it('goes after a basement added later', () => {
    expect(withSiteLevel([{ id: GROUND_LEVEL, name: 'Ground floor' }]).map((l) => l.id)).toEqual([
      SITE_LEVEL,
      GROUND_LEVEL,
    ]);
    const { s } = setup();
    s().showSiteLevel();
    s().addBasement();
    expect(s().doc.levels.map((l) => l.id)).toEqual([s().doc.levels[0].id, SITE_LEVEL, GROUND_LEVEL]);
    expect(s().doc.levels[0].basement).toBe(true);
  });

  it('builds walls drawn on it from the lawn up to the ground floor', () => {
    const { s } = setup();
    s().setGround({ levelMm: 150 });
    s().showSiteLevel();
    s().addWall({ x: 0, y: 0 }, { x: 500, y: 0 });
    const wall = s().doc.elements.find((el): el is Wall => el.type === 'wall')!;
    expect(wall.levelId).toBe(SITE_LEVEL);
    expect(wall.heightMm).toBeUndefined();
    const [solid] = wallSolids(s().doc, SITE_LEVEL);
    expect(solid.y0).toBeCloseTo(0.15);
    expect(solid.y0 + solid.h).toBeCloseTo(s().doc.plinthMm / 1000);
  });

  it('climbs stairs on it from the lawn to the ground floor', () => {
    const { s } = setup();
    s().showSiteLevel();
    s().addStair({ x: 200, y: 200 });
    const stair = s().doc.elements.find((el): el is Stair => el.type === 'stair')!;
    expect(stair.levelId).toBe(SITE_LEVEL);
    expect(stair.riseMm).toBeCloseTo(s().doc.plinthMm);
  });

  it('with Draw my own, ground-floor walls start at the floor and the plinth is what is drawn', () => {
    const { s } = setup();
    square(s);
    const plinth = s().doc.plinthMm / 1000;
    const lowest = () => Math.min(...wallSolids(s().doc, GROUND_LEVEL).map((p) => p.y0));
    expect(lowest()).toBeCloseTo(0);
    const auto = quantities(s().doc, WALL).total;

    s().setOwnPlinth(true);
    expect(s().doc.ownPlinth).toBe(true);
    expect(lowest()).toBeCloseTo(plinth);
    const own = quantities(s().doc, WALL).total;
    expect(own.brickworkCft).toBeLessThan(auto.brickworkCft);
    // No walls under it yet: no foundations.
    expect(own.foundationRft).toBe(0);

    // Plinth walls drawn on Ground (site) bring back the brickwork and foundations.
    s().showSiteLevel();
    square(s);
    const drawn = quantities(s().doc, WALL).total;
    expect(drawn.brickworkCft).toBeCloseTo(auto.brickworkCft, 0);
    expect(drawn.foundationRft).toBeCloseTo(auto.foundationRft);
    // It adds no floor area, storey or slab.
    expect(builtAreaSqFt(s().doc, SITE_LEVEL)).toBe(0);
    expect(storeyLevelIds(s().doc)).toEqual([GROUND_LEVEL]);
    expect(quantities(s().doc, WALL).floors.find((f) => f.levelId === SITE_LEVEL)?.slabEstimateCft).toBe(0);

    s().setOwnPlinth(false);
    expect(s().doc.ownPlinth).toBeUndefined();
  });

  it("isn't copied upwards, nor deleted while it has items", () => {
    const { s } = setup();
    s().showSiteLevel();
    s().addWall({ x: 0, y: 0 }, { x: 500, y: 0 });
    s().duplicateLevel();
    expect(s().doc.levels).toHaveLength(2);
    s().deleteLevel(SITE_LEVEL);
    expect(s().doc.levels.some((l) => l.site)).toBe(true);
    expect(s().doc.elements).toHaveLength(1);
  });

  it('is kept with the own plinth when saved and opened, in its place', () => {
    const doc = normaliseDoc({
      ...emptyDoc(),
      ownPlinth: true,
      levels: [
        { id: GROUND_LEVEL, name: 'Ground floor' },
        { id: 'f1', name: 'First floor' },
        { id: SITE_LEVEL, name: 'Lawn' },
        { id: 'b', name: 'Basement', basement: true },
      ],
    });
    expect(doc.ownPlinth).toBe(true);
    expect(doc.levels).toEqual([
      { id: 'b', name: 'Basement', basement: true },
      { id: SITE_LEVEL, name: 'Lawn', site: true },
      { id: GROUND_LEVEL, name: 'Ground floor' },
      { id: 'f1', name: 'First floor' },
    ]);
    expect(normaliseDoc(emptyDoc()).ownPlinth).toBeUndefined();
  });
});
