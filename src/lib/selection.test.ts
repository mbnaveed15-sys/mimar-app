import { describe, expect, it } from 'vitest';
import type { Furniture, Opening, PlanDoc, Wall } from '../types';
import {
  copyItems,
  deleteItems,
  expandToGroups,
  groupItems,
  itemsInBox,
  makeComponent,
  moveItems,
  placeComponent,
  raiseItems,
  rotateItems,
  syncComponent,
  ungroup,
} from './selection';
import { emptyDoc, normaliseDoc } from './storage';

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): Wall => ({
  id,
  type: 'wall',
  x1,
  y1,
  x2,
  y2,
});
const door: Opening = { id: 'd', type: 'door', wallId: 'a', x: 50, y: 0, angle: 0, width: 30 };
const bed: Furniture = { id: 'f', type: 'furniture', x: 200, y: 200, w: 40, h: 60 };
const doc = (): PlanDoc => ({
  ...emptyDoc(),
  elements: [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100), door, bed],
});

describe('box selection', () => {
  it('left to right takes items fully inside; right to left takes anything touched', () => {
    const d = doc();
    const box = { minX: -40, minY: -40, maxX: 90, maxY: 40 };
    expect(itemsInBox(d.elements, box, false)).toEqual(['d']);
    expect(itemsInBox(d.elements, box, true)).toEqual(['a', 'd']);
    expect(itemsInBox(d.elements, { ...box, maxX: 105 }, true)).toEqual(['a', 'b', 'd']);
  });
});

describe('moving, copying and deleting several items', () => {
  it('moves walls with their doors', () => {
    const d = moveItems(doc(), ['a'], 10, 5);
    expect(d.elements.find((e) => e.id === 'a')).toMatchObject({ x1: 10, y1: 5 });
    expect(d.elements.find((e) => e.id === 'd')).toMatchObject({ x: 60, y: 5 });
  });

  it('copies walls with their doors, and deleting a wall removes its door', () => {
    const { doc: d, ids } = copyItems(doc(), ['a', 'f'], 0, 300);
    expect(ids).toHaveLength(3);
    const copyDoor = d.elements.find((e) => e.type === 'door' && e.id !== 'd') as Opening;
    expect(ids).toContain(copyDoor.wallId);
    expect(deleteItems(d, ['a']).elements.map((e) => e.id)).not.toContain('d');
  });

  it('rotates about a centre', () => {
    const d = rotateItems(doc(), ['a'], { x: 0, y: 0 }, 90);
    const a = d.elements.find((e) => e.id === 'a') as Wall;
    expect(a.x2).toBeCloseTo(0);
    expect(a.y2).toBeCloseTo(100);
  });
});

describe('groups and components', () => {
  it('selecting one member selects the group, unless it is open', () => {
    const { doc: d, groupId } = groupItems(doc(), ['a', 'b'], 'Walls');
    expect(expandToGroups(d, ['a'], null).sort()).toEqual(['a', 'b', 'd']);
    expect(expandToGroups(d, ['a'], groupId)).toEqual(['a']);
    expect(ungroup(d, groupId).groups).toHaveLength(0);
  });

  it('editing one copy of a component updates the others, even when rotated', () => {
    const made = makeComponent({ ...emptyDoc(), elements: [bed] }, ['f'], 'Bed');
    const placed = placeComponent(made.doc, made.doc.components[0].id, { x: 500, y: 500 })!;
    // Turn the second copy, then widen the bed in the first copy and close it.
    let d = rotateItems(
      placed.doc,
      expandToGroups(placed.doc, [placed.doc.elements[1].id], null),
      { x: 500, y: 500 },
      90,
    );
    d = { ...d, elements: d.elements.map((e) => (e.id === 'f' ? { ...e, w: 80 } : e)) as PlanDoc['elements'] };
    d = syncComponent(d, made.groupId);
    const beds = d.elements.filter((e): e is Furniture => e.type === 'furniture');
    expect(beds).toHaveLength(2);
    expect(beds.map((b) => b.w)).toEqual([80, 80]);
    const other = beds.find((b) => b.id !== 'f')!;
    expect(other.x).toBeCloseTo(500);
    expect(other.rotation).toBeCloseTo(90);
  });

  it('copying a component copy keeps it linked', () => {
    const made = makeComponent(doc(), ['a', 'b'], 'Corner');
    const { doc: d } = copyItems(made.doc, expandToGroups(made.doc, ['a'], null), 0, 200);
    const copies = d.groups.filter((g) => g.componentId === made.doc.components[0].id);
    expect(copies).toHaveLength(2);
    expect(copies[1].y).toBeCloseTo(copies[0].y + 200);
  });

  it('groups and components survive saving and opening', () => {
    const made = makeComponent(doc(), ['a', 'b', 'f'], 'Corner');
    const reopened = normaliseDoc(JSON.parse(JSON.stringify(made.doc)));
    expect(reopened.groups).toEqual(made.doc.groups);
    expect(reopened.components).toEqual(made.doc.components);
    expect(reopened.elements.find((e) => e.id === 'f')).toMatchObject({ groupId: made.groupId, defKey: 'f' });
  });
});

describe('raising items', () => {
  const doc = (): PlanDoc => ({
    ...emptyDoc(),
    elements: [
      wall('w', 0, 0, 1000, 0),
      { id: 'n', type: 'window', wallId: 'w', x: 500, y: 0, angle: 0, width: 120 },
      { id: 'd', type: 'door', wallId: 'w', x: 200, y: 0, angle: 0, width: 90 },
    ],
  });

  it('raises and lowers items, and drops the height when it comes back to the floor', () => {
    const up = raiseItems(doc(), ['w'], 600);
    expect((up.elements[0] as Wall).elevMm).toBe(600);
    const down = raiseItems(up, ['w'], -600);
    expect((down.elements[0] as Wall).elevMm).toBeUndefined();
    expect((raiseItems(doc(), ['w'], -99999).elements[0] as Wall).elevMm).toBe(-5000);
  });

  it('moves a window sill instead, and leaves doors alone', () => {
    const out = raiseItems(doc(), ['n', 'd'], 300);
    expect((out.elements[1] as Opening).sillMm).toBe(914 + 300);
    expect(out.elements[2]).toEqual(doc().elements[2]);
    expect((raiseItems(doc(), ['n'], -2000).elements[1] as Opening).sillMm).toBe(0);
  });

  it('a wall split inside a component copy gets its own key, so the copies keep one id each', () => {
    const plan: PlanDoc = { ...emptyDoc(), elements: [wall('a', 0, 0, 100, 0), wall('b', 100, 0, 100, 100)] };
    const made = makeComponent(plan, ['a', 'b'], 'Corner');
    const placed = placeComponent(made.doc, made.doc.components[0].id, { x: 500, y: 500 })!;
    // Split wall "a" in the first copy: the new piece carries a's key, as Break does.
    const a = placed.doc.elements.find((e) => e.id === 'a')!;
    const piece = { ...a, id: 'a2' };
    let d = { ...placed.doc, elements: [...placed.doc.elements, piece] };
    d = syncComponent(d, made.groupId);
    const keys = d.components[0].elements.map((e) => e.id);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = d.elements.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
