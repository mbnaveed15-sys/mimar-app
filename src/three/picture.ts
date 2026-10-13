/**
 * A coloured 3D picture of the building for drawing sheets: the model with its materials, from the front-left
 * corner, on white paper. Rendered off screen; only loaded when a sheet with a 3D picture is shown or printed.
 */
import * as THREE from 'three';
import { shadowsOn, sunDirection } from '../lib/sun';
import type { PlanDoc, SavedCamera } from '../types';
import { frontLook } from '../lib/drawings/views';
import { rightOf } from '../lib/drawings/hiddenLines';
import { mergeParts } from './merge';
import { buildMeshes, disposeGroup } from './meshes';
import { buildModel } from './model';

let renderer: THREE.WebGLRenderer | null = null;
let failed = false;

function rendererFor(): THREE.WebGLRenderer | null {
  if (renderer || failed) return renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  } catch {
    failed = true;
  }
  return renderer;
}

/** How far down the camera looks, and its lens (vertical field of view), degrees. */
const DOWN_DEG = 24;
const FOV_DEG = 30;
/** The 3D view's own lens, for saved views (as in Plan3DView). */
const VIEW_FOV_DEG = 45;

/**
 * The picture as a PNG data URL, `width` × `height` pixels, or null when this computer can't draw 3D (or there
 * is nothing to draw).
 */
export function renderPicture(
  doc: PlanDoc,
  opts: { wallHeightMm: number; showFurniture: boolean },
  width: number,
  height: number,
  /** A saved view's camera; from the front-left corner when missing. */
  saved?: SavedCamera,
): string | null {
  const r = rendererFor();
  if (!r || width < 2 || height < 2) return null;
  const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: opts.showFurniture });
  const group = mergeParts(buildMeshes(model));
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) {
    disposeGroup(group);
    return null;
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ffffff');
  scene.add(new THREE.HemisphereLight('#ffffff', '#d6d3d1', 2.4));
  scene.add(new THREE.AmbientLight('#ffffff', 0.9));
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.z, size.y, 1);
  const sun = new THREE.DirectionalLight('#fff7ed', 1.8);
  sun.castShadow = shadowsOn(doc);
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  const toSun = sunDirection(doc).dir;
  const far = Math.hypot(span * 0.6, span * 1.4 + 6, span * 0.9);
  sun.position.set(centre.x + toSun[0] * far, centre.y + toSun[1] * far, centre.z + toSun[2] * far);
  sun.target.position.copy(centre);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -span;
  cam.right = cam.top = span;
  cam.far = span * 6 + 20;
  scene.add(sun, sun.target);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(span * 6, span * 6).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 1 }),
  );
  ground.position.set(centre.x, (model.groundY ?? 0) - 0.01, centre.z);
  ground.receiveShadow = true;
  scene.add(ground, group);

  if (saved) {
    // A saved view: the camera where it was saved, its lens as the 3D view's.
    const [tx, ty, tz] = saved.target;
    const flat = Math.cos(saved.elevation) * saved.distance;
    const eye = new THREE.Vector3(
      tx + flat * Math.sin(saved.azimuth),
      ty + Math.sin(saved.elevation) * saved.distance,
      tz + flat * Math.cos(saved.azimuth),
    );
    const target = new THREE.Vector3(tx, ty, tz);
    let view: THREE.Camera;
    if (saved.parallel) {
      // The parallel camera frames what the perspective one would show at the target.
      const half = Math.tan((VIEW_FOV_DEG * Math.PI) / 360) * saved.distance;
      const aspect = width / height;
      view = new THREE.OrthographicCamera(
        -half * aspect,
        half * aspect,
        half,
        -half,
        0.05,
        span * 20 + 100 + saved.distance,
      );
    } else view = new THREE.PerspectiveCamera(VIEW_FOV_DEG, width / height, 0.05, span * 20 + 100 + saved.distance);
    view.position.copy(eye);
    view.lookAt(target);
    if (view instanceof THREE.OrthographicCamera || view instanceof THREE.PerspectiveCamera)
      view.updateProjectionMatrix();
    r.setSize(width, height, false);
    r.render(scene, view);
    const url = r.domElement.toDataURL('image/png');
    disposeGroup(scene);
    r.renderLists.dispose();
    return url;
  }

  // From the front-left corner, looking down a little, far enough back for the whole building to fit.
  const f = frontLook(doc);
  const rt = rightOf(f);
  const flat = new THREE.Vector3(f.x + rt.x, 0, f.z + rt.z).normalize();
  const down = (DOWN_DEG * Math.PI) / 180;
  const dir = new THREE.Vector3(flat.x * Math.cos(down), -Math.sin(down), flat.z * Math.cos(down));
  const camera = new THREE.PerspectiveCamera(FOV_DEG, width / height, 0.05, span * 20 + 100);
  // Back far enough that every corner of the building's box is in the picture.
  const tanV = Math.tan((FOV_DEG * Math.PI) / 360);
  const tanH = tanV * (width / height);
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();
  let distance = 1;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const o = new THREE.Vector3(x, y, z).sub(centre);
        const [ox, oy, oz] = [o.dot(right), o.dot(up), o.dot(dir)];
        distance = Math.max(distance, Math.abs(ox) / tanH - oz, Math.abs(oy) / tanV - oz);
      }
  camera.position.copy(centre).addScaledVector(dir, -distance * 1.04);
  camera.lookAt(centre);

  r.setSize(width, height, false);
  r.render(scene, camera);
  const url = r.domElement.toDataURL('image/png');
  disposeGroup(scene);
  r.renderLists.dispose();
  return url;
}
