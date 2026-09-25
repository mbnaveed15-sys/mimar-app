import { describe, expect, it } from 'vitest';
import { planToDxf } from '../lib/exportDxf';
import { modelMeshes, toDae, toGlb, toObj } from '../lib/export3d';
import { DEFAULT_PREFS } from '../lib/prefs';
import { emptyDoc, normaliseDoc } from '../lib/storage';
import { buildModel } from '../three/model';
import type { PlanDoc, PlanElement } from '../types';
import { createPlannerStore } from './plannerStore';

/** One of every kind of item, so no feature can forget one. */
const ELEMENTS: PlanElement[] = [
  { id: 'w1', type: 'wall', x1: 0, y1: 0, x2: 500, y2: 0, thickness: 23 },
  { id: 'w2', type: 'wall', x1: 500, y1: 0, x2: 500, y2: 400, thickness: 23, kind: 'boundary', heightMm: 2133.6 },
  { id: 'd', type: 'door', wallId: 'w1', x: 200, y: 0, width: 91, angle: 0 },
  { id: 'g', type: 'door', wallId: 'w2', x: 500, y: 200, width: 300, angle: 90, gate: true },
  { id: 'win', type: 'window', wallId: 'w1', x: 400, y: 0, width: 120, angle: 0 },
  { id: 'f', type: 'furniture', kind: 'sofa-3', x: 250, y: 200, w: 210, h: 90, rotation: 15 },
  { id: 'c', type: 'column', x: 0, y: 0, w: 23, h: 30, shape: 'rect' },
  { id: 'c2', type: 'column', x: 500, y: 400, w: 30, h: 30, shape: 'round' },
  { id: 'b', type: 'beam', x1: 0, y1: 0, x2: 500, y2: 0, width: 23, depth: 46 },
  {
    id: 's',
    type: 'slab',
    thickness: 15,
    points: [
      { x: 0, y: 0 },
      { x: 500, y: 0 },
      { x: 500, y: 400 },
      { x: 0, y: 400 },
    ],
  },
  {
    id: 'p',
    type: 'plot',
    front: 2,
    setbacks: { front: 1524, rear: 609.6, sides: 0 },
    points: [
      { x: -100, y: -100 },
      { x: 700, y: -100 },
      { x: 700, y: 700 },
      { x: -100, y: 700 },
    ],
  },
  {
    id: 'st',
    type: 'stair',
    x: 100,
    y: 300,
    shape: 'L',
    width: 91.44,
    riseMm: 3200,
    riserMm: 3200 / 18,
    treadMm: 254,
    w: 294.64,
    h: 294.64,
  },
];

const doc = (): PlanDoc => ({
  ...emptyDoc(),
  elements: ELEMENTS,
  rooms: [
    {
      id: 'r',
      name: 'Lounge',
      points: [
        { x: 12, y: 12 },
        { x: 488, y: 12 },
        { x: 488, y: 388 },
        { x: 12, y: 388 },
      ],
    },
  ],
});

describe('every kind of item', () => {
  it('survives saving, and every editing action on a mixed selection', () => {
    expect(normaliseDoc(JSON.parse(JSON.stringify(doc()))).elements).toHaveLength(ELEMENTS.length);
    const store = createPlannerStore(doc(), undefined, DEFAULT_PREFS);
    const s = () => store.getState();
    s().selectAll();
    expect(s().selectedIds.length).toBeGreaterThanOrEqual(ELEMENTS.length);
    s().rotateSelected(90);
    s().nudgeSelected(10, 10);
    s().duplicateSelected();
    s().copySelected();
    s().paste();
    s().groupSelected();
    s().undo();
    s().undo();
    s().deleteSelected();
    s().undo();
    expect(s().doc.elements.length).toBeGreaterThanOrEqual(ELEMENTS.length);
  });

  it('builds in 3D and exports to every format', () => {
    const model = buildModel(doc(), { wallHeightMm: 3048, showFurniture: true });
    const meshes = modelMeshes(model);
    expect(meshes.length).toBeGreaterThan(5);
    expect(toGlb(meshes).length).toBeGreaterThan(100);
    expect(toDae(meshes, 'x')).toContain('<COLLADA');
    expect(toObj(meshes, 'x.mtl').obj).toContain('f ');
    const dxf = planToDxf(doc(), {
      units: 'imperial',
      marlaSqFt: 225,
      showDimensions: true,
      showFurniture: true,
      showRoomLabels: true,
    });
    for (const layer of ['A-WALL', 'A-DOOR', 'A-GLAZ', 'A-FURN', 'S-COLS', 'S-BEAM', 'S-SLAB', 'C-PROP', 'A-FLOR-STRS'])
      expect(dxf).toContain(`\r\n8\r\n${layer}\r\n`);
  });
});
