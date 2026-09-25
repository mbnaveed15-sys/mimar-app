import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { downloadUrl } from '../lib/exportPng';
import { baseName } from '../lib/files';
import { formatLength } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import { themeColor } from '../theme/themes';
import { drawPattern } from '../lib/patterns';
import type { Pattern } from '../types';
import { buildModel, type Finish, type Model3D } from './model';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  model: THREE.Group;
  last: Model3D | null;
  fitted: boolean;
  render: () => void;
}

/** Point the camera at the building from above one corner, far enough back to see all of it. */
function fitCamera(stage: Stage, model: Model3D) {
  const { camera, controls } = stage;
  const target = new THREE.Vector3(model.centre.x, 1, model.centre.z);
  // Fit a sphere around the building into the narrower of the two viewing angles.
  const radius = model.size * 0.75 + 1.5;
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  const distance = radius / Math.sin(Math.min(vFov, hFov) / 2);
  const elevation = THREE.MathUtils.degToRad(42);
  const azimuth = THREE.MathUtils.degToRad(35);
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth),
  );
  controls.target.copy(target);
  controls.update();
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
        m.dispose();
      });
    }
  });
}

const TEXTURE_PX = 256;

/** A repeating texture of the pattern in the given colour, one repeat per metre of UV. */
function patternTexture(color: string, finish: Finish): THREE.Texture | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEXTURE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawPattern(ctx, TEXTURE_PX, { color, pattern: finish.pattern });
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / finish.spanM, 1 / finish.spanM);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Box UVs in metres (instead of 0–1 per face), so patterns keep their real size on every face. */
function metricUVs(geometry: THREE.BufferGeometry) {
  const pos = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
    if (ny > 0.5) uv.setXY(i, x, z);
    else if (nx > 0.5) uv.setXY(i, z, y);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

const ROUGHNESS: Partial<Record<Pattern, number>> = { marble: 0.35, granite: 0.4, metal: 0.4, glass: 0.1, tiles: 0.5 };

function buildMeshes(model: Model3D): THREE.Group {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  const material = (color: string, opacity = 1, finish?: Finish) => {
    const key = `${color}/${opacity}/${finish?.pattern}/${finish?.spanM}`;
    let mat = materials.get(key);
    if (!mat) {
      const map = finish ? patternTexture(color, finish) : null;
      mat = new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : color,
        map,
        roughness: (finish && ROUGHNESS[finish.pattern]) ?? 0.85,
        metalness: finish?.pattern === 'metal' ? 0.5 : 0,
        transparent: opacity < 1,
        opacity,
        side: THREE.DoubleSide,
      });
      materials.set(key, mat);
    }
    return mat;
  };
  const edgeMaterial = new THREE.LineBasicMaterial({ color: '#57534e', transparent: true, opacity: 0.35 });

  for (const s of model.solids) {
    const geometry = new THREE.BoxGeometry(Math.max(s.w, 0.001), Math.max(s.h, 0.001), Math.max(s.d, 0.001));
    if (s.finish) metricUVs(geometry);
    const mesh = new THREE.Mesh(geometry, material(s.color, s.opacity, s.finish));
    mesh.position.set(s.x, s.y0 + s.h / 2, s.z);
    mesh.rotation.y = s.rotY;
    mesh.castShadow = s.role !== 'glass';
    mesh.receiveShadow = true;
    group.add(mesh);
    if (s.role !== 'glass') {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      group.add(edges);
    }
  }

  for (const floor of model.floors) {
    if (floor.points.length < 3) continue;
    // Shapes are drawn in x/y; turning them flat maps shape y to -z, so flip z here.
    const shape = new THREE.Shape(floor.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material(floor.color, 1, floor.finish));
    mesh.position.y = floor.y + 0.005;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const slab of model.slabs) {
    if (slab.points.length < 3) continue;
    const shape = new THREE.Shape(slab.points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: slab.h, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material(slab.color, 1, slab.finish));
    mesh.position.y = slab.y0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    group.add(edges);
  }
  return group;
}

