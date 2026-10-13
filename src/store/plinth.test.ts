import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { quantities } from '../lib/quantities';
import { buildModel } from '../three/model';
import { plinthId, plinthWallOf } from '../walls';
import { createPlannerStore } from './plannerStore';

const WALL = 3048;

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  const s = () => store.getState();
  // A closed square of walls, 500 units a side.
  const c = [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 500 },
    { x: 0, y: 500 },
  ];
  c.forEach((p, i) => s().addWall(p, c[(i + 1) % 4]));
  const walls = s().doc.elements.filter((el) => el.type === 'wall');
  return { s, walls };
};

const plinthSolids = (doc: ReturnType<typeof emptyDoc>, wallId?: string) =>
  buildModel(doc, { wallHeightMm: WALL, showFurniture: true }).solids.filter((p) =>
    wallId ? p.id === plinthId(wallId) : !!plinthWallOf(p.id),
  );

describe('the automatic plinth as its own item', () => {
  it('is built under each ground-floor wall with its own id', () => {
    const { s, walls } = setup();
    expect(plinthWallOf(plinthId('w1'))).toBe('w1');
    expect(plinthWallOf('w1')).toBeNull();
    for (const w of walls) expect(plinthSolids(s().doc, w.id).length).toBeGreaterThan(0);
  });

  it('is selected on its own, and Escape-style select(null) drops it', () => {
    const { s, walls } = setup();
    s().select(walls[1].id);
    s().selectPlinth(walls[0].id);
    expect(s().selectedPlinth).toBe(walls[0].id);
    expect(s().selectedIds).toEqual([]);
    s().select(null);
    expect(s().selectedPlinth).toBeNull();
    // Selecting something else drops it too.
    s().selectPlinth(walls[0].id);
    s().select(walls[1].id);
    expect(s().selectedPlinth).toBeNull();
  });

  it('stands out past the wall faces and takes its own material, counted in the brickwork', () => {
    const { s, walls } = setup();
    const before = quantities(s().doc, WALL).total.brickworkCft;
    const width = (doc: ReturnType<typeof emptyDoc>) => {
      const [p] = plinthSolids(doc, walls[0].id);
      return Math.min(p.w, p.d);
    };
    const flush = width(s().doc);
    s().setPlinth({ projectMm: 75 });
    expect(s().doc.plinth).toEqual({ projectMm: 75 });
    expect(width(s().doc)).toBeCloseTo(flush + 0.15, 2);
    expect(quantities(s().doc, WALL).total.brickworkCft).toBeGreaterThan(before);

    const stone = s().doc.materials[1].id;
    s().setPlinth({ material: stone });
    expect(s().doc.plinth).toEqual({ projectMm: 75, material: stone });
    // Back to flush and the wall's own material: nothing is kept.
    s().setPlinth({ projectMm: 0, material: undefined });
    expect(s().doc.plinth).toBeUndefined();
  });

  it('Delete leaves it off under that wall only, and the wall can bring it back', () => {
    const { s, walls } = setup();
    const before = quantities(s().doc, WALL).total.brickworkCft;
    s().selectPlinth(walls[0].id);
    s().deleteSelected();
    expect(s().selectedPlinth).toBeNull();
    expect(s().doc.elements.find((el) => el.id === walls[0].id)).toMatchObject({ noPlinth: true });
    expect(plinthSolids(s().doc, walls[0].id)).toEqual([]);
    expect(plinthSolids(s().doc, walls[1].id).length).toBeGreaterThan(0);
    expect(quantities(s().doc, WALL).total.brickworkCft).toBeLessThan(before);
    // It can't be selected while it is off.
    s().selectPlinth(walls[0].id);
    expect(s().selectedPlinth).toBeNull();
    s().setWallPlinth(walls[0].id, true);
    expect(s().doc.elements.find((el) => el.id === walls[0].id)).not.toHaveProperty('noPlinth');
    s().undo();
    expect(s().doc.elements.find((el) => el.id === walls[0].id)).toMatchObject({ noPlinth: true });
  });

  it('keeps its settings through a save and load', () => {
    const { s, walls } = setup();
    s().setPlinth({ projectMm: 50, material: s().doc.materials[0].id });
    s().setWallPlinth(walls[2].id, false);
    const back = normaliseDoc(JSON.parse(JSON.stringify(s().doc)));
    expect(back.plinth).toEqual(s().doc.plinth);
    expect(back.elements.find((el) => el.id === walls[2].id)).toMatchObject({ noPlinth: true });
  });
});
