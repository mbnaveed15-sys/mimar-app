import { describe, expect, it } from 'vitest';
import { HATCHES, HATCH_FAMILIES, hatchOf, hatchOfMaterial, hatchSegments, parseHatch, surfaceHatchOf } from './hatch';
import type { Material, Wall } from '../types';

const mat = (name: string, extra: Partial<Material> = {}): Material => ({
  id: name,
  name,
  color: '#fff',
  texture: '',
  ...extra,
});

describe('which hatch', () => {
  it('reads the material: its own choice, then its name, then its pattern', () => {
    expect(hatchOfMaterial(mat('Anything', { hatch: 'water' }))).toBe('water');
    expect(hatchOfMaterial(mat('Brick', { hatch: 'none' }))).toBeNull();
    expect(hatchOfMaterial(mat('RCC slab'))).toBe('rcc');
    expect(hatchOfMaterial(mat('Lawn'))).toBe('grass');
    expect(hatchOfMaterial(mat('Car porch tuff tiles'))).toBe('pavers');
    expect(hatchOfMaterial(mat('Mine', { pattern: 'gravel' }))).toBe('gravel');
    expect(hatchOfMaterial(mat('Mine', { pattern: 'plain' }))).toBeUndefined();
  });

  it('turns brick and wood into paving and a wood floor on surfaces', () => {
    expect(hatchOfMaterial(mat('Brick'), true)).toBe('pavers');
    expect(hatchOfMaterial(mat('Mine', { pattern: 'wood' }), true)).toBe('planks');
    expect(hatchOfMaterial(mat('Mine', { pattern: 'plain' }), true)).toBeNull();
    expect(surfaceHatchOf('Lawn', [mat('Lawn')])).toBe('grass');
    expect(surfaceHatchOf(undefined, [])).toBeNull();
  });

  it('falls back on what an item is', () => {
    const wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 10, y2: 0 } as Wall;
    expect(hatchOf(wall, [])).toBe('brick');
    expect(hatchOf({ ...wall, kind: 'retaining' }, [])).toBe('rcc');
    expect(hatchOf({ ...wall, kind: 'curtain' }, [])).toBe('glass');
    expect(hatchOf({ ...wall, material: 'Stone' }, [mat('Stone')])).toBe('stone');
    expect(hatchOf(undefined, [])).toBe('rcc');
  });

  it('every hatch has a name and lines (glass is an outline only)', () => {
    for (const { id } of HATCHES) {
      expect(parseHatch(id)).toBe(id);
      if (id !== 'glass') expect(HATCH_FAMILIES[id].length).toBeGreaterThan(0);
    }
    expect(parseHatch('none')).toBe('none');
    expect(parseHatch('lava')).toBeUndefined();
  });
});

describe('hatch lines', () => {
  const square: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it('fills an outline with parallel lines, all inside it', () => {
    const segs = hatchSegments('brick', [square], 1);
    // 45° lines 1.5 apart across a 10 × 10 square's diagonal (about 14.1): about 9 lines.
    expect(segs.length).toBeGreaterThanOrEqual(8);
    expect(segs.length).toBeLessThanOrEqual(11);
    for (const [a, b] of segs)
      for (const p of [a, b]) {
        expect(p[0]).toBeGreaterThanOrEqual(-1e-6);
        expect(p[0]).toBeLessThanOrEqual(10 + 1e-6);
        expect(p[1]).toBeGreaterThanOrEqual(-1e-6);
        expect(p[1]).toBeLessThanOrEqual(10 + 1e-6);
      }
  });

  it('leaves holes empty and draws dashes', () => {
    const hole: [number, number][] = [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
    ];
    const segs = hatchSegments('tiles', [square, hole], 1);
    const mid = (s: [[number, number], [number, number]]) => [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
    for (const s of segs) {
      const [x, y] = mid(s);
      expect(x > 3.01 && x < 6.99 && y > 3.01 && y < 6.99).toBe(false);
    }
    // Sand is dots: many tiny pieces.
    const sand = hatchSegments('sand', [square], 1);
    expect(sand.length).toBeGreaterThan(50);
    expect(Math.max(...sand.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1])))).toBeLessThan(0.2);
  });

  it('draws nothing for glass or an empty outline', () => {
    expect(hatchSegments('glass', [square], 1)).toEqual([]);
    expect(hatchSegments('brick', [], 1)).toEqual([]);
  });
});
