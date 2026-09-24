import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID } from './prefs';
import { planSvgMarkup } from './planImage';
import { emptyDoc } from './storage';

describe('plan image', () => {
  it('uses the print colours, whatever the theme', async () => {
    const doc = { ...emptyDoc(), elements: [{ id: 'w', type: 'wall' as const, x1: 0, y1: 0, x2: 100, y2: 0 }] };
    const content = {
      doc,
      units: 'imperial' as const,
      marlaSqFt: 225 as const,
      showDimensions: true,
      showFurniture: true,
      showRoomLabels: true,
      showRoomFills: true,
    };
    const area = { minX: -50, minY: -50, maxX: 150, maxY: 50 };
    const svg = await planSvgMarkup(content, area, 400, 200, { grid: { step: 30, look: DEFAULT_GRID }, k: 1 });
    expect(svg).toContain('--plan-wall:#D9D6D0');
    expect(svg).toContain('--plan-paper:#FFFFFF');
    expect(svg).toContain('var(--plan-wall-edge)');
    expect(svg).toContain('export-0');
  });
});
