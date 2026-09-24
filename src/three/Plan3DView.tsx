import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { downloadUrl } from '../lib/exportPng';
import { baseName } from '../lib/files';
import { formatLength } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import { buildModel, type Model3D } from './model';

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
      mats.forEach((m) => m.dispose());
    }
  });
}

function buildMeshes(model: Model3D): THREE.Group {
  const group = new THREE.Group();
  const materials = new Map<string, THREE.Material>();
  const material = (color: string, opacity = 1) => {
    const key = `${color}/${opacity}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0,
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
    const mesh = new THREE.Mesh(geometry, material(s.color, s.opacity));
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
    const mesh = new THREE.Mesh(geometry, material(floor.color));
    mesh.position.y = 0.005;
    mesh.receiveShadow = true;
    group.add(mesh);
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
    scene.background = new THREE.Color('#dfe8ef');
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
      new THREE.MeshStandardMaterial({ color: '#dfe5dc', roughness: 1 }),
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
    stage.render();
  }, [doc, wallHeightMm, showFurniture]);

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
      <div className="flex h-full items-center justify-center bg-white p-6 text-center text-sm text-gray-600">
        3D view needs graphics support (WebGL), which isn't available on this computer.
      </div>
    );
  }

  const btn = 'rounded border bg-white px-2 py-1 text-xs shadow-sm hover:bg-gray-50';
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
        <label className="flex items-center gap-2 rounded border bg-white px-2 py-1 text-xs shadow-sm">
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
      <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-white/80 px-2 py-1 text-xs text-gray-600">
        Drag to turn · Right-drag to move · Scroll to zoom
      </div>
      {!hasWalls && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded bg-white/90 px-3 py-2 text-sm text-gray-700 shadow">
            Draw some walls in the 2D plan to see them in 3D.
          </div>
        </div>
      )}
    </div>
  );
}
