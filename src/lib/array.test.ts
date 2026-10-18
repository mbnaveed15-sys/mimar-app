import { describe, expect, it } from 'vitest';
import { emptyDoc } from './storage';
import { gridArray, pathArray, polarArray } from './array';
import type { Column, Furniture, PlanDoc, PlanElement, ServiceRun } from '../types';

const col = (x: number, y: number): Column => ({ id: 'c', type: 'column', x, y, w: 30, h: 30 }) as Column;
const docOf = (elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), elements });
const at = (doc: PlanDoc, ids: string[]) =>
  ids.map((id) => {
    const el = doc.elements.find((e) => e.id === id) as { x: number; y: number; rotation?: number };
    return [Math.round(el.x) + 0, Math.round(el.y) + 0, Math.round(el.rotation ?? 0) + 0];
  });

describe('array', () => {
  it('copies in rows and columns, or in a line at any angle', () => {
    const doc = docOf([col(0, 0)]);
    const grid = gridArray(doc, ['c'], 3, 2, { x: 100, y: 50 });
    expect(at(grid.doc, grid.ids).map(([x, y]) => [x, y])).toEqual([
      [100, 0],
      [200, 0],
      [0, 50],
      [100, 50],
      [200, 50],
    ]);
    const line = gridArray(doc, ['c'], 3, 1, { x: 60, y: 80 });
    expect(at(line.doc, line.ids).map(([x, y]) => [x, y])).toEqual([
      [60, 80],
      [120, 160],
    ]);
    expect(gridArray(doc, ['c'], 1, 3, { x: 0, y: 40 }).ids).toHaveLength(2);
    expect(gridArray(doc, ['c'], 3, 1, { x: 0, y: 0 }).ids).toHaveLength(0);
  });

  it('copies round a centre, turning them or not, over a full or part circle', () => {
    const chair: Furniture = { id: 'f', type: 'furniture', kind: 'armchair', x: 100, y: 0, w: 45, h: 45 };
    const doc = docOf([chair]);
    const full = polarArray(doc, ['f'], { x: 0, y: 0 }, 4, 360, true);
    // Counter-clockwise as seen: up the screen (y down) first.
    expect(at(full.doc, full.ids)).toEqual([
      [0, -100, 270],
      [-100, 0, 180],
      [0, 100, 90],
    ]);
    const half = polarArray(doc, ['f'], { x: 0, y: 0 }, 3, 180, false);
    expect(at(half.doc, half.ids)).toEqual([
      [0, -100, 0],
      [-100, 0, 0],
    ]);
  });

  it('spaces copies along a wall or a wire, turning with it, skipping where the original stands', () => {
    const wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 300, y2: 0, thickness: 23 } as PlanElement;
    const doc = docOf([col(0, 0), wall]);
    const along = pathArray(doc, ['c'], wall, 4, true);
    expect(at(along.doc, along.ids).map(([x, y]) => [x, y])).toEqual([
      [100, 0],
      [200, 0],
      [300, 0],
    ]);
    const run: ServiceRun = {
      id: 'r',
      type: 'run',
      system: 'cold',
      points: [
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 200 },
      ],
    };
    const chair: Furniture = { id: 'f', type: 'furniture', kind: 'armchair', x: 500, y: 500, w: 45, h: 45 };
    const piped = pathArray(docOf([chair, run]), ['f'], run, 3, true);
    expect(at(piped.doc, piped.ids)).toEqual([
      [0, 100, 0],
      [100, 100, 0],
      [100, 200, 90],
    ]);
  });
});