/** The plan in 3D: walls with door and window openings, room floors and furniture. */
export default function Plan3DView() {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [supported] = useState(hasWebGL);
  const doc = usePlanner((s) => s.doc);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const setWallHeightMm = usePlanner((s) => s.setWallHeightMm);
  const units = usePlanner((s) => s.units);
  const fileName = usePlanner((s) => s.fileName);
  const theme = usePlanner((s) => s.theme);
  const hasWalls = doc.elements.some((el) => el.type === 'wall');

  // Create the renderer, camera and lights once.
  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = 'plan-3d-canvas';
    renderer.domElement.className = 'block h-full w-full';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(themeColor('--canvas', '#dfe8ef'));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    // Size now, so the first camera fit knows the real shape of the view.
    if (host.clientWidth && host.clientHeight) {
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(88); // stay above the ground

    // Soft sky light from above plus an even fill, so walls facing away from the sun stay light.
    scene.add(new THREE.HemisphereLight('#ffffff', '#d6d3d1', 2.4));
    scene.add(new THREE.AmbientLight('#ffffff', 0.9));
    const sun = new THREE.DirectionalLight('#fff7ed', 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: themeColor('--plan-room', '#dfe5dc'), roughness: 1 }),
    );
    ground.receiveShadow = true;
    scene.add(ground);

    const model = new THREE.Group();
    scene.add(model);
    const stage: Stage = {
      renderer,
      scene,
      camera,
      controls,
      sun,
      ground,
      model,
      last: null,
      fitted: false,
      render: () => renderer.render(scene, camera),
    };
    stageRef.current = stage;
    controls.addEventListener('change', stage.render);

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      stage.render();
    });
    resize.observe(host);

    return () => {
      resize.disconnect();
      controls.dispose();
      disposeGroup(scene);
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, [supported]);

  // Rebuild the building whenever the plan or 3D settings change.
  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;
    const model = buildModel(doc, { wallHeightMm, showFurniture });
    stage.scene.remove(stage.model);
    disposeGroup(stage.model);
    stage.model = buildMeshes(model);
    stage.scene.add(stage.model);
    stage.last = model;

    const s = model.size;
    stage.ground.scale.set(s * 6, 1, s * 6);
    stage.ground.position.set(model.centre.x, 0, model.centre.z);
    stage.sun.position.set(model.centre.x - s * 0.6, s * 1.4 + 6, model.centre.z + s * 0.9);
    stage.sun.target.position.set(model.centre.x, 0, model.centre.z);
    const cam = stage.sun.shadow.camera;
    cam.left = cam.bottom = -s;
    cam.right = cam.top = s;
    cam.far = s * 6 + 20;
    cam.updateProjectionMatrix();

    if (!stage.fitted) {
      fitCamera(stage, model);
      stage.fitted = true;
    }
    host.dataset.solids = String(model.solids.length);
    host.dataset.floors = String(model.floors.length);
    host.dataset.slabs = String(model.slabs.length);
    stage.render();
  }, [doc, wallHeightMm, showFurniture]);

  // Follow the theme: canvas colour for the sky, room floor colour for the ground.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scene.background = new THREE.Color(themeColor('--canvas', '#dfe8ef'));
    (stage.ground.material as THREE.MeshStandardMaterial).color.set(themeColor('--plan-room', '#dfe5dc'));
    stage.render();
  }, [theme]);

  function resetView() {
    const stage = stageRef.current;
    if (stage?.last) {
      fitCamera(stage, stage.last);
      stage.render();
    }
  }

  function saveImage() {
    const stage = stageRef.current;
    if (!stage) return;
    stage.render(); // read the picture straight after drawing it
    downloadUrl(stage.renderer.domElement.toDataURL('image/png'), `${baseName(fileName)} 3D.png`);
  }

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas p-6 text-center text-muted">
        3D view needs graphics support (WebGL), which isn't available on this computer.
      </div>
    );
  }

  const btn = 'm-btn text-xs shadow-popover';
  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" data-testid="plan-3d" />
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={resetView} className={btn}>
            Reset view
          </button>
          <button onClick={saveImage} className={btn}>
            Save image
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-popover">
          Wall height
          <input
            id="wall-height"
            type="range"
            min={2438.4}
            max={4572}
            step={76.2}
            value={wallHeightMm}
            onChange={(e) => setWallHeightMm(Number(e.target.value))}
          />
          <span className="w-12 tabular-nums">{formatLength(wallHeightMm, units)}</span>
        </label>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-raised/85 px-2 py-1 text-xs text-muted">
        Drag to turn · Right-drag to move · Scroll to zoom
      </div>
      {!hasWalls && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-line bg-raised px-3 py-2 text-ink shadow-popover">
            Draw some walls in the 2D plan to see them in 3D.
          </div>
        </div>
      )}
    </div>
  );
}
