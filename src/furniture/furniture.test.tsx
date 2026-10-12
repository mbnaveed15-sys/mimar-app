import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normaliseDoc } from '../lib/storage';
import {
  categoriesOf,
  FURNITURE_CATALOG,
  FURNITURE_CATEGORIES,
  FURNITURE_GROUPS,
  FURNITURE_KINDS,
  groupForProject,
  isFurnitureKind,
} from './catalog';
import { SHAPES } from './shapes';
import { FurnitureSymbol } from './FurnitureSymbol';

describe('furniture library', () => {
  it('has realistic sizes (between 300 mm and 5 m)', () => {
    for (const kind of FURNITURE_KINDS) {
      const { w, d } = FURNITURE_CATALOG[kind];
      expect(w, kind).toBeGreaterThanOrEqual(300);
      expect(d, kind).toBeLessThanOrEqual(5000);
    }
    expect(FURNITURE_CATEGORIES.slice(0, 6)).toEqual([
      'Bedroom',
      'Drawing & lounge',
      'Dining',
      'Kitchen',
      'Bath',
      'Study & laundry',
    ]);
  });

  it('has items for every group, and opens on the project’s own group', () => {
    for (const g of FURNITURE_GROUPS)
      expect(
        FURNITURE_KINDS.some((k) => FURNITURE_CATALOG[k].group === g),
        g,
      ).toBe(true);
    expect(FURNITURE_KINDS.length).toBeGreaterThanOrEqual(90);
    expect(categoriesOf('Office')).toEqual(['Desks', 'Meeting', 'Reception & storage']);
    expect(groupForProject('house')).toBe('Home');
    expect(groupForProject('building', 'school')).toBe('School');
    expect(groupForProject('building', 'mosque')).toBe('Prayer');
  });

  it('gives the newer items a 3D shape and parts inside their footprint', () => {
    for (const [kind, parts] of Object.entries(SHAPES)) {
      expect(
        parts!.some((p) => !('line' in p) && p.z),
        kind,
      ).toBe(true);
      for (const p of parts!) {
        const [fx, fy, fw, fd] =
          'box' in p ? p.box : 'line' in p ? [p.line[0], p.line[1], 0, 0] : [p.disc[0], p.disc[1], 0, 0];
        expect(fx, kind).toBeGreaterThanOrEqual(-1e-9);
        expect(fy, kind).toBeGreaterThanOrEqual(-1e-9);
        expect(fx + fw, kind).toBeLessThanOrEqual(1 + 1e-9);
        expect(fy + fd, kind).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it.each(FURNITURE_KINDS)('draws a %s symbol', (kind) => {
    const { w, d } = FURNITURE_CATALOG[kind];
    const svg = renderToStaticMarkup(
      <svg>
        <FurnitureSymbol kind={kind} w={w / 10} h={d / 10} fill="#fff" stroke="#000" sw={1} />
      </svg>,
    );
    expect(svg).toContain(`data-symbol="${kind}"`);
    expect(svg).not.toContain('NaN');
    expect((svg.match(/<(rect|line|circle|ellipse|path)/g) ?? []).length).toBeGreaterThan(1);
  });

  it('keeps the furniture type when loading, and drops unknown types', () => {
    const doc = normaliseDoc({
      elements: [
        { id: 'a', type: 'furniture', kind: 'sofa-3', x: 0, y: 0, w: 210, h: 90 },
        { id: 'b', type: 'furniture', kind: 'spaceship', x: 0, y: 0, w: 10, h: 10 },
      ],
    });
    expect(doc.elements.map((e) => ('kind' in e ? e.kind : null))).toEqual(['sofa-3', undefined]);
    expect(isFurnitureKind('toString')).toBe(false);
  });
});
