import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../storage';
import { FT } from './settings';
import { frameFingerprint, frameSig, generateFrame, isUntouched } from './generate';
import { lintelsOf } from './lintels';
import { wallGraph } from './graph';
import type { Beam, Column, Opening, PlanDoc, Slab, Wall } from '../../types';

const U = FT / 10; // a foot in plan units
const wall = (id: string, x1: number, y1: number, x2: number, y2: number, levelId?: string): Wall => ({
  id,
  type: 'wall',
  x1: x1 * U,
  y1: y1 * U,
  x2: x2 * U,
  y2: y2 * U,
  ...(levelId ? { levelId } : {}),
});

/** A 30' x 20' house split by a wall at 15', with a window and a wide garage door. */
function house(): PlanDoc {
  const doc = emptyDoc();
  doc.plinthMm = 610;
  doc.elements = [
    wall('s', 0, 0, 30, 0),
    wall('e', 30, 0, 30, 20),
    wall('n', 30, 20, 0, 20),
    wall('w', 0, 20, 0, 0),
    wall('m', 15, 0, 15, 20),
  ];
  doc.rooms = [
    {
      id: 'r1',
      name: 'Bedroom',
      points: [
        { x: 0, y: 0 },
        { x: 15 * U, y: 0 },
        { x: 15 * U, y: 20 * U },
        { x: 0, y: 20 * U },
      ],
    },
    {
      id: 'r2',
      name: 'Lounge',
      points: [
        { x: 15 * U, y: 0 },
        { x: 30 * U, y: 0 },
        { x: 30 * U, y: 20 * U },
        { x: 15 * U, y: 20 * U },
      ],
    },
  ];
  return doc;
}

const of = <T extends 'column' | 'beam' | 'slab'>(doc: PlanDoc, type: T) =>
  doc.elements.filter((el) => el.type === type) as Extract<PlanDoc['elements'][number], { type: T }>[];

describe('the wall graph', () => {
  it('finds corners, tees and the runs between them', () => {
    const g = wallGraph(house().elements as Wall[]);
    expect(g.junctions.filter((j) => j.column)).toHaveLength(6);
    // Two 15' runs on each long wall, the two ends and the middle wall.
    expect(g.runs).toHaveLength(7);
  });
});

