import { describe, expect, it } from 'vitest';
import { emptyDoc } from '../lib/storage';
import { createPlannerStore } from '../store/plannerStore';
import { buildModel } from './model';

const ft = (f: number) => (f * 304.8) / 10;
const P = (x: number, y: number) => ({ x: ft(x), y: ft(y) });

describe('outside the house on the ground floor (1.51.10)', () => {
  it('a car porch stands on the ground, not up on the plinth', () => {
    const store = createPlannerStore(emptyDoc());
    const s = () => store.getState();
    s().addRectangle(P(0, 0), P(20, 30));
    s().setSite({ rectPorch: true });
    s().addRectangle(P(22, 0), P(34, 18));
    const doc = s().doc;
    const model = buildModel(doc, { wallHeightMm: s().wallHeightMm, showFurniture: true });
    const cols = new Set(doc.elements.filter((e) => e.type === 'column').map((e) => e.id));
    expect(cols.size).toBeGreaterThan(0);
    const parts = [...model.solids, ...model.blocks].filter((p) => p.id && cols.has(p.id));
    expect(parts.length).toBeGreaterThan(0);
    for (const p of parts) expect('y0' in p ? p.y0 : 1).toBeCloseTo(0, 3);
    const porch = doc.rooms.find((r) => /porch/i.test(r.name))!;
    expect(model.floors.find((f) => f.id === porch.id)!.y).toBeLessThan(0.05);
  });
});
