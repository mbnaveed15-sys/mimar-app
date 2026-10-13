import { describe, expect, it } from 'vitest';
import type { PlanDoc, Wall } from '../types';
import { emptyDoc } from './storage';
import { MM_PER_UNIT } from './scale';
import { plinthAt, plinthOutlines, plinthProjectMm, plinthWalls } from './plinth';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
  thickness: 20,
  ...extra,
});

const doc = (walls: Wall[], projectMm?: number): PlanDoc => ({
  ...emptyDoc(),
  plinthMm: 600,
  elements: walls,
  ...(projectMm ? { plinth: { projectMm } } : {}),
});

describe('the plinth under each wall', () => {
  it('stands out by the plinth setting, or the wall’s own', () => {
    const d = doc([wall('a', 0, 0, 100, 0), wall('b', 0, 0, 0, 100, { plinthProjectMm: 0 })], 100);
    expect(plinthProjectMm(d, d.elements[0] as Wall)).toBe(100);
    expect(plinthProjectMm(d, d.elements[1] as Wall)).toBe(0);
    const wider = plinthWalls(d, d.elements as Wall[])!;
    expect(wider.get('a')!.thickness).toBeCloseTo(20 + 200 / MM_PER_UNIT);
    expect(wider.get('b')!.thickness).toBe(20);
  });

  it('is outlined on the plan only where it stands out', () => {
    const d = doc([wall('a', 0, 0, 100, 0), wall('b', 0, 0, 0, 100, { plinthProjectMm: 0 })], 100);
    expect(plinthOutlines(d).map((o) => o.wallId)).toEqual(['a']);
    // Flush everywhere: nothing more to show.
    expect(plinthOutlines(doc([wall('a', 0, 0, 100, 0)]))).toEqual([]);
    // Left off under the wall, or drawn by hand: none either.
    expect(plinthOutlines(doc([wall('a', 0, 0, 100, 0, { noPlinth: true })], 100))).toEqual([]);
    expect(plinthOutlines({ ...d, ownPlinth: true })).toEqual([]);
  });

  it('is found under the pointer just outside the wall', () => {
    const d = doc([wall('a', 0, 0, 100, 0, { plinthProjectMm: 150 })]);
    const out = 10 + 100 / MM_PER_UNIT;
    expect(plinthAt(d, { x: 50, y: out })).toBe('a');
    expect(plinthAt(d, { x: 50, y: 40 })).toBeNull();
  });
});