describe('generate structure', () => {
  it('puts columns at the junctions and along long walls, beams on every wall line, a slab and footings', () => {
    const doc = house();
    const r = generateFrame(doc, 3048);
    const out = { ...doc, elements: r.elements };
    const cols = of(out, 'column');
    // 6 junctions and one column halfway along each 20' wall.
    expect(cols).toHaveLength(9);
    expect(cols.every((c) => c.auto && c.mark === 'C1')).toBe(true);
    // Ground floor columns run down to their footings.
    expect(cols[0].belowMm).toBeGreaterThan(doc.plinthMm);
    const beams = of(out, 'beam');
    expect(beams.filter((b) => b.kind === 'roof').length).toBe(10);
    expect(beams.filter((b) => b.kind === 'plinth').length).toBe(10);
    expect(beams.filter((b) => b.kind === 'tie').length).toBe(10);
    const slabs = of(out, 'slab');
    expect(slabs.filter((s) => !s.footing)).toHaveLength(1);
    expect(slabs.filter((s) => s.footing === 'pad').length).toBe(9);
    expect(r.counts).toMatchObject({ columns: 9, footings: 9, slabs: 1 });
  });

  it('keeps columns off openings and puts one each side of a wide one', () => {
    const doc = house();
    // A 6' window halfway along the 20' east wall, where the middle column would go.
    const win: Opening = { id: 'o1', type: 'window', wallId: 'e', x: 30 * U, y: 10 * U, angle: 90, width: 6 * U };
    // An 8' garage door in the south wall's west half.
    const door: Opening = { id: 'o2', type: 'door', wallId: 's', x: 7.5 * U, y: 0, angle: 0, width: 8 * U };
    doc.elements.push(win, door);
    const cols = of({ ...doc, elements: generateFrame(doc, 3048).elements }, 'column');
    const onEast = cols.filter((c) => Math.abs(c.x - 30 * U) < 1 && c.y > 1 && c.y < 20 * U - 1);
    expect(onEast).toHaveLength(1);
    expect(Math.abs(onEast[0].y - 10 * U)).toBeGreaterThan(3 * U);
    const onSouth = cols.filter((c) => Math.abs(c.y) < 1 && c.x > 1 && c.x < 15 * U - 1);
    expect(onSouth).toHaveLength(2);
    expect(onSouth.every((c) => Math.abs(c.x - 7.5 * U) > 4 * U)).toBe(true);
  });

  it('stacks columns: an upper floor’s column runs down every floor', () => {
    const doc = house();
    doc.levels = [...doc.levels, { id: 'f1', name: 'First floor' }];
    // The first floor has one extra wall the ground floor doesn't (a cross wall at 10' in the lounge).
    doc.elements.push(
      wall('s1', 0, 0, 30, 0, 'f1'),
      wall('e1', 30, 0, 30, 20, 'f1'),
      wall('n1', 30, 20, 0, 20, 'f1'),
      wall('w1', 0, 20, 0, 0, 'f1'),
      wall('x1', 15, 10, 30, 10, 'f1'),
    );
    const out = { ...doc, elements: generateFrame(doc, 3048).elements };
    const ground = of(out, 'column').filter((c) => !c.levelId);
    // The tee at (30, 10) on the first floor needs a column under it on the ground floor.
    expect(ground.some((c) => Math.abs(c.x - 30 * U) < 1 && Math.abs(c.y - 10 * U) < 1)).toBe(true);
    // A beam on the ground floor carries the first floor's cross wall (no wall under it).
    const carry = of(out, 'beam').filter(
      (b) => !b.levelId && !b.kind && Math.abs(b.y1 - 10 * U) < 1 && Math.abs(b.y2 - 10 * U) < 1,
    );
    expect(carry.length).toBeGreaterThan(0);
    // Two floors: the ground floor's columns carry two storeys.
    expect(of(out, 'beam').some((b) => b.levelId === 'f1' && b.kind === 'roof')).toBe(true);
  });

  it('keeps what you edited and replaces the rest on Regenerate', () => {
    const doc = house();
    const first = { ...doc, elements: generateFrame(doc, 3048).elements };
    expect(of(first, 'column').every(isUntouched)).toBe(true);
    const moved = of(first, 'column')[0];
    const edited: Column = { ...moved, x: moved.x + 5 };
    first.elements = first.elements.map((el) => (el.id === moved.id ? edited : el));
    expect(isUntouched(edited)).toBe(false);
    const again = generateFrame(first, 3048);
    expect(again.kept).toBe(1);
    const cols = of({ ...doc, elements: again.elements }, 'column');
    expect(cols).toHaveLength(9);
    const own = cols.find((c) => c.id === moved.id)!;
    expect(own.auto).toBeUndefined();
    expect(own.x).toBe(moved.x + 5);
  });

  it('builds a load-bearing house with bands and strip footings, no columns', () => {
    const doc = house();
    doc.frame = { settings: { system: 'bearing' } };
    const out = { ...doc, elements: generateFrame(doc, 3048).elements };
    expect(of(out, 'column')).toHaveLength(0);
    const bands = of(out, 'beam').filter((b: Beam) => b.kind === 'band');
    // A roof band and a lintel band (zone 2B) on the five walls.
    expect(bands.length).toBe(10);
    expect(of(out, 'slab').filter((s: Slab) => s.footing === 'strip').length).toBeGreaterThan(5);
  });

  it('says when the plan has changed since', () => {
    const doc = house();
    const r = generateFrame(doc, 3048);
    const out: PlanDoc = { ...doc, elements: r.elements, frame: { madeFrom: r.madeFrom } };
    expect(frameFingerprint(out)).toBe(r.madeFrom);
    const moved = {
      ...out,
      elements: out.elements.map((el) => (el.id === 'm' && el.type === 'wall' ? { ...el, x1: el.x1 + 10 } : el)),
    };
    expect(frameFingerprint(moved)).not.toBe(r.madeFrom);
    expect(frameSig(of(out, 'column')[0])).toBe(of(out, 'column')[0].autoSig);
  });
});

describe('lintels', () => {
  it('sit over each opening with 9" bearing, joined when close', () => {
    const doc = house();
    doc.elements.push(
      { id: 'a', type: 'window', wallId: 'n', x: 5 * U, y: 20 * U, angle: 180, width: 4 * U },
      { id: 'b', type: 'window', wallId: 'n', x: 9.5 * U, y: 20 * U, angle: 180, width: 4 * U },
      { id: 'c', type: 'door', wallId: 'm', x: 15 * U, y: 10 * U, angle: 90, width: 3 * U },
    );
    expect(lintelsOf(doc, 3048)).toHaveLength(0);
    const r = generateFrame(doc, 3048);
    const out: PlanDoc = { ...doc, elements: r.elements, frame: { madeFrom: r.madeFrom } };
    const ls = lintelsOf(out, 3048);
    // The two windows 6" apart share one lintel.
    expect(ls).toHaveLength(2);
    const door = ls.find((l) => l.openingIds.includes('c'))!;
    expect(door.lengthMm).toBeCloseTo(3 * FT + 2 * 9 * 25.4, 0);
    expect(door.depthMm).toBeCloseTo(6 * 25.4, 1);
    expect(door.bottomMm).toBe(2134);
  });
});
