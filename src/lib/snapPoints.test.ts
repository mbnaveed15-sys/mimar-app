import { describe, expect, it } from 'vitest';
import type { PlanElement, Wall } from '../types';
import { infer } from './inference';
import { snapPoints } from './snapPoints';

const opts = { walls: [] as Wall[], tolerance: 5, grid: 10 };

describe('corners of every item', () => {
  it('offers the corners and edge middles of slabs, furniture, columns and beams', () => {
    const els: PlanElement[] = [
      {
        id: 's',
        type: 'slab',
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 50 },
          { x: 0, y: 50 },
        ],
      } as PlanElement,
      { id: 'f', type: 'furniture', x: 200, y: 200, w: 40, h: 20 } as PlanElement,
      { id: 'c', type: 'column', x: 300, y: 300, w: 10, h: 10, shape: 'rect' } as PlanElement,
      { id: 'b', type: 'beam', x1: 0, y1: 400, x2: 100, y2: 400, width: 10, depth: 20 } as PlanElement,
    ];
    const pts = snapPoints(els);
    const corner = (x: number, y: number) =>
      pts.some((p) => p.kind === 'item-corner' && Math.hypot(p.point.x - x, p.point.y - y) < 1e-6);
    expect(corner(100, 50)).toBe(true);
    expect(corner(220, 210)).toBe(true);
    expect(corner(305, 295)).toBe(true);
    expect(corner(100, 405)).toBe(true);
    expect(pts.some((p) => p.kind === 'midpoint' && p.point.x === 50 && p.point.y === 0)).toBe(true);
    // Left out while being moved.
    expect(snapPoints(els, new Set(['f'])).some((p) => p.point.x === 220)).toBe(false);
  });

  it('snaps to an item corner, ahead of a slightly nearer middle', () => {
    const points = [
      { point: { x: 0, y: 0 }, kind: 'item-corner' as const },
      { point: { x: 3, y: 0 }, kind: 'midpoint' as const },
    ];
    expect(infer({ x: 1.8, y: 0 }, { ...opts, points })).toEqual({ point: { x: 0, y: 0 }, kind: 'item-corner' });
    expect(infer({ x: 2.9, y: 0 }, { ...opts, points }).kind).toBe('midpoint');
  });

  it('finds the outside and inside corners where two thick walls meet', () => {
    const walls: Wall[] = [
      { id: 'a', type: 'wall', x1: 0, y1: 0, x2: 100, y2: 0, thickness: 20 },
      { id: 'b', type: 'wall', x1: 0, y1: 0, x2: 0, y2: 100, thickness: 20 },
    ];
    expect(infer({ x: -8, y: -12 }, { ...opts, walls, grid: null })).toEqual({
      point: { x: -10, y: -10 },
      kind: 'corner',
    });
    expect(infer({ x: 12, y: 8 }, { ...opts, walls, grid: null })).toEqual({ point: { x: 10, y: 10 }, kind: 'corner' });
  });
});
