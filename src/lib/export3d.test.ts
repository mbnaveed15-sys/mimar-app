import { describe, expect, it } from 'vitest';
import { buildModel, DEFAULT_WALL_HEIGHT_MM } from '../three/model';
import type { PlanDoc } from '../types';
import { modelMeshes, toDae, toGlb, toObj, type ExportMesh } from './export3d';
import { emptyDoc } from './storage';
import { crc32, zip } from './zip';

const doc: PlanDoc = {
  ...emptyDoc(),
  plinthMm: 0,
  elements: [
    { id: 'w', type: 'wall', x1: 0, y1: 0, x2: 500, y2: 300, thickness: 23, material: 'mat_brick' },
    {
      id: 's',
      type: 'slab',
      thickness: 15,
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 400, y: 300 },
        { x: 0, y: 300 },
      ],
    },
  ],
};
const meshes = modelMeshes(buildModel(doc, { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true }));

/** Volume from the triangles: positive when every face points outward. */
function volume(m: ExportMesh) {
  let v = 0;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => m.positions.slice(m.indices[i + k] * 3, m.indices[i + k] * 3 + 3));
    v +=
      (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) /
      6;
  }
  return v;
}

describe('3D export', () => {
  it('turns walls and slabs into closed meshes that face outward, named by material', () => {
    const wall = meshes.find((m) => m.name.startsWith('wall'))!;
    const slab = meshes.find((m) => m.name.startsWith('slab'))!;
    expect(wall.material.name).toBe('Brick');
    expect(wall.indices).toHaveLength(36); // 6 faces × 2 triangles
    expect(volume(wall)).toBeCloseTo(Math.hypot(5, 3) * 0.23 * 3.048, 2);
    expect(volume(slab)).toBeCloseTo(4 * 3 * 0.15, 4);
  });

  it('exports a wall side with its own material as its own mesh, still closed', () => {
    const sided: PlanDoc = {
      ...emptyDoc(),
      plinthMm: 0,
      elements: [{ id: 'w', type: 'wall', x1: 0, y1: 0, x2: 500, y2: 0, thickness: 23, materialA: 'mat_wood' }],
    };
    const out = modelMeshes(buildModel(sided, { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true }));
    const wood = out.find((m) => m.material.name === 'Wood')!;
    expect(wood.indices).toHaveLength(6); // one face
    expect(wood.normals.slice(0, 3)).toEqual([0, 0, 1]); // side A of a wall along x faces +z (plan +y)
    expect(out.reduce((v, m) => v + volume(m), 0)).toBeCloseTo(5 * 0.23 * 3.048, 3);
  });

  it('writes a valid binary glTF', () => {
    const glb = toGlb(meshes);
    const view = new DataView(glb.buffer);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(glb.length);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLength)));
    expect(json.meshes).toHaveLength(meshes.length);
    expect(json.materials.map((m: { name: string }) => m.name)).toContain('Brick');
    expect(json.buffers[0].byteLength).toBe(view.getUint32(20 + jsonLength, true));
    expect(glb.length % 4).toBe(0);
  });

  it('writes OBJ with its materials, and COLLADA for SketchUp', () => {
    const { obj, mtl } = toObj(meshes, 'house.mtl');
    const faces = obj.split('\n').filter((l) => l.startsWith('f ')).length;
    expect(faces).toBe(meshes.reduce((n, m) => n + m.indices.length / 3, 0));
    expect(obj).toContain('mtllib house.mtl');
    expect(mtl).toContain('newmtl Brick');
    const dae = toDae(meshes, 'House & garden');
    expect(dae.match(/<geometry /g)).toHaveLength(meshes.length);
    expect(dae).toContain('<up_axis>Y_UP</up_axis>');
    expect(dae).toContain('House &amp; garden');
  });

  it('exports the ground, the neighbours and the roads', () => {
    const site: PlanDoc = {
      ...emptyDoc(),
      ground: { grade: 'natural' },
      elements: [
        {
          id: 'p',
          type: 'plot',
          front: 0,
          setbacks: { front: 0, rear: 0, sides: 0 },
          points: [
            { x: 0, y: 0 },
            { x: 1000, y: 0 },
            { x: 1000, y: 1000 },
            { x: 0, y: 1000 },
          ],
        },
        { id: 'l1', type: 'level', x: -200, y: 0, zMm: 0 },
        { id: 'l2', type: 'level', x: 1200, y: 0, zMm: 1400 },
        { id: 'l3', type: 'level', x: 500, y: 1200, zMm: 700 },
        {
          id: 'nb',
          type: 'context',
          kind: 'building',
          points: [
            { x: 1200, y: 0 },
            { x: 1400, y: 0 },
            { x: 1400, y: 300 },
          ],
        },
        {
          id: 'rd',
          type: 'context',
          kind: 'road',
          points: [
            { x: 0, y: -400 },
            { x: 1000, y: -400 },
          ],
        },
      ],
    };
    const out = modelMeshes(buildModel(site, { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true }));
    const names = out.map((m) => m.name);
    for (const kind of ['ground_lawn', 'ground_natural', 'road', 'context'])
      expect(names.some((n) => n.startsWith(kind))).toBe(true);
    const lawn = out.find((m) => m.name.startsWith('ground_lawn'))!;
    expect(lawn.normals).toHaveLength(lawn.positions.length);
    // The ground faces up.
    for (let i = 1; i < lawn.normals.length; i += 3) expect(lawn.normals[i]).toBeGreaterThan(0.9);
    expect(volume(out.find((m) => m.name.startsWith('context'))!)).toBeGreaterThan(0);
  });
});

describe('zip', () => {
  it('computes the standard checksum and lays out a stored archive', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const z = zip([
      { name: 'a.txt', data: 'hello' },
      { name: 'b.txt', data: 'world!' },
    ]);
    const view = new DataView(z.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = z.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(new TextDecoder().decode(z.slice(30 + 5, 30 + 5 + 5))).toBe('hello');
  });
});
