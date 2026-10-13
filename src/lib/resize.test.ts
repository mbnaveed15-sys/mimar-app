import { describe, expect, it } from 'vitest';
import { fromFurnitureLocal } from '../geometry';
import type { Column, Furniture, Stair } from '../types';
import { cornerGrips, dragCorner, isCornerGrip } from './resize';

const bed: Furniture = { id: 'f', type: 'furniture', x: 100, y: 100, w: 40, h: 60, rotation: 0, kind: 'bed-double' };

describe('corner grips', () => {
  it('shows four corner grips on furniture, at its corners', () => {
    const grips = cornerGrips(bed);
    expect(grips.map((g) => g.name).sort()).toEqual(['corner-lb', 'corner-lt', 'corner-rb', 'corner-rt']);
    expect(grips.find((g) => g.name === 'corner-rb')!.at).toEqual({ x: 120, y: 130 });
    expect(isCornerGrip('corner-lt')).toBe(true);
    expect(isCornerGrip('shape-corner-0')).toBe(false);
  });

  it('keeps the opposite corner where it was', () => {
    const next = dragCorner(bed, 'corner-rb', { x: 150, y: 140 }) as Furniture;
    expect(next.w).toBeCloseTo(70);
    expect(next.h).toBeCloseTo(70);
    const lt = fromFurnitureLocal(next, { x: -next.w / 2, y: -next.h / 2 });
    expect(lt.x).toBeCloseTo(80);
    expect(lt.y).toBeCloseTo(70);
  });

  it('works on a turned item', () => {
    const turned = { ...bed, rotation: 90 };
    const fixed = fromFurnitureLocal(turned, { x: 20, y: 30 });
    const grip = cornerGrips(turned).find((g) => g.name === 'corner-lt')!;
    const next = dragCorner(turned, 'corner-lt', { x: grip.at.x - 10, y: grip.at.y - 10 }) as Furniture;
    const stays = fromFurnitureLocal(next, { x: next.w / 2, y: next.h / 2 });
    expect(stays.x).toBeCloseTo(fixed.x);
    expect(stays.y).toBeCloseTo(fixed.y);
    expect(next.w).toBeCloseTo(50);
    expect(next.h).toBeCloseTo(50);
  });

  it('gives no corner grips to locked items, columns or turning stairs', () => {
    expect(cornerGrips({ ...bed, locked: true })).toEqual([]);
    expect(cornerGrips({ id: 'c', type: 'column', shape: 'rect', x: 0, y: 0, w: 10, h: 10 } as Column)).toEqual([]);
    const lStair = { id: 's', type: 'stair', x: 0, y: 0, w: 40, h: 80, shape: 'L' } as unknown as Stair;
    expect(cornerGrips(lStair)).toEqual([]);
    expect(dragCorner(lStair, 'corner-rb', { x: 100, y: 100 })).toBeNull();
  });
});
