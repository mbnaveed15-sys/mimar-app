import { describe, expect, it } from 'vitest';
import type { Furniture, Opening, PlanDoc, Wall } from '../types';
import {
  breakWall,
  chamferWalls,
  extendWall,
  filletWalls,
  joinWalls,
  mirrorItems,
  offsetWall,
  scaleItems,
  stretchItems,
  trimAt,
  wallCuts,
} from './modify';
import { emptyDoc } from './storage';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
});
const walls = (d: PlanDoc) => d.elements.filter((e): e is Wall => e.type === 'wall');
const byId = (d: PlanDoc, id: string) => d.elements.find((e) => e.id === id);
const plan = (...elements: PlanDoc['elements']): PlanDoc => ({ ...emptyDoc(), elements });

describe('trim, break and extend', () => {
  // A long wall crossed by two others at x = 40 and x = 70.
  const d = plan(wall('a', 0, 0, 100, 0), wall('b', 40, -20, 40, 20), wall('c', 70, -20, 70, 20));

  it('finds where other walls cross a wall', () => {
    expect(wallCuts(d, walls(d)[0], 0.5)).toEqual([0.4, 0.7]);
  });

  it('trims only the piece that was clicked, keeping doors on the rest', () => {
    const door: Opening = { id: 'd', type: 'door', wallId: 'a', x: 15, y: 0, angle: 0, width: 10 };
    const out = trimAt({ ...d, elements: [...d.elements, door] }, 'a', { x: 55, y: 0 }, 0.5);
    const pieces = walls(out).filter((w) => w.y1 === 0 && w.y2 === 0);
    expect(pieces.map((w) => [w.x1, w.x2])).toEqual([
      [0, 40],
      [70, 100],
    ]);
    expect(byId(out, 'd')).toMatchObject({ wallId: 'a', x: 15 });
  });

  it('breaks a wall at a point or cuts a gap', () => {
    expect(walls(breakWall(d, 'a', 0.25)).filter((w) => w.y1 === 0)).toHaveLength(2);
    const gap = walls(breakWall(d, 'a', 0.2, 0.3)).filter((w) => w.y1 === 0);
    expect(gap.map((w) => [w.x1, w.x2])).toEqual([
      [0, 20],
      [30, 100],
    ]);
  });

  it('extends a wall end to the next wall', () => {
    const e = plan(wall('a', 0, 0, 30, 0), wall('b', 50, -20, 50, 20));
    expect(byId(extendWall(e, 'a', { x: 29, y: 0 })!, 'a')).toMatchObject({ x2: 50 });
    expect(extendWall(e, 'a', { x: 1, y: 0 })).toBeNull(); // nothing behind the start
  });
});

describe('join, fillet and chamfer', () => {
  it('joins walls in line and refuses others', () => {
    const j = plan(wall('a', 0, 0, 40, 0), wall('b', 50, 0, 90, 0), wall('c', 0, 10, 0, 50));
    expect(byId(joinWalls(j, 'a', 'b', 1)!, 'a')).toMatchObject({ x1: 0, x2: 90 });
    expect(joinWalls(j, 'a', 'c', 1)).toBeNull();
  });

  it('fillets two walls into a corner, keeping the clicked parts', () => {
    const f = plan(wall('a', 0, 0, 60, 0), wall('b', 40, -30, 40, 30));
    const out = filletWalls(f, 'a', { x: 10, y: 0 }, 'b', { x: 40, y: 20 })!;
    expect(byId(out, 'a')).toMatchObject({ x1: 0, x2: 40 });
    expect(byId(out, 'b')).toMatchObject({ y1: 0, y2: 30 });
  });

  it('rounds a corner with a radius, and chamfers one', () => {
    const f = plan(wall('a', 0, 0, 40, 0), wall('b', 40, 0, 40, 40));
    const round = filletWalls(f, 'a', { x: 5, y: 0 }, 'b', { x: 40, y: 35 }, 10)!;
    expect(byId(round, 'a')).toMatchObject({ x2: 30 });
    expect(walls(round).length).toBeGreaterThan(3);
    const cut = chamferWalls(f, 'a', { x: 5, y: 0 }, 'b', { x: 40, y: 35 }, 10, 10)!;
    expect(walls(cut)).toHaveLength(3);
    expect(walls(cut)[2]).toMatchObject({ x1: 30, y1: 0, x2: 40, y2: 10 });
  });
});

