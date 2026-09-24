import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normaliseDoc } from '../lib/storage';
import { FURNITURE_CATALOG, FURNITURE_CATEGORIES, FURNITURE_KINDS, isFurnitureKind } from './catalog';
import { FurnitureSymbol } from './FurnitureSymbol';

describe('furniture library', () => {
  it('has realistic sizes (between 300 mm and 5 m)', () => {
    for (const kind of FURNITURE_KINDS) {
      const { w, d } = FURNITURE_CATALOG[kind];
      expect(w, kind).toBeGreaterThanOrEqual(300);
      expect(d, kind).toBeLessThanOrEqual(5000);
    }
    expect(FURNITURE_CATEGORIES).toEqual(['Bedroom', 'Drawing & lounge', 'Dining', 'Kitchen', 'Bath', 'Other']);
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
    expect((svg.match(/<(rect|line|circle|ellipse)/g) ?? []).length).toBeGreaterThan(1);
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
