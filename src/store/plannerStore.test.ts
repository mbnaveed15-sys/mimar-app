import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import { HISTORY_LIMIT, createPlannerStore } from './plannerStore';

const setup = () => createPlannerStore(emptyDoc());

describe('planner store', () => {
  it('uses the selected material for new elements', () => {
    const store = setup();
    store.getState().selectMaterial('mat_wood');
    store.getState().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    store.getState().addFurniture({ x: 300, y: 300 });
    expect(store.getState().doc.elements.map((e) => e.material)).toEqual(['mat_wood', 'mat_wood']);
  });

  it('ignores walls that are too short', () => {
    const store = setup();
    store.getState().addWall({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(store.getState().doc.elements).toHaveLength(0);
    expect(store.getState().past).toHaveLength(0);
  });

  it('undoes and redoes changes', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    s().placeOpening('door', { x: 50, y: 3 });
    expect(s().doc.elements.map((e) => e.type)).toEqual(['wall', 'door']);
    s().undo();
    expect(s().doc.elements.map((e) => e.type)).toEqual(['wall']);
    s().undo();
    expect(s().doc.elements).toHaveLength(0);
    s().undo(); // nothing left: no-op
    s().redo();
    s().redo();
    expect(s().doc.elements.map((e) => e.type)).toEqual(['wall', 'door']);
  });

  it('clears redo after a new change', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    s().undo();
    s().addFurniture({ x: 10, y: 10 });
    expect(s().future).toHaveLength(0);
  });

  it('groups a brush stroke into one undo step', () => {
    const store = setup();
    const s = () => store.getState();
    s().addFurniture({ x: 0, y: 0 });
    s().addFurniture({ x: 100, y: 0 });
    s().selectMaterial('mat_marble');
    s().beginBatch();
    s().brushAt({ x: 0, y: 0 });
    s().brushAt({ x: 100, y: 0 });
    s().endBatch();
    expect(s().doc.elements.every((e) => e.material === 'mat_marble')).toBe(true);
    s().undo();
    expect(s().doc.elements.every((e) => e.material === 'mat_concrete')).toBe(true);
  });

  it('warns when a door is not placed on a wall', () => {
    const store = setup();
    store.getState().placeOpening('door', { x: 500, y: 500 });
    expect(store.getState().doc.elements).toHaveLength(0);
    expect(store.getState().warnings[0]).toMatch(/wall/);
  });

  it('removes doors and windows with their wall', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 200, y: 0 });
    s().placeOpening('window', { x: 100, y: 0 });
    s().eraseAt({ x: 10, y: 0 });
    expect(s().doc.elements).toHaveLength(0);
    s().undo();
    expect(s().doc.elements).toHaveLength(2);
  });

  it('builds masks from clicked points and ignores repeated clicks', () => {
    const store = setup();
    const s = () => store.getState();
    s().addMaskPoint({ x: 0, y: 0 });
    s().addMaskPoint({ x: 100, y: 0 });
    s().finishMask();
    expect(s().warnings[0]).toMatch(/3 points/);
    s().addMaskPoint({ x: 100, y: 100 });
    s().addMaskPoint({ x: 100, y: 100 });
    s().finishMask();
    expect(s().doc.masks).toHaveLength(1);
    expect(s().doc.masks[0].points).toHaveLength(3);
    expect(s().draft).toBeNull();
  });

  it('drops a selection that no longer exists after undo', () => {
    const store = setup();
    const s = () => store.getState();
    s().addFurniture({ x: 0, y: 0 });
    s().select(s().doc.elements[0].id);
    s().undo();
    expect(s().selectedId).toBeNull();
  });

  it('caps the undo history', () => {
    const store = setup();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) store.getState().addFurniture({ x: i, y: 0 });
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('editing and files', () => {
  it('keeps doors in place on a wall when the wall moves or changes length', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 200, y: 0 });
    s().placeOpening('door', { x: 50, y: 0 });
    const wall = s().doc.elements[0];
    if (wall.type !== 'wall') throw new Error('expected wall');
    s().updateElement({ ...wall, y1: 100, y2: 100, x2: 400 });
    const door = s().doc.elements[1];
    expect(door).toMatchObject({ x: 100, y: 100, angle: 0 });
  });

  it('nudges and rotates the selection, one undo step each', () => {
    const store = setup();
    const s = () => store.getState();
    s().addFurniture({ x: 0, y: 0 });
    s().select(s().doc.elements[0].id);
    s().nudgeSelected(10, 0);
    s().rotateSelected(90);
    s().rotateSelected(-180);
    expect(s().doc.elements[0]).toMatchObject({ x: 10, rotation: 270 });
    s().undo();
    s().undo();
    const el = s().doc.elements[0];
    expect(el).toMatchObject({ x: 10 });
    expect(el.type === 'furniture' && (el.rotation ?? 0)).toBe(0);
  });

  it('flips doors', () => {
    const store = setup();
    const s = () => store.getState();
    s().addWall({ x: 0, y: 0 }, { x: 200, y: 0 });
    s().placeOpening('door', { x: 100, y: 0 });
    const id = s().doc.elements[1].id;
    s().flipOpening(id, 'side');
    s().flipOpening(id, 'hinge');
    expect(s().doc.elements[1]).toMatchObject({ flipSide: true, flipHinge: true });
  });

  it('tracks unsaved changes, and resets history when a file is opened', () => {
    const store = setup();
    const s = () => store.getState();
    expect(s().doc).toBe(s().savedDoc);
    s().addFurniture({ x: 0, y: 0 });
    expect(s().doc).not.toBe(s().savedDoc);
    s().markSaved({ name: 'House.mimar', path: 'C:/House.mimar' });
    expect(s().doc).toBe(s().savedDoc);
    expect(s().fileName).toBe('House.mimar');

    s().loadDocument(emptyDoc(), { name: 'Other.mimar' });
    expect(s().past).toHaveLength(0);
    expect(s().filePath).toBeUndefined();
    s().newPlan();
    expect(s().fileName).toBe('Untitled.mimar');
  });

  it('switches the snapping grid with the units', () => {
    const store = setup();
    store.getState().setUnits('metric');
    expect(store.getState().gridPx).toBe(25);
    store.getState().setUnits('imperial');
    expect(store.getState().gridPx).toBeCloseTo(30.48);
  });
});