describe('offset, mirror, scale and stretch', () => {
  it('offsets a wall to the clicked side', () => {
    expect(offsetWall(wall('a', 0, 0, 100, 0), 30, { x: 50, y: -5 })).toMatchObject({ y1: -30, y2: -30 });
  });

  it('mirrors a copy across a line, or flips in place', () => {
    const bed: Furniture = { id: 'f', type: 'furniture', x: 10, y: 5, w: 4, h: 6, rotation: 30 };
    const m = mirrorItems(plan(bed), ['f'], { x: 20, y: -10 }, { x: 20, y: 10 }, false);
    expect(m.doc.elements).toHaveLength(2);
    expect(m.doc.elements[1]).toMatchObject({ x: 30, y: 5, rotation: 150 });
    expect(mirrorItems(plan(bed), ['f'], { x: 20, y: -10 }, { x: 20, y: 10 }, true).doc.elements).toHaveLength(1);
  });

  it('scales about a base point, keeping wall thickness', () => {
    const s = scaleItems(plan({ ...wall('a', 10, 10, 20, 10), thickness: 3 }), ['a'], { x: 10, y: 10 }, 2);
    expect(byId(s, 'a')).toMatchObject({ x2: 30, thickness: 3 });
  });

  it('stretches what is in the box and leaves the rest', () => {
    const s = stretchItems(
      plan(wall('a', 0, 0, 50, 0), wall('b', 50, 0, 50, 40)),
      { minX: 45, minY: -5, maxX: 55, maxY: 45 },
      20,
      0,
    );
    expect(byId(s, 'a')).toMatchObject({ x1: 0, x2: 70 });
    expect(byId(s, 'b')).toMatchObject({ x1: 70, x2: 70 });
  });

  it('treats layout lines as cutting edges and trims, extends and offsets them too (AutoCAD construction lines)', () => {
    const line = (id: string, x1: number, y1: number, x2: number, y2: number): PlanDoc['elements'][number] => ({
      id,
      type: 'line',
      x1,
      y1,
      x2,
      y2,
    });
    // A wall crossed only by a layout line: trimming keeps the far piece (it used to delete the whole wall).
    const d1 = plan(wall('w', 0, 0, 100, 0), line('l', 40, -20, 40, 20));
    const out = trimAt(d1, 'w', { x: 20, y: 0 }, 0.5);
    expect(walls(out)).toHaveLength(1);
    expect(walls(out)[0]).toMatchObject({ x1: 40, x2: 100 });
    // A line trimmed by a wall, and extended to one.
    const d2 = plan(line('l', 0, 0, 100, 0), wall('w', 40, -20, 40, 20), wall('far', 150, -20, 150, 20));
    expect(trimAt(d2, 'l', { x: 80, y: 0 }, 0.5).elements.find((e) => e.id === 'l')).toMatchObject({ x2: 40 });
    expect(extendWall(d2, 'l', { x: 99, y: 0 })!.elements.find((e) => e.id === 'l')).toMatchObject({ x2: 150 });
    // Offset keeps it a line.
    expect(offsetWall(d2.elements[0] as Wall, 10, { x: 50, y: 10 }).type).toBe('line');
    // A wall doesn't join a line.
    expect(joinWalls(plan(wall('a', 0, 0, 10, 0), line('b', 10, 0, 20, 0)), 'a', 'b', 0.5)).toBeNull();
  });

  it('stretches only the items it is allowed to (the floor shown, nothing hidden or locked)', () => {
    const d = plan(wall('a', 0, 0, 100, 0), wall('b', 0, 50, 100, 50));
    const box = { minX: 90, minY: -10, maxX: 110, maxY: 60 };
    const out = stretchItems(d, box, 20, 0, (id) => id === 'a');
    expect(byId(out, 'a')).toMatchObject({ x2: 120 });
    expect(byId(out, 'b')).toMatchObject({ x2: 100 });
  });
});
