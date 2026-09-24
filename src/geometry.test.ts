import { describe, expect, it } from 'vitest';
import { findElementNear, nearestWall, placeOnWall, pointInPolygon, pointToSegmentDistance, snap } from './geometry';
import type { PlanElement, Wall } from './types';

const wall: Wall = { id: 'w1', type: 'wall', x1: 0, y1: 0, x2: 200, y2: 0 };

describe('geometry', () => {
  it('snaps to the grid', () => {
    expect(snap({ x: 37, y: 12 }, 25)).toEqual({ x: 25, y: 0 });
  });

  it('measures distance to a segment, including beyond its ends', () => {
    expect(pointToSegmentDistance({ x: 100, y: 30 }, { x: 0, y: 0 }, { x: 200, y: 0 })).toBe(30);
    expect(pointToSegmentDistance({ x: 230, y: 40 }, { x: 0, y: 0 }, { x: 200, y: 0 })).toBe(50);
    expect(pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });

  it('tests points inside polygons', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('finds the topmost element first and hits furniture anywhere inside it', () => {
    const els: PlanElement[] = [wall, { id: 'f1', type: 'furniture', x: 100, y: 0, w: 120, h: 80 }];
    expect(findElementNear(els, { x: 100, y: 2 }, 12)?.id).toBe('f1');
    expect(findElementNear(els, { x: 150, y: 35 }, 12)?.id).toBe('f1');
    expect(findElementNear(els, { x: 10, y: 5 }, 12)?.id).toBe('w1');
    expect(findElementNear(els, { x: 500, y: 500 }, 12)).toBeNull();
  });

  it('finds the nearest wall within range', () => {
    const other: Wall = { id: 'w2', type: 'wall', x1: 0, y1: 50, x2: 200, y2: 50 };
    expect(nearestWall([wall, other], { x: 50, y: 40 }, 20)?.id).toBe('w2');
    expect(nearestWall([wall, other], { x: 50, y: 15 }, 20)?.id).toBe('w1');
    expect(nearestWall([wall], { x: 50, y: 100 }, 20)).toBeNull();
  });

  it('places openings on the wall, clamped inside it', () => {
    expect(placeOnWall(wall, { x: 100, y: 7 }, 90)).toEqual({ x: 100, y: 0, angle: 0, width: 90 });
    expect(placeOnWall(wall, { x: 5, y: 0 }, 90).x).toBe(45);
    expect(placeOnWall(wall, { x: 5, y: 0 }, 500).width).toBe(200);
    const vertical: Wall = { id: 'v', type: 'wall', x1: 0, y1: 0, x2: 0, y2: 200 };
    expect(placeOnWall(vertical, { x: 3, y: 100 }, 90).angle).toBe(90);
  });
});
