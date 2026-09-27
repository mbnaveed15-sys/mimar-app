import { describe, expect, it } from 'vitest';
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, FURNITURE_KINDS } from '../furniture/catalog';
import { buildModel, DEFAULT_WALL_HEIGHT_MM } from '../three/model';
import type { DoorKind, Opening, PlanDoc, PlanElement, WindowKind } from '../types';
import { DOOR_KINDS, doorKindOf, openingSymbol, WINDOW_KINDS } from './openingKinds';
import { emptyDoc, normaliseDoc } from './storage';

const wall: PlanElement = { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 1000, y2: 0, thickness: 23 };
const door = (doorKind?: DoorKind): Opening => ({
  id: 'd',
  type: 'door',
  wallId: 'w',
  x: 500,
  y: 0,
  angle: 0,
  width: 150,
  ...(doorKind && { doorKind }),
});
const win = (windowKind?: WindowKind): Opening => ({
  id: 'o',
  type: 'window',
  wallId: 'w',
  x: 500,
  y: 0,
  angle: 0,
  width: 120,
  ...(windowKind && { windowKind }),
});
const docWith = (...elements: PlanElement[]): PlanDoc => ({ ...emptyDoc(), plinthMm: 0, elements });
const opts = { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true };

describe('door and window types', () => {
  it('draws a symbol for every type, within the opening', () => {
    for (const k of DOOR_KINDS) {
      const paths = openingSymbol(door(k), 11.5);
      expect(paths.length, k).toBeGreaterThan(0);
      for (const p of paths) for (const [x] of p.points) expect(Math.abs(x)).toBeLessThanOrEqual(75.001);
    }
    for (const k of WINDOW_KINDS) expect(openingSymbol(win(k), 11.5).length, k).toBeGreaterThan(0);
    // A doorway and a ventilator are dashed; a sliding door has two panels.
    expect(openingSymbol(door('opening'), 11.5).every((p) => p.stroke === 'hidden')).toBe(true);
    expect(openingSymbol(win('vent'), 11.5).every((p) => p.stroke === 'hidden')).toBe(true);
    expect(openingSymbol(door('sliding'), 11.5).filter((p) => p.closed)).toHaveLength(2);
    // Old doors are single, and a gate is a double.
    expect(doorKindOf(door())).toBe('single');
    expect(doorKindOf({ ...door(), gate: true })).toBe('double');
  });

  it('builds each door type in 3D', () => {
    const count = (k: DoorKind) =>
      buildModel(docWith(wall, door(k)), opts).solids.filter((s) => s.role === 'door').length;
    expect(count('single')).toBe(1);
    expect(count('double')).toBe(2);
    expect(count('sliding')).toBe(2);
    expect(count('folding')).toBe(4); // a 5' folding door has four panels
    expect(count('shutter')).toBe(2); // the shutter and its box
    expect(count('opening')).toBe(0);
  });

  it('builds sliding windows as two panes and a meeting rail, a fixed window as one pane', () => {
    const glass = (k: WindowKind) => buildModel(docWith(wall, win(k)), opts).solids.filter((s) => s.role === 'glass');
    expect(glass('sliding')).toHaveLength(2);
    expect(glass('casement2')).toHaveLength(2);
    expect(glass('fixed')).toHaveLength(1);
    expect(buildModel(docWith(wall, win('sliding')), opts).solids.filter((s) => s.color === '#6b7078')).toHaveLength(1);
  });

  it('keeps door and window types in saved plans, and drops unknown ones', () => {
    const raw = {
      ...emptyDoc(),
      elements: [
        wall,
        { ...door(), doorKind: 'sliding' },
        { ...win(), windowKind: 'vent' },
        { ...door(), id: 'x', doorKind: 'trapdoor' },
      ],
    };
    const doc = normaliseDoc(JSON.parse(JSON.stringify(raw)));
    const [, d, o, x] = doc.elements as Opening[];
    expect(d.doorKind).toBe('sliding');
    expect(o.windowKind).toBe('vent');
    expect(x.doorKind).toBeUndefined();
  });
});

describe('plants and garden items', () => {
  it('are in the library under Plants and Garden, and have 3D forms', () => {
    expect(FURNITURE_CATEGORIES).toEqual(expect.arrayContaining(['Plants', 'Garden']));
    const garden = FURNITURE_KINDS.filter((k) => ['Plants', 'Garden'].includes(FURNITURE_CATALOG[k].category));
    expect(garden).toHaveLength(12);
    for (const kind of garden) {
      const { w, d } = FURNITURE_CATALOG[kind];
      const item: PlanElement = { id: 'f', type: 'furniture', kind, x: 0, y: 0, w: w / 10, h: d / 10 };
      const solids = buildModel(docWith(item), opts).solids;
      // Each is its own shape, not the plain grey box of an unknown item.
      expect(
        solids.some((s) => s.color !== '#cbd5e1'),
        kind,
      ).toBe(true);
    }
  });
});
