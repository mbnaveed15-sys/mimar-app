import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, STORAGE_KEY, emptyDoc, loadPlan, normaliseDoc, savePlan } from './storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('storage', () => {
  it('starts with default materials when nothing is saved', () => {
    const { doc, warning } = loadPlan(memoryStorage());
    expect(doc.elements).toEqual([]);
    expect(doc.materials.map((m) => m.id)).toContain('mat_brick');
    expect(warning).toBeUndefined();
  });

  it('round-trips a saved plan', () => {
    const storage = memoryStorage();
    const doc = loadPlan(storage).doc;
    doc.elements.push({ id: 'a', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, material: 'mat_brick' });
    savePlan(doc, storage);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).version).toBe(CURRENT_VERSION);
    expect(loadPlan(storage).doc).toEqual(doc);
  });

  it('migrates a plan saved by Mimar 1.x and keeps the old keys', () => {
    const legacyElements = JSON.stringify([
      { id: 1700000000001, type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, material: 'mat_brick' },
      { id: 1700000000002, type: 'door', wallId: 1700000000001, x: 50, y: 0, angle: 0, width: 90 },
      { id: 1700000000003, type: 'furniture', x: 10, y: 10, w: 120, h: 80 },
      { id: 'junk', type: 'spaceship' },
    ]);
    const legacyMasks = JSON.stringify([
      {
        id: 5,
        name: 'M',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
        material: 'mat_wood',
      },
    ]);
    const storage = memoryStorage({ 'planner.elements': legacyElements, 'planner.masks': legacyMasks });
    const { doc } = loadPlan(storage);
    expect(doc.elements.map((e) => e.id)).toEqual(['1700000000001', '1700000000002', '1700000000003']);
    expect(doc.elements[1]).toMatchObject({ type: 'door', wallId: '1700000000001' });
    expect(doc.masks[0]).toMatchObject({ id: '5', material: 'mat_wood' });
    expect(doc.materials.length).toBeGreaterThan(0);
    expect(storage.data.get(STORAGE_KEY)).toBeDefined();
    expect(storage.data.get('planner.elements')).toBe(legacyElements);
  });

  it('survives corrupted data, backs it up and warns', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{not json' });
    const { doc, warning } = loadPlan(storage);
    expect(doc.elements).toEqual([]);
    expect(warning).toMatch(/could not be read/);
    expect(storage.data.get('mimar.plan.corrupt')).toBe('{not json');
  });

  it('works without storage and when storage throws', () => {
    expect(loadPlan(null).doc.elements).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPlan(broken).warning).toBeDefined();
    expect(() => savePlan(loadPlan(null).doc, broken)).not.toThrow();
  });

  it('keeps sensible heights above the floor and window sills, and drops the rest', () => {
    const doc = normaliseDoc({
      ...emptyDoc(),
      elements: [
        { id: 'a', type: 'column', x: 0, y: 0, w: 23, h: 23, shape: 'rect', elevMm: 600 },
        { id: 'b', type: 'column', x: 0, y: 0, w: 23, h: 23, shape: 'rect', elevMm: 'high' },
        { id: 'c', type: 'column', x: 0, y: 0, w: 23, h: 23, shape: 'rect', elevMm: 1e9 },
        { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 23 },
        { id: 'n', type: 'window', wallId: 'w', x: 50, y: 0, angle: 0, width: 60, sillMm: 600 },
      ],
    });
    expect(doc.elements.map((el) => el.elevMm)).toEqual([600, undefined, undefined, undefined, undefined]);
    expect(doc.elements.find((el) => el.id === 'n')).toMatchObject({ sillMm: 600 });
  });
});
