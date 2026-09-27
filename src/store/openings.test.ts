import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import { handOf } from '../lib/openingPlace';
import { mirrorItems } from '../lib/modify';
import { flipOpeningHand, pickUpOpening } from '../tools/openingTool';
import { hover, pasteToPlace, press } from '../tools/controller';
import type { Opening } from '../types';
import { fitterFor } from './openingAt';
import { createPlannerStore } from './plannerStore';

const FT = 30.48;
const IN = FT / 12;

/** A 20' wall along y = 0 with walls meeting its ends (9" thick), and the door tool on. */
function setup() {
  const store = createPlannerStore(emptyDoc());
  const s = () => store.getState();
  s().addWall({ x: 0, y: 0 }, { x: 20 * FT, y: 0 });
  s().addWall({ x: 0, y: -10 * FT }, { x: 0, y: 10 * FT });
  s().addWall({ x: 20 * FT, y: -10 * FT }, { x: 20 * FT, y: 10 * FT });
  s().setTool('door');
  return { store, s };
}
const openings = (s: () => ReturnType<ReturnType<typeof createPlannerStore>['getState']>) =>
  s().doc.elements.filter((el): el is Opening => el.type === 'door' || el.type === 'window');

describe('placing doors and windows', () => {
  it('keeps a door the gap away from a corner, and opens it towards the pointer', () => {
    const { s } = setup();
    expect(s().placeOpening('door', { x: 20, y: 5 })).toBe(true);
    const [door] = openings(s);
    // 4½" to the face of the wall at the corner, 6" gap, then half the 3' door.
    expect(door.x - door.width / 2).toBeCloseTo(4.5 * IN + 6 * IN);
    // The pointer was below the wall (y > 0): the door swings that way.
    expect(door.flipSide).toBe(true);
  });

  it('refuses a door that does not fit, saying why', () => {
    const { s } = setup();
    s().setSite({ doorWidthMm: 6500 });
    expect(s().placeOpening('door', { x: 10 * FT, y: 0 })).toBe(false);
    expect(openings(s)).toHaveLength(0);
    expect(s().warnings.join(' ')).toMatch(/needs .* with its gaps/);
  });

  it('places a door a typed distance from the nearer corner', () => {
    const { s } = setup();
    s().placeOpening('door', { x: 2 * FT, y: 5 }, 2 * 304.8);
    const [door] = openings(s);
    expect(door.x - door.width / 2 - 4.5 * IN).toBeCloseTo(2 * FT);
  });

  it('takes the width, hinge side and settings chosen before placing', () => {
    const { s } = setup();
    s().setSite({ doorWidthMm: 1000, doorHand: 'left' });
    s().placeOpening('door', { x: 10 * FT, y: -10 });
    const [door] = openings(s);
    expect(door.width).toBeCloseTo(100);
    expect(handOf(door)).toBe('left');
  });

  it('picks up a door (Alt-click) and flips the hinge with V', () => {
    const { store, s } = setup();
    s().setSite({ doorKind: 'double' });
    s().placeOpening('door', { x: 5 * FT, y: -10 });
    s().setSite({ doorKind: 'single' });
    expect(pickUpOpening(store, { x: 5 * FT, y: 0 })).toBe(true);
    expect(s().site.doorKind).toBe('double');
    expect(s().openingStamp).toHaveLength(1);
    expect([s().placeOpening('door', { x: 15 * FT, y: -10 }), ...s().warnings]).toEqual([true]);
    expect(openings(s).map((o) => o.doorKind)).toEqual(['double', 'double']);
    const before = handOf(openings(s)[1]);
    flipOpeningHand(store);
    s().placeOpening('door', { x: 10, y: 5 * FT });
    expect(handOf(openings(s)[2])).not.toBe(before);
  });
});

describe('copying doors and windows on their own', () => {
  it('duplicates a door beside itself on its wall, the gap between them', () => {
    const { s } = setup();
    s().placeOpening('door', { x: 6 * FT, y: -10 });
    const [door] = openings(s);
    s().setTool('select');
    s().select(door.id);
    s().duplicateSelected();
    const [, copy] = openings(s);
    expect(copy.wallId).toBe(door.wallId);
    expect(Math.abs(copy.x - door.x)).toBeGreaterThanOrEqual(door.width + 6 * IN - 1e-6);
    expect(s().selectedIds).toEqual([copy.id]);
  });

  it('pastes a copied door onto any wall, one click each', () => {
    const { store, s } = setup();
    s().placeOpening('door', { x: 6 * FT, y: -10 });
    s().setTool('select');
    s().select(openings(s)[0].id);
    s().copySelected();
    pasteToPlace(store);
    expect(s().tool).toBe('door');
    expect(s().stampQueue).toBe(true);
    s().placeOpening('door', { x: 0, y: 5 * FT });
    const copy = openings(s)[1];
    expect(copy.wallId).not.toBe(openings(s)[0].wallId);
    // The one pasted door is down: back to selecting.
    expect(s().tool).toBe('select');
  });

  it('Move with Ctrl copies a door on its own onto the wall the pointer is at', () => {
    const { store, s } = setup();
    s().placeOpening('door', { x: 6 * FT, y: -10 });
    const [door] = openings(s);
    s().setTool('select');
    s().select(door.id);
    s().setTool('move');
    press(store, { x: door.x, y: door.y }, { ctrl: true });
    hover(store, { x: 5, y: 5 * FT });
    press(store, { x: 5, y: 5 * FT });
    const all = openings(s);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(door);
    // On the wall at x = 0, opening towards the pointer (x > 0), and selected.
    expect(all[1].x).toBeCloseTo(0);
    expect(s().selectedIds).toEqual([all[1].id]);
  });

  it('mirrors a door on its own: across its wall the hinge swaps, along it the swing', () => {
    const { s } = setup();
    s().placeOpening('door', { x: 5 * FT, y: -10 });
    const [door] = openings(s);
    const fit = fitterFor(s());
    // A mirror line across the wall at 10': a copy as far the other side, hinged the other way.
    const across = mirrorItems(s().doc, [door.id], { x: 10 * FT, y: -50 }, { x: 10 * FT, y: 50 }, false, fit);
    const copy = across.doc.elements.find((el) => el.id === across.ids[0]) as Opening;
    expect(copy.x).toBeCloseTo(20 * FT - door.x);
    expect(handOf(copy)).not.toBe(handOf(door));
    // Along the wall (flipping the original): it opens to the other side.
    const along = mirrorItems(s().doc, [door.id], { x: 0, y: 0 }, { x: 10, y: 0 }, true, fit);
    const flipped = along.doc.elements.find((el) => el.id === door.id) as Opening;
    expect(!!flipped.flipSide).not.toBe(!!door.flipSide);
  });
});

describe('editing several doors and windows', () => {
  it('changes them together, keeping a width that no longer fits', () => {
    const { s } = setup();
    s().placeOpening('door', { x: 5 * FT, y: -10 });
    s().placeOpening('door', { x: 15 * FT, y: -10 });
    const ids = openings(s).map((o) => o.id);
    s().editOpenings(ids, () => ({ doorKind: 'sliding' }));
    expect(openings(s).map((o) => o.doorKind)).toEqual(['sliding', 'sliding']);
    // 9' each: two can't fit in the 19'3" between the walls with their gaps.
    s().editOpenings(ids, () => ({ width: 9 * FT }));
    expect(openings(s).filter((o) => o.width === 9 * FT)).toHaveLength(1);
    expect(s().warnings.join(' ')).toMatch(/kept its width/);
  });
});
