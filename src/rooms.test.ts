import { describe, expect, it } from 'vitest';
import { detectRoom, labelPoint, openWallEnds, polygonArea, wallFaces } from './rooms';
import type { Wall } from './types';

let n = 0;
const wall = (x1: number, y1: number, x2: number, y2: number): Wall => ({
  id: `w${n++}`,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
});
const box = (x: number, y: number, w: number, h: number) => [
  wall(x, y, x + w, y),
  wall(x + w, y, x + w, y + h),
  wall(x + w, y + h, x, y + h),
  wall(x, y + h, x, y),
];

describe('room detection', () => {
  it('finds the area inside four walls', () => {
    const faces = wallFaces(box(0, 0, 100, 50));
    expect(faces).toHaveLength(1);
    expect(polygonArea(faces[0])).toBe(5000);
    expect(detectRoom(box(0, 0, 100, 50), { x: 10, y: 10 })).toHaveLength(4);
  });

  it('returns null outside walls or inside an open shape', () => {
    expect(detectRoom(box(0, 0, 100, 50), { x: 200, y: 10 })).toBeNull();
    expect(detectRoom(box(0, 0, 100, 50).slice(0, 3), { x: 10, y: 10 })).toBeNull();
  });

  it('splits a box with a dividing wall that ends on the outer walls (T-junctions)', () => {
    const walls = [...box(0, 0, 200, 100), wall(80, 0, 80, 100)];
    expect(polygonArea(detectRoom(walls, { x: 10, y: 10 })!)).toBe(8000);
    expect(polygonArea(detectRoom(walls, { x: 150, y: 10 })!)).toBe(12000);
  });

  it('handles walls drawn in any direction and walls that cross', () => {
    const walls = [
      wall(0, 0, 0, 100),
      wall(100, 100, 0, 100),
      wall(100, 0, 100, 100),
      wall(0, 0, 100, 0),
      wall(50, -20, 50, 120),
    ];
    expect(polygonArea(detectRoom(walls, { x: 25, y: 50 })!)).toBe(5000);
  });

  it('ignores a wall that sticks into the room', () => {
    const walls = [...box(0, 0, 100, 100), wall(0, 50, 40, 50)];
    const room = detectRoom(walls, { x: 70, y: 70 })!;
    expect(polygonArea(room)).toBe(10000);
  });

  it('places labels inside L-shaped rooms', () => {
    const L = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 100 },
      { x: 0, y: 100 },
    ];
    const p = labelPoint(L);
    expect(p.x < 20 || p.y < 20).toBe(true);
  });
  describe('walls that stop inside another wall', () => {
    // 9" walls (half is 11.43 units) in a 30' x 60' plot with boundary walls, in plan units (1' = 30.48).
    const F = 30.48;
    const ft = (x1: number, y1: number, x2: number, y2: number, extra: Partial<Wall> = {}): Wall => ({
      ...wall(x1 * F, y1 * F, x2 * F, y2 * F),
      ...extra,
    });
    const plot = [
      ft(0, 0, 30, 0, { kind: 'boundary' }),
      ft(30, 0, 30, 60, { kind: 'boundary' }),
      ft(30, 60, 0, 60, { kind: 'boundary' }),
      ft(0, 60, 0, 0, { kind: 'boundary' }),
    ];
    const sqft = (pts: ReturnType<typeof detectRoom>) => (pts ? Math.round(polygonArea(pts) / (F * F)) : null);
    const inside = { x: 15 * F, y: 20 * F };
    // The last wall stops on the first one's face corner (4½" short of its centre line).
    const faceEnd = [ft(5, 10, 25, 10), ft(25, 10, 25, 40), ft(25, 40, 5, 40), ft(5, 40, 5, 10.375)];

    it("joins a wall that ends on another wall's face", () => {
      expect(sqft(detectRoom([...plot, ...faceEnd], inside))).toBe(600);
    });

    it('splits a room with a partition that ends on a face', () => {
      const partition = ft(5, 25, 24.625, 25);
      expect(sqft(detectRoom([...plot, ...faceEnd, partition], inside))).toBe(300);
    });

    it('never makes the plot a room: an open house finds no room and shows its open ends', () => {
      const open = [ft(5, 10, 25, 10), ft(25, 10, 25, 40), ft(25, 40, 5, 40), ft(5, 40, 5, 12)];
      expect(detectRoom([...plot, ...open], inside)).toBeNull();
      const ends = openWallEnds([...plot, ...open]).map((p) => [Math.round(p.x / F), Math.round(p.y / F)]);
      expect(ends).toEqual(
        expect.arrayContaining([
          [5, 10],
          [5, 12],
        ]),
      );
      expect(ends).toHaveLength(2);
    });

    it('leaves walls running alongside each other apart', () => {
      // Two parallel walls a few inches apart don't join end to side.
      const walls = [...box(0, 0, 100 * F, 100 * F), ft(10, 50, 60, 50), ft(60, 50.2, 90, 50.2)];
      expect(openWallEnds(walls)).toHaveLength(4);
    });
  });
});
