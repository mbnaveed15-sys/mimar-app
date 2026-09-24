import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { createPlannerStore } from '../store/plannerStore';
import type { Furniture, Wall } from '../types';
import { applyMeasure, hover, press, release } from './controller';

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, {
    ...DEFAULT_PREFS,
    grid: { ...DEFAULT_PREFS.grid, snap: false },
  });
  store.getState().setViewport({ width: 1000, height: 800 });
  return store;
};
type S = ReturnType<typeof setup>;
const walls = (store: S) => store.getState().doc.elements.filter((e): e is Wall => e.type === 'wall');
const click = (store: S, x: number, y: number) => {
  hover(store, { x, y });
  press(store, { x, y });
  release(store, false);
};

describe('Modify tools', () => {
  it('offsets a wall by a typed distance', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 300, y: 0 });
    store.getState().setTool('offset');
    click(store, 150, 0);
    hover(store, { x: 150, y: 50 });
    expect(applyMeasure(store, '1000mm')).toBe(true);
    expect(walls(store)[1]).toMatchObject({ y1: 100, y2: 100 });
  });

  it('trims, fillets and joins by clicking walls', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 300, y: 0 });
    s().addWall({ x: 200, y: -100 }, { x: 200, y: 100 });
    s().setTool('trim');
    click(store, 250, 0); // cut the piece of the long wall beyond the crossing wall
    expect(walls(store)[0]).toMatchObject({ x1: 0, x2: 200 });

    s().setTool('fillet');
    click(store, 100, 0);
    click(store, 200, 60);
    expect(walls(store)[1]).toMatchObject({ x1: 200, y1: 0, y2: 100 });

    s().addWall({ x: 250, y: 300 }, { x: 400, y: 300 });
    s().addWall({ x: 450, y: 300 }, { x: 600, y: 300 });
    s().setTool('join');
    click(store, 300, 300);
    click(store, 500, 300);
    expect(walls(store).filter((w) => w.y1 === 300)).toEqual([expect.objectContaining({ x1: 250, x2: 600 })]);
  });

  it('breaks a wall with a typed gap and chamfers a corner', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 300, y: 0 });
    s().setTool('breakWall');
    click(store, 100, 0);
    hover(store, { x: 250, y: 0 });
    applyMeasure(store, '500mm');
    expect(walls(store).map((w) => [w.x1, w.x2])).toEqual([
      [0, 100],
      [150, 300],
    ]);

    s().addWall({ x: 300, y: 0 }, { x: 300, y: 300 });
    s().setTool('chamfer');
    applyMeasure(store, '500mm,500mm');
    click(store, 250, 0);
    click(store, 300, 200);
    expect(walls(store)).toHaveLength(4);
  });

  it('mirrors a copy of the selection and scales by a typed factor', () => {
    const store = setup();
    const s = () => store.getState();
    s().setTool('furniture');
    s().addFurniture({ x: 100, y: 100 });
    const bed = s().doc.elements[0] as Furniture;
    s().select(bed.id);
    s().setTool('mirror');
    click(store, 200, 0);
    click(store, 200, 50);
    expect(s().doc.elements.map((e) => (e as Furniture).x)).toEqual([100, 300]);
    expect(s().past.length).toBe(2); // placing, then one step for the mirror

    s().setTool('scale');
    click(store, 300, 100);
    expect(applyMeasure(store, '2')).toBe(true);
    const copy = s().doc.elements[1] as Furniture;
    expect(copy.w).toBeCloseTo(bed.w * 2);
  });

  it('stretches wall ends caught in a dragged box', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 200, y: 0 });
    s().addWall({ x: 200, y: 0 }, { x: 200, y: 200 });
    s().setTool('stretch');
    press(store, { x: 180, y: -20 });
    hover(store, { x: 220, y: 220 });
    release(store, true);
    click(store, 200, 100);
    hover(store, { x: 260, y: 100 });
    press(store, { x: 260, y: 100 });
    expect(walls(store)[0]).toMatchObject({ x1: 0, x2: 260 });
    expect(walls(store)[1]).toMatchObject({ x1: 260, x2: 260 });
  });
});
