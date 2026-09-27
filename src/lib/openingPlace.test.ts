import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../types';
import {
  doorSides,
  flipsTowards,
  handOf,
  openingFits,
  placeAtDistance,
  placeOnWallPiece,
  wallPieces,
  type PlaceContext,
} from './openingPlace';

const FT = 30.48;
const IN = FT / 12;
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, thick = 9): Wall => ({
  id,
  type: 'wall',
  x1: x1 * FT,
  y1: y1 * FT,
  x2: x2 * FT,
  y2: y2 * FT,
  thickness: thick * IN,
});

// A 20' × 10' room of 9" walls, split in two by a 4½" partition 10' along.
const top = wall('top', 0, 0, 20, 0);
const walls = [
  top,
  wall('right', 20, 0, 20, 10),
  wall('bottom', 20, 10, 0, 10),
  wall('left', 0, 10, 0, 0),
  wall('mid', 10, 0, 10, 10, 4.5),
];
const ctx = (over: Partial<PlaceContext> = {}): PlaceContext => ({
  walls,
  openings: [],
  gap: 6 * IN,
  grid: null,
  tolerance: 0.5 * FT,
  fmt: (u) => `${(u / FT).toFixed(2)}ft`,
  noun: 'door',
  ...over,
});
const door = (x: number, width = 3 * FT): Opening => ({
  id: 'd1',
  type: 'door',
  wallId: 'top',
  x,
  y: 0,
  angle: 0,
  width,
});

describe('wall pieces', () => {
  it('splits a wall at the faces of the walls that meet it', () => {
    const pieces = wallPieces(top, walls);
    expect(pieces).toHaveLength(2);
    expect(pieces[0].a).toBeCloseTo(4.5 * IN);
    expect(pieces[0].b).toBeCloseTo(10 * FT - 2.25 * IN);
    expect(pieces[1].a).toBeCloseTo(10 * FT + 2.25 * IN);
    expect(pieces[1].b).toBeCloseTo(20 * FT - 4.5 * IN);
    expect(pieces.every((p) => p.gapA && p.gapB)).toBe(true);
  });

  it('keeps a gap at a free end but not where a wall carries straight on', () => {
    const a = wall('a', 0, 0, 10, 0);
    const b = wall('b', 10, 0, 20, 0);
    const [piece] = wallPieces(a, [a, b]);
    expect(piece.a).toBe(0);
    expect(piece.b).toBeCloseTo(10 * FT);
    expect(piece.gapA).toBe(true);
    expect(piece.gapB).toBe(false);
  });
});

describe('placing a door or window on a wall', () => {
  const [left] = wallPieces(top, walls);
  const centre = (left.a + left.b) / 2;

  it('snaps to the centre of the piece between walls', () => {
    const at = placeOnWallPiece(top, { x: centre + 5, y: 3 }, 3 * FT, ctx());
    expect(at.ok && at.snap).toBe('wall-centre');
    expect(at.ok && at.x).toBeCloseTo(centre);
  });

  it('snaps to the centre of either half', () => {
    const quarter = left.a + (left.b - left.a) / 4;
    const at = placeOnWallPiece(top, { x: quarter + 4, y: 0 }, 2 * FT, ctx());
    expect(at.ok && at.snap).toBe('half-centre');
    expect(at.ok && at.x).toBeCloseTo(quarter);
  });

  it('never goes flush with a corner: it stops the gap away from the wall face', () => {
    const at = placeOnWallPiece(top, { x: 0, y: 0 }, 3 * FT, ctx());
    expect(at.ok).toBe(true);
    if (!at.ok) return;
    expect(at.before).toBeCloseTo(6 * IN);
    expect(at.x).toBeCloseTo(4.5 * IN + 6 * IN + 1.5 * FT);
    expect(at.snap).toBe('corner-gap');
  });

  it('stays clear of another door, with the gap between them', () => {
    const other = door(centre, 2 * FT);
    const at = placeOnWallPiece(top, { x: centre + FT, y: 0 }, 2 * FT, ctx({ openings: [other], ignoreId: 'new' }));
    expect(at.ok).toBe(true);
    if (!at.ok) return;
    expect(Math.abs(at.x - centre)).toBeGreaterThanOrEqual(2 * FT + 6 * IN - 1e-6);
    // No room at all for a wider one.
    const wide = placeOnWallPiece(top, { x: centre + FT, y: 0 }, 3 * FT, ctx({ openings: [other] }));
    expect(wide.ok).toBe(false);
    if (!wide.ok) expect(wide.error).toMatch(/too close to a door or window/);
  });

  it('refuses a door too wide for the piece, saying what it needs', () => {
    const short = wall('short', 0, 0, 3, 0);
    const ends = [short, wall('l', 0, -5, 0, 5), wall('r', 3, -5, 3, 5)];
    const at = placeOnWallPiece(short, { x: 1.5 * FT, y: 0 }, 3 * FT, ctx({ walls: ends }));
    expect(at.ok).toBe(false);
    if (at.ok) return;
    expect(at.error).toMatch(/needs 4\.00ft with its gaps/);
  });

  it('snaps to round distances from the nearer corner', () => {
    const at = placeOnWallPiece(top, { x: left.a + 4 * FT + 2, y: 0 }, 3 * FT, ctx({ grid: 6 * IN, tolerance: 1 }));
    expect(at.ok && at.snap).toBe('from-corner');
    if (!at.ok) return;
    expect(at.before / (6 * IN)).toBeCloseTo(Math.round(at.before / (6 * IN)));
  });

  it('takes a typed distance from the corner, but not less than the gap', () => {
    const at = placeAtDistance(top, { x: left.a + FT, y: 0 }, 3 * FT, 2 * FT, ctx());
    expect(at.ok && at.before).toBeCloseTo(2 * FT);
    const tooClose = placeAtDistance(top, { x: left.a + FT, y: 0 }, 3 * FT, 1 * IN, ctx());
    expect(tooClose.ok).toBe(false);
    if (!tooClose.ok) expect(tooClose.error).toMatch(/at least/);
  });

  it('tells whether a door keeps its gaps', () => {
    expect(openingFits(door(centre), top, ctx())).toBe(true);
    expect(openingFits(door(left.a + 1.5 * FT), top, ctx())).toBe(false);
  });
});

describe('door hands', () => {
  it('opens towards the pointer with the chosen hinge side', () => {
    for (const hand of ['left', 'right'] as const)
      for (const y of [-50, 50]) {
        const flips = flipsTowards({ x: 100, y: 0, angle: 0 }, { x: 100, y }, hand);
        const o = { angle: 0, ...flips };
        expect(handOf(o)).toBe(hand);
        expect(Math.sign(doorSides(o).swing.y)).toBe(Math.sign(y));
      }
  });
});
