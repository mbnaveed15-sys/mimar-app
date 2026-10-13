import { describe, expect, it } from 'vitest';
import { snapToWalls, snapToFurniture } from './furnitureSnap';
import type { Wall } from '../types';

const T = 22.86;
const c = [
  { x: 0, y: 0 },
  { x: 500, y: 0 },
  { x: 500, y: 500 },
  { x: 0, y: 500 },
];
const walls: Wall[] = c.map((p, i) => ({
  id: `w${i}`,
  type: 'wall',
  x1: p.x,
  y1: p.y,
  x2: c[(i + 1) % 4].x,
  y2: c[(i + 1) % 4].y,
  thickness: T,
}));
const bed = { w: 137, h: 195 };

describe('furniture snapping to walls', () => {
  it('turns its back to the nearest wall and sits flush with its face', () => {
    const top = snapToWalls(bed, { x: 250, y: 120 }, walls)!;
    expect(top.rotation).toBe(0);
    expect(top.x).toBeCloseTo(250);
    expect(top.y).toBeCloseTo(T / 2 + 97.5);
    // Against the right-hand wall its back faces right.
    const right = snapToWalls(bed, { x: 400, y: 250 }, walls)!;
    expect(right.rotation).toBe(90);
    expect(right.x).toBeCloseTo(500 - T / 2 - 97.5);
    expect(right.y).toBeCloseTo(250);
    // V turned: its side to the wall.
    const side = snapToWalls(bed, { x: 250, y: 90 }, walls, 90)!;
    expect(side.rotation).toBe(90);
    expect(side.y).toBeCloseTo(T / 2 + 68.5);
  });

  it('tucks into a corner, and leaves the middle of the room alone', () => {
    const corner = snapToWalls(bed, { x: 90, y: 110 }, walls)!;
    expect(corner.rotation).toBe(0);
    expect(corner.x).toBeCloseTo(T / 2 + 68.5);
    expect(corner.y).toBeCloseTo(T / 2 + 97.5);
    expect(snapToWalls({ w: 60, h: 60 }, { x: 250, y: 250 }, walls)).toBeNull();
  });
});

describe('furniture lines up beside other furniture', () => {
  const bed = { id: 'b', type: 'furniture', x: 100, y: 100, w: 40, h: 60 } as const;
  const table = { w: 10, h: 10 };

  it('sits flush beside an item and lines up with its back', () => {
    // Just right of the bed, a little below its top (back) edge.
    const at = snapToFurniture(table, { x: 127, y: 77 }, [bed]);
    expect(at).toEqual({ x: 125, y: 75 });
  });

  it('sits in front of an item, lined up with its middle', () => {
    const at = snapToFurniture(table, { x: 101, y: 138 }, [bed]);
    expect(at).toEqual({ x: 100, y: 135 });
  });

  it('works for items turned a quarter turn', () => {
    const turned = { ...bed, rotation: 90 };
    // Turned, the bed runs 60 across and 40 up and down.
    const at = snapToFurniture({ ...table, rotation: 90 }, { x: 137, y: 100 }, [turned]);
    expect(at!.x).toBeCloseTo(135);
    expect(at!.y).toBeCloseTo(100);
  });

  it('leaves items far away or at odd angles alone', () => {
    expect(snapToFurniture(table, { x: 200, y: 100 }, [bed])).toBeNull();
    expect(snapToFurniture({ ...table, rotation: 30 }, { x: 127, y: 100 }, [bed])).toBeNull();
  });
});
