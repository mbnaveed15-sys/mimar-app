import { describe, expect, it } from 'vitest';
import { buildModel, DEFAULT_WALL_HEIGHT_MM } from '../three/model';
import type { Opening, PlanDoc, Wall } from '../types';
import { mullionStops, transomMm, TRANSOM_MM } from './curtain';
import { estimate, STARTER_RATES, STARTER_RATIOS } from './estimate';
import { quantities } from './quantities';
import { emptyDoc } from './storage';

const FT = 30.48;
// A 20' glass wall, 4" thick.
const glass: Wall = { id: 'g', type: 'wall', x1: 0, y1: 0, x2: 20 * FT, y2: 0, thickness: 10.16, kind: 'curtain' };
const door: Opening = { id: 'd', type: 'door', wallId: 'g', x: 10 * FT, y: 0, width: 3 * FT, angle: 0 };
const docWith = (...elements: PlanDoc['elements']): PlanDoc => ({ ...emptyDoc(), plinthMm: 0, elements });

describe('glass curtain walls', () => {
  it('space their mullions evenly, no more than 4 feet apart, with a transom at door height', () => {
    expect(mullionStops(glass, false)).toHaveLength(6);
    expect(mullionStops({ ...glass, mullionMm: 1000 }, false)).toHaveLength(8);
    // Metric: 1.2 m, so 6.096 m takes six panes.
    expect(mullionStops(glass, true)).toHaveLength(7);
    expect(transomMm(glass, 3048)).toBe(TRANSOM_MM);
    expect(transomMm({ ...glass, transomMm: 0 }, 3048)).toBeNull();
    expect(transomMm({ ...glass, transomMm: 3048 }, 3048)).toBeNull();
    // A curved one: flat panes between mullions round the curve.
    expect(mullionStops({ ...glass, bow: 5 * FT }, false).length).toBeGreaterThan(6);
  });

  it('are built as glass panes in a frame, the glass starting at the head of a door in it', () => {
    const plain = buildModel(docWith(glass), { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true });
    const panes = plain.solids.filter((s) => s.role === 'glass');
    // Five panes, each split at the transom.
    expect(panes).toHaveLength(10);
    expect(panes.every((p) => p.id === 'g' && (p.opacity ?? 1) < 1)).toBe(true);
    // Six mullions, and a foot rail, head rail and transom for each pane.
    expect(plain.solids.filter((s) => s.role === 'wall')).toHaveLength(6 + 5 * 3);
    const withDoor = buildModel(docWith(glass, door), { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true });
    const low = withDoor.solids.filter((s) => s.role === 'glass' && s.y0 < 1);
    // Beside the door the glass comes down to the foot rail; over it, none below the head.
    expect(low.every((s) => Math.abs(s.x - 10 * FT * 0.01) > 0.3)).toBe(true);
    expect(withDoor.solids.some((s) => s.role === 'door')).toBe(true);
  });

  it('are costed as glazing, less their doors, not as brickwork or plaster', () => {
    const q = quantities(docWith(glass, door), 3048).floors[0];
    expect(q.glazingSqft).toBeCloseTo(20 * 10 - 3 * 7, 0);
    expect(q.brickworkCft).toBe(0);
    expect(q.insideFaceSqft + q.outsideFaceSqft).toBe(0);
    const lines = estimate(q, STARTER_RATES, STARTER_RATIOS).lines;
    expect(lines.find((l) => l.id === 'glazing')).toMatchObject({ unit: 'sqft', rateKey: 'glazing' });
  });
});
