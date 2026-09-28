import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { lookRuns, mergeParts, partAt, type PartRange } from './merge';

const red = new THREE.MeshStandardMaterial({ color: 'red' });
const blue = new THREE.MeshStandardMaterial({ color: 'blue' });
const edge = new THREE.LineBasicMaterial();

/** A 1 m box at x, with an id, on a floor, and its edges. */
function box(group: THREE.Group, id: string, x: number, material: THREE.Material | THREE.Material[], level = 'ground') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
  mesh.position.set(x, 0.5, 0);
  mesh.userData = { id, level };
  group.add(mesh);
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edge);
  lines.position.copy(mesh.position);
  lines.userData = { level };
  group.add(lines);
}

const meshes = (g: THREE.Group) => g.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);

describe('merging the 3D parts', () => {
  it('draws parts that share a material and floor as one mesh, and their edges as one set', () => {
    const group = new THREE.Group();
    box(group, 'a', 0, red);
    box(group, 'b', 2, red);
    box(group, 'c', 4, blue);
    box(group, 'd', 6, red, 'first');
    const merged = mergeParts(group);
    const ms = meshes(merged);
    expect(ms).toHaveLength(3);
    const reds = ms.find((m) => m.material === red && m.userData.level === 'ground')!;
    expect((reds.userData.ranges as PartRange[]).map((r) => r.id)).toEqual(['a', 'b']);
    // Each box keeps its 12 triangles, moved to where it stood.
    expect(reds.geometry.getIndex()!.count).toBe(72);
    const b = (reds.userData.ranges as PartRange[])[1];
    expect(b.box[0]).toBeCloseTo(1.5);
    expect(b.box[3]).toBeCloseTo(2.5);
    const lines = merged.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.map((l) => l.userData.level).sort()).toEqual(['first', 'ground']);
  });

  it('splits a part with a material per side across the meshes of each material', () => {
    const group = new THREE.Group();
    box(group, 'w', 0, [red, red, red, red, blue, red]);
    const ms = meshes(mergeParts(group));
    expect(ms).toHaveLength(2);
    const blues = ms.find((m) => m.material === blue)!;
    expect(blues.geometry.getIndex()!.count).toBe(6);
    // The red faces, in two runs of the box's groups, still make one range.
    const reds = ms.find((m) => m.material === red)!;
    expect(reds.userData.ranges).toHaveLength(1);
  });

  it('finds the part under the pointer', () => {
    const group = new THREE.Group();
    box(group, 'a', 0, red);
    box(group, 'b', 2, red);
    const merged = mergeParts(group);
    merged.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 5, 0.2), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(merged.children, false).find((h) => h.object instanceof THREE.Mesh)!;
    expect(hit.point.y).toBeCloseTo(1);
    expect(partAt(hit.object.userData.ranges, hit.faceIndex!)?.id).toBe('b');
    const miss = new THREE.Raycaster(new THREE.Vector3(1, 5, 0), new THREE.Vector3(0, -1, 0));
    expect(miss.intersectObjects(merged.children, false).filter((h) => h.object instanceof THREE.Mesh)).toHaveLength(0);
  });

  it('draws selected parts in their own look, in as few runs as it can', () => {
    const ranges: PartRange[] = ['a', 'b', 'c', 'd'].map((id, i) => ({
      id,
      start: i * 36,
      count: 36,
      box: [0, 0, 0, 0, 0, 0],
    }));
    expect(lookRuns(ranges, () => 0)).toEqual([{ start: 0, count: 144, look: 0 }]);
    expect(lookRuns(ranges, (id) => (id === 'b' || id === 'c' ? 1 : 0))).toEqual([
      { start: 0, count: 36, look: 0 },
      { start: 36, count: 72, look: 1 },
      { start: 108, count: 36, look: 0 },
    ]);
  });
});
