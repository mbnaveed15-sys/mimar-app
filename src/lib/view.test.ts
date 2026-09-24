import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, fitView, panBy, screenToPlan, zoomAt } from './view';

describe('view', () => {
  it('keeps the point under the cursor fixed when zooming', () => {
    const view = { x: 100, y: 50, zoom: 1 };
    const cursor = { x: 300, y: 200 };
    const before = screenToPlan(view, cursor);
    const after = screenToPlan(zoomAt(view, cursor, 2.5), cursor);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('limits zoom', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 10 }, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM);
  });

  it('pans in the drag direction', () => {
    expect(panBy({ x: 0, y: 0, zoom: 2 }, 100, -50)).toEqual({ x: -50, y: 25, zoom: 2 });
  });

  it('fits and centres the bounds', () => {
    const size = { width: 800, height: 600 };
    const view = fitView({ minX: 0, minY: 0, maxX: 1000, maxY: 500 }, size, 50);
    expect(view.zoom).toBeCloseTo(0.7);
    const centre = screenToPlan(view, { x: 400, y: 300 });
    expect(centre.x).toBeCloseTo(500);
    expect(centre.y).toBeCloseTo(250);
  });
});
