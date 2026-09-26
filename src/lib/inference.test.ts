import { describe, expect, it } from 'vitest';
import type { Wall } from '../types';
import { infer } from './inference';

const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0 };
const opts = { walls: [wall], tolerance: 5, grid: 10 };

describe('snapping (inference)', () => {
  it('prefers wall ends, then midpoints, then points on a wall', () => {
    expect(infer({ x: 98, y: 3 }, opts)).toEqual({ point: { x: 100, y: 0 }, kind: 'endpoint' });
    expect(infer({ x: 52, y: 2 }, opts)).toEqual({ point: { x: 50, y: 0 }, kind: 'midpoint' });
    // Along a wall the point steps in grid increments; without a grid it follows the pointer.
    expect(infer({ x: 73, y: 3 }, opts)).toEqual({ point: { x: 70, y: 0 }, kind: 'on-wall' });
    expect(infer({ x: 73, y: 3 }, { ...opts, grid: null })).toEqual({ point: { x: 73, y: 0 }, kind: 'on-wall' });
  });

  it('along a wall, lands on the wall at the grid step (the grid point itself when the wall is on it)', () => {
    const offGrid: Wall = { id: 'o', type: 'wall', x1: 0, y1: 2, x2: 100, y2: 2, thickness: 4 };
    expect(infer({ x: 61, y: 1 }, { ...opts, walls: [offGrid] })).toEqual({ point: { x: 60, y: 2 }, kind: 'on-wall' });
    const onGrid: Wall = { ...offGrid, y1: 0, y2: 0 };
    expect(infer({ x: 61, y: 1 }, { ...opts, walls: [onGrid] }).point).toEqual({ x: 60, y: 0 });
  });

  it('keeps a line level from an off-grid point, rather than jumping to a grid point', () => {
    const from = { x: 33, y: 83 };
    expect(infer({ x: 71, y: 81 }, { ...opts, walls: [], from })).toEqual({ point: { x: 73, y: 83 }, kind: 'axis-x' });
  });

  it('snaps to wall faces and their corners, perpendicular to a wall, and the nearest point wins', () => {
    const thick: Wall = { id: 't', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 20 };
    const o = { walls: [thick], tolerance: 5, grid: null };
    expect(infer({ x: 40, y: 12 }, o)).toEqual({ point: { x: 40, y: 10 }, kind: 'on-face' });
    expect(infer({ x: 99, y: -8 }, o)).toEqual({ point: { x: 100, y: -10 }, kind: 'corner' });
    // From a point below the wall, the foot of the perpendicular.
    expect(infer({ x: 31, y: 2 }, { ...o, from: { x: 30, y: 50 } })).toEqual({
      point: { x: 30, y: 0 },
      kind: 'perpendicular',
    });
    // A midpoint 4 away loses to a crossing 1 away.
    const line = { id: 'l', x1: 46, y1: -40, x2: 46, y2: 60 };
    expect(infer({ x: 46, y: 1 }, { ...o, walls: [{ ...thick, thickness: 1 }], lines: [line] }).kind).toBe(
      'intersection',
    );
  });

  it('snaps to the building line ahead of a grid point, at the grid step along it', () => {
    // The building line (set in by half a wall) runs 4 units below the grid line y = 60.
    const guide = { id: 'g', x1: 0, y1: 56, x2: 100, y2: 56 };
    const withGuide = { ...opts, walls: [], guides: [guide] };
    expect(infer({ x: 41, y: 59 }, withGuide)).toEqual({ point: { x: 40, y: 56 }, kind: 'building-line' });
    expect(infer({ x: 1, y: 57 }, withGuide)).toEqual({ point: { x: 0, y: 56 }, kind: 'building-line' });
    // Away from it, the grid as before.
    expect(infer({ x: 41, y: 31 }, withGuide)).toEqual({ point: { x: 40, y: 30 }, kind: 'grid' });
  });

  it('snaps to layout lines and to where lines and walls cross', () => {
    const line = { id: 'l', x1: 25, y1: -40, x2: 25, y2: 60 };
    const withLine = { ...opts, grid: null, lines: [line] };
    expect(infer({ x: 26, y: 1 }, withLine)).toEqual({ point: { x: 25, y: 0 }, kind: 'intersection' });
    expect(infer({ x: 27, y: 33 }, withLine)).toEqual({ point: { x: 25, y: 33 }, kind: 'on-line' });
    expect(infer({ x: 24, y: -38 }, withLine)).toEqual({ point: { x: 25, y: -40 }, kind: 'endpoint' });
  });

  it('snaps straight across or up from the last point, then to the grid', () => {
    const from = { x: 0, y: 50 };
    expect(infer({ x: 64, y: 51 }, { ...opts, from })).toEqual({ point: { x: 60, y: 50 }, kind: 'axis-x' });
    expect(infer({ x: 2, y: 87 }, { ...opts, from })).toEqual({ point: { x: 0, y: 90 }, kind: 'axis-y' });
    expect(infer({ x: 33, y: 77 }, { ...opts, from })).toEqual({ point: { x: 30, y: 80 }, kind: 'grid' });
    expect(infer({ x: 33, y: 77 }, { ...opts, grid: null, from })).toEqual({ point: { x: 33, y: 77 }, kind: 'free' });
  });

  it('keeps a locked direction', () => {
    const from = { x: 0, y: 50 };
    expect(infer({ x: 41, y: 90 }, { ...opts, from, lock: { x: 1, y: 0 } })).toEqual({
      point: { x: 40, y: 50 },
      kind: 'axis-x',
    });
    const diag = infer({ x: 30, y: 80 }, { ...opts, grid: null, from, lock: { x: 1, y: 1 } });
    expect(diag.kind).toBe('locked');
    expect(diag.point.x).toBeCloseTo(30);
    expect(diag.point.y).toBeCloseTo(80);
  });
});
