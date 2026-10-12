/**
 * Snapping to a corner seen in 3D: the mesh vertex nearest the pointer on screen that can be seen
 * (nothing in the model in front of it) and is a real corner (not a join between the straight pieces
 * a curved wall, a round column or a round part is built from).
 */
import * as THREE from 'three';
import { SHAPES } from '../furniture/shapes';
import { fromFurnitureLocal } from '../geometry';
import { arcOf, arcParam } from '../lib/arc';
import { MM_PER_UNIT } from '../lib/scale';
import { snapPoints } from '../lib/snapPoints';
import type { PlanElement, Point } from '../types';
import { thicknessOf } from '../walls';

const M_PER_UNIT = MM_PER_UNIT / 1000;

/** Meshes with more corners than this are left to the plan's own snapping (too slow to search on every move). */
const MAX_CORNER_SEARCH = 150_000;

/** How many of the corners nearest the pointer are checked for being in sight. */
const MAX_SIGHT_TESTS = 6;

/** How close (plan units) a point must be to a circle, an arc or a kept corner to count as on it. */
const ON = 1.5;

/**
 * Whether a plan point lies along a curve: inside a curved wall's run (not at its ends), or on the
 * rim of a round column or a library item's round part. Real corners there (door and window jambs)
 * are kept.
 */
export function curveTest(elements: PlanElement[]): (p: Point) => boolean {
  const arcs: { arc: NonNullable<ReturnType<typeof arcOf>>; half: number; len: number }[] = [];
  const rims: { x: number; y: number; r: number }[] = [];
  for (const el of elements) {
    if (el.hidden) continue;
    if (el.type === 'wall') {
      const arc = arcOf(el);
      if (arc) arcs.push({ arc, half: thicknessOf(el) / 2, len: Math.abs(arc.sweep) * arc.r });
    } else if (el.type === 'column' && el.shape === 'round') rims.push({ x: el.x, y: el.y, r: el.w / 2 });
    else if (el.type === 'furniture' && el.kind) {
      const small = Math.min(el.w, el.h);
      for (const p of SHAPES[el.kind] ?? []) {
        if (!('disc' in p) || !p.z) continue;
        const [fx, fy, fr] = p.disc;
        const c = fromFurnitureLocal(el, { x: -el.w / 2 + fx * el.w, y: -el.h / 2 + fy * el.h });
        rims.push({ ...c, r: fr * small });
      }
    }
  }
  if (!arcs.length && !rims.length) return () => false;
  const kept = snapPoints(elements.filter((el) => el.type === 'door' || el.type === 'window' || el.type === 'wall'))
    .filter((s) => s.kind === 'item-corner')
    .map((s) => s.point);
  return (p) => {
    if (kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < ON)) return false;
    if (rims.some((c) => Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r) < ON)) return true;
    return arcs.some(({ arc, half, len }) => {
      if (Math.abs(Math.hypot(p.x - arc.cx, p.y - arc.cy) - arc.r) > half + ON) return false;
      const along = arcParam(arc, p) * len;
      return along > ON && along < len - ON;
    });
  };
}

export interface CornerOptions {
  /** What can hide a corner: the model's meshes. */
  occluders: THREE.Object3D[];
  /** Plan points (plan units) that are along a curve, not corners (see `curveTest`). */
  onCurve?: (p: Point) => boolean;
}

/** Whether nothing in `occluders` stands between the camera and a world point. */
function inSight(point: THREE.Vector3, camera: THREE.Camera, occluders: THREE.Object3D[]): boolean {
  const ray = new THREE.Raycaster();
  let origin: THREE.Vector3;
  let distance: number;
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    // A parallel view looks along one direction: come at the point from far back along it.
    const dir = camera.getWorldDirection(new THREE.Vector3());
    origin = point.clone().addScaledVector(dir, -1000);
    distance = 1000;
  } else {
    origin = camera.getWorldPosition(new THREE.Vector3());
    distance = origin.distanceTo(point);
  }
  ray.set(origin, point.clone().sub(origin).normalize());
  // Faces meeting at the corner itself are hit at about its own distance: only nearer ones hide it.
  const margin = Math.max(0.02, distance * 0.002);
  ray.far = distance - margin;
  return ray.intersectObjects(occluders, false).length === 0;
}

/**
 * The corner of the mesh under the pointer nearest a screen position, within `px` pixels, in world
 * space (null when none is that close). Lets any corner seen in 3D be picked exactly, at its own height.
 */
export function cornerNear(
  hit: THREE.Intersection,
  camera: THREE.Camera,
  rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
  px: number,
  opts: CornerOptions,
): THREE.Vector3 | null {
  const mesh = hit.object as THREE.Mesh;
  const pos = mesh.geometry?.getAttribute('position');
  if (!pos || pos.count > MAX_CORNER_SEARCH) return null;
  const world = new THREE.Vector3();
  const v = new THREE.Vector3();
  const near: { d: number; at: THREE.Vector3 }[] = [];
  mesh.updateMatrixWorld();
  for (let i = 0; i < pos.count; i++) {
    world.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    v.copy(world).project(camera);
    if (v.z > 1 || v.z < -1) continue;
    const dx = rect.left + ((v.x + 1) / 2) * rect.width - clientX;
    const dy = rect.top + ((1 - v.y) / 2) * rect.height - clientY;
    const d = dx * dx + dy * dy;
    if (d < px * px) near.push({ d, at: world.clone() });
  }
  near.sort((a, b) => a.d - b.d);
  let tested = 0;
  const seen: THREE.Vector3[] = [];
  for (const { at } of near) {
    // The same corner comes once for each face meeting there.
    if (seen.some((q) => q.distanceToSquared(at) < 1e-6)) continue;
    seen.push(at);
    if (opts.onCurve?.({ x: at.x / M_PER_UNIT, y: at.z / M_PER_UNIT })) continue;
    if (inSight(at, camera, opts.occluders)) return at;
    if (++tested >= MAX_SIGHT_TESTS) break;
  }
  return null;
}
