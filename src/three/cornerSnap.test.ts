import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { snapPoints } from '../lib/snapPoints';
import { emptyDoc } from '../lib/storage';
import type { Column, Furniture, PlanElement, Wall } from '../types';
import { cornerNear, curveTest } from './cornerSnap';
import { buildModel, DEFAULT_WALL_HEIGHT_MM } from './model';

const rect = { left: 0, top: 0, width: 1200, height: 800 };

const camera = (eye: [number, number, number]) => {
  const cam = new THREE.PerspectiveCamera(50, 1.5, 0.1, 1000);
  cam.position.set(...eye);
  cam.lookAt(10, 1.5, 0);
  cam.updateMatrixWorld();
  return cam;
};

const box = (w: number, h: number, d: number, at: [number, number, number]) => {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(...at);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.updateMatrixWorld();
  return mesh;
};

const screenOf = (p: THREE.Vector3, cam: THREE.Camera) => {
  const v = p.clone().project(cam);
  return { x: ((v.x + 1) / 2) * 1200, y: ((1 - v.y) / 2) * 800 };
};

const hitAt = (x: number, y: number, cam: THREE.Camera, meshes: THREE.Object3D[]) => {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2((x / 1200) * 2 - 1, -(y / 800) * 2 + 1), cam);
  return ray.intersectObjects(meshes, false)[0];
};

// A 20 m wall, 3 m high and 0.23 m thick, along x; its far top corner.
const wall = box(20, 3, 0.23, [10, 1.5, 0]);
const corner = new THREE.Vector3(20, 3, 0.115);

/** The pointer a few pixels from the corner, back along the wall's top edge and onto its face. */
function pointerNear(cam: THREE.Camera, px: number) {
  const c = screenOf(corner, cam);
  const back = screenOf(new THREE.Vector3(19, 3, 0.115), cam);
  const len = Math.hypot(back.x - c.x, back.y - c.y);
  return { x: c.x + ((back.x - c.x) / len) * px, y: c.y + ((back.y - c.y) / len) * px + 2 };
}

describe('3D corner snapping (1.43.2)', () => {
  it('takes the far corner of a long wall seen along its length', () => {
    const cam = camera([-2, 2.2, 1.5]);
    for (const px of [3, 6]) {
      const p = pointerNear(cam, px);
      const hit = hitAt(p.x, p.y, cam, [wall]);
      expect(hit).toBeTruthy();
      const got = cornerNear(hit, cam, rect, p.x, p.y, 10, { occluders: [wall] });
      expect(got?.distanceTo(corner)).toBeLessThan(1e-3);
    }
  });

  it('leaves a corner hidden behind something else', () => {
    const cam = camera([10, 4, 15]);
    const p = pointerNear(cam, 3);
    const hit = hitAt(p.x, p.y, cam, [wall]);
    // A post standing between the eye and the corner.
    const c = screenOf(corner, cam);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((c.x / 1200) * 2 - 1, -(c.y / 800) * 2 + 1), cam);
    const between = ray.ray.at(cam.position.distanceTo(corner) / 2, new THREE.Vector3());
    const post = box(0.6, 0.6, 0.6, [between.x, between.y, between.z]);
    const got = cornerNear(hit, cam, rect, p.x, p.y, 10, { occluders: [wall, post] });
    expect(got?.distanceTo(corner) ?? Infinity).toBeGreaterThan(1e-3);
  });

  it('skips points along curves, but keeps a curved wall’s ends and its door jambs', () => {
    // A half circle of radius 300 (3 m) from (-300, 0) to (300, 0).
    const arc: Wall = { id: 'a', type: 'wall', x1: -300, y1: 0, x2: 300, y2: 0, bow: 300, thickness: 23 };
    const column: Column = { id: 'c', type: 'column', x: 1000, y: 0, w: 40, h: 40, shape: 'round' };
    const test = curveTest([arc, column]);
    // The arc's middle is on one side of the chord or the other.
    const apex = [
      { x: 0, y: 300 },
      { x: 0, y: -300 },
    ].find((p) => test(p));
    expect(apex).toBeTruthy();
    expect(test({ x: 300 * Math.cos(Math.PI / 4), y: Math.sign(apex!.y) * 300 * Math.sin(Math.PI / 4) })).toBe(true);
    expect(test({ x: -300, y: 0 })).toBe(false);
    expect(test({ x: 300, y: 0 })).toBe(false);
    expect(test({ x: 1020, y: 0 })).toBe(true);
    expect(test({ x: 1000, y: 0 })).toBe(false);
    expect(test({ x: 500, y: 500 })).toBe(false);
    // A door at the middle of the curve: its jambs are corners.
    const door: PlanElement = { id: 'd', type: 'door', wallId: 'a', x: 0, y: apex!.y, angle: 0, width: 90 };
    const jambs = snapPoints([arc, door])
      .filter((p) => p.kind === 'item-corner')
      .map((p) => p.point);
    expect(jambs.length).toBe(4);
    expect(jambs.some((j) => test(j))).toBe(true);
    const withDoor = curveTest([arc, door, column]);
    expect(jambs.some((j) => withDoor(j))).toBe(false);
  });
});

describe('round things in 3D (1.43.2)', () => {
  const opts = { wallHeightMm: DEFAULT_WALL_HEIGHT_MM, showFurniture: true };
  const docWith = (...elements: PlanElement[]) => ({ ...emptyDoc(), plinthMm: 0, elements });

  it('builds a round column as a cylinder, not a box', () => {
    const column: Column = { id: 'c', type: 'column', x: 0, y: 0, w: 40, h: 40, shape: 'round' };
    const model = buildModel(docWith(column), opts);
    expect(model.solids.filter((s) => s.id === 'c')).toHaveLength(0);
    const round = model.blocks.filter((b) => b.id === 'c');
    expect(round).toHaveLength(1);
    expect(round[0].role).toBe('column');
    // 32 sides, all 0.2 m from the centre.
    expect(round[0].points.length).toBe(32);
    for (const [x, z] of round[0].points) expect(Math.hypot(x, z)).toBeCloseTo(0.2);
  });

  it('builds a library item’s round parts as cylinders', () => {
    const bin: Furniture = { id: 'b', type: 'furniture', kind: 'dustbin', x: 100, y: 100, w: 40, h: 40 };
    const model = buildModel(docWith(bin), opts);
    const round = model.blocks.filter((b) => b.id === 'b');
    expect(round).toHaveLength(1);
    expect(round[0].role).toBe('furniture');
    for (const [x, z] of round[0].points) expect(Math.hypot(x - 1, z - 1)).toBeCloseTo(0.2);
    // Its square stand-in is gone.
    expect(model.solids.filter((s) => s.id === 'b')).toHaveLength(0);
  });
});
