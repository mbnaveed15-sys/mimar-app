import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc } from '../lib/storage';
import { getPicker, resetPickers, setPicker, type Picker3D } from '../three/picker';
import { hover, press, release } from '../tools/controller';
import { createPlannerStore } from './plannerStore';

const setup = () => {
  const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
  store.getState().setViewport({ width: 1000, height: 800 });
  return store;
};
const fake = (is3d: boolean): Picker3D => ({
  is3d,
  highlight: () => {},
  faceAt: () => null,
  onPlane: () => null,
  alongLine: () => null,
});

afterEach(resetPickers);

describe('split view', () => {
  it('the side under the pointer is in use, and what is being drawn carries on across', () => {
    const store = setup();
    store.getState().setSplit(true);
    expect(store.getState().split).toBe(true);
    store.getState().setTool('wall');
    press(store, { x: 0, y: 0 });
    release(store, false);
    store.getState().setActivePane(true);
    expect(store.getState().view3d).toBe(true);
    expect(store.getState().draft?.type).toBe('wall');
    hover(store, { x: 300, y: 0 });
    press(store, { x: 300, y: 0 });
    release(store, false);
    expect(store.getState().doc.elements.filter((e) => e.type === 'wall')).toHaveLength(1);
    // Out of split view, the pointer doesn't switch views.
    store.getState().setView3d(false);
    expect(store.getState().split).toBe(false);
    store.getState().setActivePane(true);
    expect(store.getState().view3d).toBe(false);
  });

  it('each side keeps its own picker, and the one in use answers', () => {
    const store = setup();
    const plan = fake(false);
    const model = fake(true);
    setPicker(plan);
    setPicker(model);
    store.getState().setSplit(true);
    store.getState().setActivePane(true);
    expect(getPicker()).toBe(model);
    store.getState().setActivePane(false);
    expect(getPicker()).toBe(plan);
  });
});
