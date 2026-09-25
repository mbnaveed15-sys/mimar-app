import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from './prefs';
import { emptyDoc, normaliseDoc } from './storage';
import { COLLECTIONS, MATERIAL_LIBRARY, searchLibrary } from './materials';
import { patternSpanMm } from './patterns';
import { createPlannerStore } from '../store/plannerStore';

describe('material library', () => {
  it('has plenty of materials in every collection, each with its own id', () => {
    expect(MATERIAL_LIBRARY.length).toBeGreaterThanOrEqual(60);
    expect(new Set(MATERIAL_LIBRARY.map((m) => m.id)).size).toBe(MATERIAL_LIBRARY.length);
    for (const c of COLLECTIONS) expect(MATERIAL_LIBRARY.some((m) => m.collection === c)).toBe(true);
    expect(MATERIAL_LIBRARY.every((m) => /^#[0-9A-F]{6}$/i.test(m.color))).toBe(true);
  });

  it('finds materials by any words of their name or kind', () => {
    const names = searchLibrary('grey marble').map((m) => m.name);
    expect(names).toContain('Sunny grey marble');
    expect(names.every((n) => /grey/i.test(n))).toBe(true);
    expect(searchLibrary('pavers').length).toBe(2);
    expect(searchLibrary('')).toHaveLength(MATERIAL_LIBRARY.length);
  });

  it('works out how far one drawing of a pattern spans', () => {
    expect(patternSpanMm({ pattern: 'tiles', sizeMm: 609.6 })).toBeCloseTo(1219.2); // 2 × 2 tiles
    expect(patternSpanMm({})).toBe(1000);
  });

  it('adds a library material to the plan when picked, and keeps its pattern on save', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().pickMaterial('lib_botticino-marble');
    expect(s().selectedMat).toBe('lib_botticino-marble');
    const added = s().doc.materials.find((m) => m.id === 'lib_botticino-marble')!;
    expect(added).toMatchObject({ name: 'Botticino marble', pattern: 'marble' });
    expect(normaliseDoc(JSON.parse(JSON.stringify(s().doc))).materials).toContainEqual(added);
    s().pickMaterial('lib_botticino-marble');
    expect(s().doc.materials.filter((m) => m.id === added.id)).toHaveLength(1);
  });

  it('removes a material, and whatever used it goes back to the default look', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().pickMaterial('mat_brick');
    s().addWall({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(s().doc.elements[0].material).toBe('mat_brick');
    s().removeMaterial('mat_brick');
    expect(s().doc.materials.some((m) => m.id === 'mat_brick')).toBe(false);
    expect(s().doc.elements[0].material).toBeUndefined();
    expect(s().selectedMat).toBe(s().doc.materials[0].id);
  });

  it('lets a new colour be named and recoloured', () => {
    const store = createPlannerStore(emptyDoc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().addMaterial();
    const id = s().selectedMat;
    s().updateMaterial(id, { name: 'Client blue', color: '#3355aa' });
    expect(s().doc.materials.find((m) => m.id === id)).toMatchObject({ name: 'Client blue', color: '#3355aa' });
  });
});
