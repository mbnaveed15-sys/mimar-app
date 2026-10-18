import { describe, expect, it } from 'vitest';
import type { PlanDoc, Wall } from '../types';
import { detectRoom } from '../rooms';
import { emptyDoc } from './storage';
import { dragRoomCorner, dragWallJoints, wallEndsAt } from './roomGrips';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
  thickness: 10,
});

// Two rooms side by side: 0..100 and 100..200 across, 0..100 down.
function twoRooms(): PlanDoc {
  const elements = [
    wall('top-l', 0, 0, 100, 0),
    wall('top-r', 100, 0, 200, 0),
    wall('bot-l', 0, 100, 100, 100),
    wall('bot-r', 100, 100, 200, 100),
    wall('left', 0, 0, 0, 100),
    wall('mid', 100, 0, 100, 100),
    wall('right', 200, 0, 200, 100),
  ];
  const a = detectRoom(elements, { x: 50, y: 50 })!;
  const b = detectRoom(elements, { x: 150, y: 50 })!;
  return {
    ...emptyDoc(),
    elements,
    rooms: [
      { id: 'A', name: 'Bed', points: a },
      { id: 'B', name: 'Lounge', points: b },
    ],
  };
}

const maxX = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x));
const minY = (pts: { y: number }[]) => Math.min(...pts.map((p) => p.y));

describe('room corner grips', () => {
  it('finds the wall ends that meet at a room corner', () => {
    const d = twoRooms();
    const room = d.rooms[0];
    const corner = room.points.reduce((best, p) => (p.x + p.y < best.x + best.y ? p : best));
    const ends = wallEndsAt(d, room, corner).map((e) => `${e.id}:${e.end}`);
    expect(ends.sort()).toEqual(['left:start', 'top-l:start']);
  });

  it('moves the walls at the corner and finds the room again, keeping its name', () => {
    const d = twoRooms();
    const room = d.rooms[0];
    const i = room.points.findIndex((p) => p.x < 50 && p.y < 50);
    const c = room.points[i];
    const next = dragRoomCorner(d, 'A', i, { x: c.x, y: c.y - 20 });
    const left = next.elements.find((e) => e.id === 'left') as Wall;
    const top = next.elements.find((e) => e.id === 'top-l') as Wall;
    expect(left.y1).toBeCloseTo(-20);
    expect(top.y1).toBeCloseTo(-20);
    const moved = next.rooms.find((r) => r.id === 'A')!;
    expect(moved.name).toBe('Bed');
    expect(minY(moved.points)).toBeLessThan(minY(room.points));
  });

  it('reshapes the room next door when they share the corner', () => {
    const d = twoRooms();
    const room = d.rooms[0];
    // The top-right corner of room A is where the middle wall meets the top walls.
    const i = room.points.findIndex((p) => p.x > 50 && p.y < 50);
    const c = room.points[i];
    const next = dragRoomCorner(d, 'A', i, { x: c.x + 20, y: c.y });
    const mid = next.elements.find((e) => e.id === 'mid') as Wall;
    expect(mid.x1).toBeCloseTo(120);
    expect(maxX(next.rooms.find((r) => r.id === 'A')!.points)).toBeGreaterThan(maxX(room.points));
    expect(next.rooms.find((r) => r.id === 'B')!.points).not.toEqual(d.rooms[1].points);
  });

  it('leaves the plan alone for a corner that is not there', () => {
    const d = twoRooms();
    expect(dragRoomCorner(d, 'A', 99, { x: 0, y: 0 })).toBe(d);
    expect(dragRoomCorner(d, 'nope', 0, { x: 0, y: 0 })).toBe(d);
  });
});

describe('dragging a wall', () => {
  it('takes the walls meeting its ends with it, and the rooms reshape', () => {
    const doc = dragWallJoints(twoRooms(), 'right', [
      { end: 'start', dx: 40, dy: 0 },
      { end: 'end', dx: 40, dy: 0 },
    ]);
    const w = (id: string) => doc.elements.find((el) => el.id === id) as Wall;
    expect([w('right').x1, w('right').x2]).toEqual([240, 240]);
    expect([w('top-r').x2, w('bot-r').x2, w('top-r').x1]).toEqual([240, 240, 100]);
    expect(maxX(doc.rooms[1].points)).toBeGreaterThan(220);
    expect(doc.rooms[0].points).toEqual(twoRooms().rooms[0].points);
  });

  it('takes the walls meeting one end with that end', () => {
    const doc = dragWallJoints(twoRooms(), 'mid', [{ end: 'start', dx: 0, dy: -30 }]);
    const w = (id: string) => doc.elements.find((el) => el.id === id) as Wall;
    expect([w('mid').y1, w('top-l').y2, w('top-r').y1, w('top-l').y1]).toEqual([-30, -30, -30, 0]);
    expect(minY(doc.rooms[0].points)).toBeLessThan(0);
  });
});
