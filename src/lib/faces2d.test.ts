import { describe, expect, it } from 'vitest';
import type { Block, Column, PlanElement, Slab, Wall } from '../types';
import { faceAt2D, planFaces } from './faces2d';
import { faceOf, pushPull } from './pushPull';
import { emptyDoc } from './storage';

// A 10 m wall along x, 230 mm thick: its faces are 11.5 units either side of y = 0.
const wall: Wall = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 23 };
const square = [
  { x: 0, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

describe('faces seen from above', () => {
  it('gives a wall two sides and two ends, each facing out', () => {
    const faces = planFaces(wall);
    expect(faces.map((f) => f.normal)).toEqual([
      { x: -0, y: 1 },
      { x: 0, y: -1 },
      { x: -1, y: -0 },
      { x: 1, y: 0 },
    ]);
    expect(faces[0].a.y).toBeCloseTo(11.5);
  });

  it('finds the nearest face within reach, and none further away', () => {
    expect(faceAt2D([wall], { x: 500, y: 13 }, 5)?.normal).toEqual({ x: -0, y: 1 });
    expect(faceAt2D([wall], { x: 1003, y: 0 }, 5)?.normal).toEqual({ x: 1, y: 0 });
    expect(faceAt2D([wall], { x: 500, y: 40 }, 5)).toBeNull();
    const round: Column = { id: 'c', type: 'column', x: 0, y: 0, w: 30, h: 30, shape: 'round' };
    expect(faceAt2D([round], { x: 0, y: 16 }, 5)?.normal).toEqual({ x: 0, y: 1 });
  });

  it('leaves flat shapes out (they are pulled up in 3D), but takes slab and block edges', () => {
    const flat: Block = { id: 'b', type: 'block', points: square, heightMm: 0, shape: 'rect' };
    expect(planFaces(flat)).toEqual([]);
    const slab: Slab = { id: 's', type: 'slab', points: square, thickness: 15 };
    expect(faceAt2D([slab], { x: 102, y: 150 }, 5)?.normal).toEqual({ x: 1, y: -0 });
  });

  it('pushes the face found in 2D the same way as in 3D', () => {
    const face = faceAt2D([wall], { x: 1002, y: 0 }, 5)!;
    const el = wall as PlanElement;
    const grabbed = faceOf(el, [face.normal.x, 0, face.normal.y], [10, 0, 0])!;
    expect(grabbed).toEqual({ part: 'end', end: 2 });
    const doc = pushPull({ ...emptyDoc(), elements: [wall] }, 'w', grabbed, 500, { wallHeightMm: 3048 }).doc;
    expect((doc.elements[0] as Wall).x2).toBeCloseTo(1050);
  });
});
