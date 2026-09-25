import { useEffect, useRef, useState, type PointerEvent } from 'react';
import * as THREE from 'three';
import type { ContextTarget } from '../components/usePlanInput';
import { usePlanInput } from '../components/usePlanInput';
import { useTouch } from '../components/useTouch';
import { downloadUrl } from '../lib/exportPng';
import { baseName } from '../lib/files';
import type { SnapKind } from '../lib/inference';
import { formatLength } from '../lib/units';
import { plannerStore, usePlanner, type PlannerState } from '../store/plannerStore';
import { themeColor } from '../theme/themes';
import { drawPattern } from '../lib/patterns';
import type { Pattern, Point } from '../types';
import { CameraRig } from './cameraRig';
import { draftElements, draftLines } from './draft3d';
import { buildModel, levelBaseM, M_PER_UNIT, type Finish, type Model3D } from './model';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
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
    mesh.userData = { id: s.id, level: s.level };
    group.add(mesh);
    if (s.role !== 'glass') {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      edges.userData = { level: s.level };
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
    mesh.userData = { id: floor.id, level: floor.level };
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
    mesh.userData = { id: slab.id, level: slab.level };
    group.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    edges.userData = { level: slab.level };
    group.add(edges);
  }
  return group;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  model: THREE.Group;
  /** What is being drawn, snap markers and guide lines. */
  overlay: THREE.Group;
  grid: THREE.Object3D | null;
  raycaster: THREE.Raycaster;
  last: Model3D | null;
  fitted: boolean;
  /** Materials made for faded floors and highlighted items, freed with the model. */
  extras: THREE.Material[];
  render: () => void;
}

/** Where a screen position lands: a plan point on the floor being drawn, and the item hit, if any. */
interface Pick {
  plan: Point;
  world: THREE.Vector3;
  id: string | null;
}

const SNAP_COLORS: Record<SnapKind, string> = {
  endpoint: '#16a34a',
  midpoint: '#0891b2',
  'on-wall': '#dc2626',
  'axis-x': '#dc2626',
  'axis-y': '#16a34a',
  locked: '#7c3aed',
  grid: '#6b7280',
  free: '#6b7280',
};

const levelIndex = (s: PlannerState, id: string | undefined) =>
  Math.max(
    0,
    s.doc.levels.findIndex((l) => l.id === (id ?? 'ground')),
  );

/**
 * Show floors above the one being drawn faintly (and out of the way of clicks), and tint the
 * selected items.
 */
function styleMeshes(stage: Stage, s: PlannerState) {
  const active = levelIndex(s, s.activeLevel);
  const selected = new Set(s.selectedIds);
  const faded = new Map<THREE.Material, THREE.Material>();
  const lit = new Map<THREE.Material, THREE.Material>();
  const variant = (
    cache: Map<THREE.Material, THREE.Material>,
    base: THREE.Material,
    make: (m: THREE.MeshStandardMaterial) => void,
  ) => {
    let m = cache.get(base);
    if (!m) {
      const copy = (base as THREE.MeshStandardMaterial).clone();
      make(copy);
      stage.extras.push(copy);
      cache.set(base, copy);
      m = copy;
    }
    return m;
  };
  stage.model.traverse((obj) => {
    const above = levelIndex(s, obj.userData.level) > active;
    if (obj instanceof THREE.LineSegments) {
      obj.visible = !above;
      return;
    }
    if (!(obj instanceof THREE.Mesh)) return;
    const base: THREE.Material = (obj.userData.base ??= obj.material);
    obj.userData.pickable = !!obj.userData.id && !above;
    if (above)
      obj.material = variant(faded, base, (m) => {
        m.transparent = true;
        m.opacity = 0.12;
        m.depthWrite = false;
      });
    else if (obj.userData.id && selected.has(obj.userData.id))
      obj.material = variant(lit, base, (m) => {
        m.emissive = new THREE.Color('#2563eb');
        m.emissiveIntensity = 0.45;
      });
    else obj.material = base;
    obj.castShadow = !above;
  });
}

const GHOST = new THREE.MeshStandardMaterial({
  color: '#2563eb',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/** Redraw what is being drawn, the snap marker and guide lines. */
function drawOverlay(stage: Stage, s: PlannerState, pxMetres: number) {
  stage.scene.remove(stage.overlay);
  stage.overlay.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      if (obj.material !== GHOST) (obj.material as THREE.Material).dispose();
    }
  });
  const overlay = new THREE.Group();
  const base = levelBaseM(s.doc, s.activeLevel, s.wallHeightMm);
  const temps = draftElements(s);
  if (temps.length) {
    const ghost = buildMeshes(
      buildModel(
        { ...s.doc, elements: temps, rooms: [], masks: [] },
        { wallHeightMm: s.wallHeightMm, showFurniture: false },
      ),
    );
    ghost.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        (obj.material as THREE.Material).dispose();
        obj.material = GHOST;
        obj.castShadow = false;
      }
    });
    overlay.add(ghost);
  }
  const lines = draftLines(s);
  if (lines.length) {
    const pts = lines.flatMap(([a, b]) => [
      new THREE.Vector3(a.x * M_PER_UNIT, base + 0.02, a.y * M_PER_UNIT),
      new THREE.Vector3(b.x * M_PER_UNIT, base + 0.02, b.y * M_PER_UNIT),
    ]);
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    overlay.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#2563eb' })));
  }
  const inf = s.inference;
  if (inf) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.02, pxMetres * 6), 16, 12),
      new THREE.MeshBasicMaterial({ color: SNAP_COLORS[inf.kind], depthTest: false }),
    );
    marker.renderOrder = 10;
    marker.position.set(inf.point.x * M_PER_UNIT, base + 0.01, inf.point.y * M_PER_UNIT);
    overlay.add(marker);
  }
  stage.overlay = overlay;
  stage.scene.add(overlay);
}

/** The drawing grid, lying on the floor being drawn. */
function drawGrid(stage: Stage, s: PlannerState) {
  if (stage.grid) {
    stage.scene.remove(stage.grid);
    disposeGroup(stage.grid);
    stage.grid = null;
  }
  if (!s.grid.show || !stage.last) return;
  const step = s.gridPx * M_PER_UNIT;
  const size = Math.max(40, stage.last.size * 3);
  // An even number of squares puts the middle on a grid line, so snapping it keeps lines on the plan's grid.
  const divisions = 2 * Math.min(200, Math.max(1, Math.round(size / step / 2)));
  const colors = s.grid.colors[s.theme];
  const grid = new THREE.GridHelper(
    divisions * step,
    divisions,
    colors?.major ?? themeColor('--plan-grid-major', '#bbbbbb'),
    colors?.minor ?? themeColor('--plan-grid', '#dddddd'),
  );
  const snapTo = (v: number) => Math.round(v / step) * step;
  grid.position.set(
    snapTo(stage.last.centre.x),
    levelBaseM(s.doc, s.activeLevel, s.wallHeightMm) + 0.003,
    snapTo(stage.last.centre.z),
  );
  const mat = grid.material as THREE.LineBasicMaterial;
  mat.transparent = true;
  mat.opacity = 0.5 + s.grid.strength / 200;
  stage.grid = grid;
  stage.scene.add(grid);
}

/** The plan in 3D, where every tool works too: walls, openings, structure, furniture and more. */
export default function Plan3DView({ onContextMenu }: { onContextMenu?: (target: ContextTarget) => void }) {
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
  const tool = usePlanner((s) => s.tool);
  /** The last pick, reused while the pointer has not moved. */
  const pickRef = useRef<{ x: number; y: number; pick: Pick } | null>(null);
  /** A camera drag in progress (middle button, or the Orbit, Pan and Zoom tools). */
  const camRef = useRef<{ mode: 'orbit' | 'pan' | 'dolly'; x: number; y: number; id: number } | null>(null);

  // Create the renderer, camera and lights once.
  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.dataset.testid = 'plan-3d-canvas';
    renderer.domElement.className = 'block h-full w-full';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(themeColor('--canvas', '#dfe8ef'));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000);
    if (host.clientWidth && host.clientHeight) {
      renderer.setSize(host.clientWidth, host.clientHeight, false);
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
    }
    const rig = new CameraRig(camera);
    rig.apply();

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
    const overlay = new THREE.Group();
    scene.add(model, overlay);
    const stage: Stage = {
      renderer,
      scene,
      camera,
      rig,
      sun,
      ground,
      model,
      overlay,
      grid: null,
      raycaster: new THREE.Raycaster(),
      last: null,
      fitted: false,
      extras: [],
      render: () => renderer.render(scene, camera),
    };
    stageRef.current = stage;

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      stage.render();
    });
    resize.observe(host);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const toward = pickAt(e.clientX, e.clientY)?.world;
      rig.dolly(Math.exp(e.deltaY * 0.0015), toward);
      pickRef.current = null;
      stage.render();
    };
    host.addEventListener('wheel', onWheel, { passive: false });

    // Redraw the preview whenever what is being drawn, or where the pointer snaps, changes.
    const unsubscribe = plannerStore.subscribe((s, prev) => {
      if (
        s.draft !== prev.draft ||
        s.inference !== prev.inference ||
        s.tool !== prev.tool ||
        s.activeLevel !== prev.activeLevel
      ) {
        drawOverlay(stage, s, (s.pxUnits() || 1) * M_PER_UNIT);
        stage.render();
      }
      if (s.selectedIds !== prev.selectedIds || s.activeLevel !== prev.activeLevel) {
        styleMeshes(stage, s);
        stage.render();
      }
      if (s.grid !== prev.grid || s.activeLevel !== prev.activeLevel || s.gridPx !== prev.gridPx) {
        drawGrid(stage, s);
        stage.render();
      }
    });

    return () => {
      unsubscribe();
      host.removeEventListener('wheel', onWheel);
      resize.disconnect();
      disposeGroup(scene);
      stage.extras.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
      plannerStore.getState().setPx3d(null);
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
    stage.extras.forEach((m) => m.dispose());
    stage.extras = [];
    stage.model = buildMeshes(model);
    stage.scene.add(stage.model);
    stage.last = model;
    pickRef.current = null;

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
      stage.rig.fit(model.centre, model.size, !model.solids.length);
      stage.fitted = true;
    }
    const state = plannerStore.getState();
    styleMeshes(stage, state);
    drawGrid(stage, state);
    drawOverlay(stage, state, state.pxUnits() * M_PER_UNIT);
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
    drawGrid(stage, plannerStore.getState());
    stage.render();
  }, [theme]);

  /** Look along the view from a screen position: what it hits, and where on the floor being drawn. */
  function pickAt(clientX: number, clientY: number): Pick | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const last = pickRef.current;
    if (last && last.x === clientX && last.y === clientY) return last.pick;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    stage.raycaster.setFromCamera(ndc, stage.camera);
    const s = plannerStore.getState();
    const base = levelBaseM(s.doc, s.activeLevel, s.wallHeightMm);
    const hit = stage.raycaster
      .intersectObjects(stage.model.children, false)
      .find((h) => h.object instanceof THREE.Mesh && h.object.userData.pickable);
    let world: THREE.Vector3 | null;
    let id: string | null = null;
    // A hit on the floor being drawn gives the point on it (a wall face, a floor, a table top);
    // anything else (open space, a floor below) lands on the floor's level.
    if (hit && (hit.object.userData.level ?? 'ground') === s.activeLevel) {
      world = hit.point.clone();
      id = hit.object.userData.id ?? null;
    } else {
      world = stage.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -base),
        new THREE.Vector3(),
      );
    }
    if (!world) return last?.pick ?? null;
    const distance = stage.camera.position.distanceTo(world);
    const metresPerPx = (2 * distance * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2)) / rect.height;
    s.setPx3d(metresPerPx / M_PER_UNIT);
    const pick = { plan: { x: world.x / M_PER_UNIT, y: world.z / M_PER_UNIT }, world, id };
    pickRef.current = { x: clientX, y: clientY, pick };
    return pick;
  }

  const input = usePlanInput(
    (e) => pickAt(e.clientX, e.clientY)?.plan ?? { x: 0, y: 0 },
    onContextMenu,
    (e) => pickAt(e.clientX, e.clientY)?.id ?? null,
  );

  const touch = useTouch({
    down: input.onPointerDown,
    move: input.onPointerMove,
    up: input.onPointerUp,
    doubleClick: input.onDoubleClick,
    contextMenu: input.onRightClick,
    abort: input.abortPress,
    gesture: ({ dx, dy, scale, x, y, fingers }) => {
      const stage = stageRef.current;
      const host = hostRef.current;
      if (!stage || !host) return;
      if (fingers === 3) stage.rig.orbit(dx, dy);
      else {
        stage.rig.pan(dx, dy, host.clientHeight);
        const r = host.getBoundingClientRect();
        stage.rig.dolly(1 / scale, pickAt(r.left + x, r.top + y)?.world);
      }
      pickRef.current = null;
      stage.render();
    },
  });

  /** Which camera move (if any) a press starts: middle button, or the Orbit, Pan and Zoom tools. */
  function cameraMode(e: PointerEvent<HTMLDivElement>): 'orbit' | 'pan' | 'dolly' | null {
    const tool = plannerStore.getState().tool;
    if (e.button === 1) return e.shiftKey ? 'pan' : 'orbit';
    if (e.button !== 0) return null;
    if (tool === 'orbit') return e.shiftKey ? 'pan' : 'orbit';
    if (tool === 'pan') return 'pan';
    if (tool === 'zoom') return 'dolly';
    return null;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    const mode = cameraMode(e);
    if (mode) {
      e.preventDefault(); // no auto-scroll on middle click
      e.currentTarget.setPointerCapture(e.pointerId);
      camRef.current = { mode, x: e.clientX, y: e.clientY, id: e.pointerId };
      return;
    }
    touch.onPointerDown(e);
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const cam = camRef.current;
    const stage = stageRef.current;
    if (cam && stage && cam.id === e.pointerId) {
      const dx = e.clientX - cam.x;
      const dy = e.clientY - cam.y;
      if (cam.mode === 'orbit') stage.rig.orbit(dx, dy);
      else if (cam.mode === 'pan') stage.rig.pan(dx, dy, e.currentTarget.clientHeight);
      else stage.rig.dolly(Math.exp(dy * 0.01));
      cam.x = e.clientX;
      cam.y = e.clientY;
      pickRef.current = null;
      stage.render();
      return;
    }
    touch.onPointerMove(e);
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    if (camRef.current?.id === e.pointerId) {
      camRef.current = null;
      return;
    }
    touch.onPointerUp(e);
  }

  function resetView() {
    const stage = stageRef.current;
    if (stage?.last) {
      stage.rig.fit(stage.last.centre, stage.last.size, !stage.last.solids.length);
      pickRef.current = null;
      stage.render();
    }
  }

  function saveImage() {
    const stage = stageRef.current;
    if (!stage) return;
    // Leave the drawing aids out of the picture.
    stage.overlay.visible = false;
    if (stage.grid) stage.grid.visible = false;
    stage.render();
    downloadUrl(stage.renderer.domElement.toDataURL('image/png'), `${baseName(fileName)} 3D.png`);
    stage.overlay.visible = true;
    if (stage.grid) stage.grid.visible = true;
    stage.render();
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
      <div
        ref={hostRef}
        className="h-full w-full touch-none select-none"
        data-testid="plan-3d"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => plannerStore.getState().setInference(null)}
        onDoubleClick={(e) => !touch.fromTouch() && input.onDoubleClick(e)}
        onContextMenu={(e) => (touch.fromTouch() ? e.preventDefault() : input.onRightClick(e))}
        onAuxClick={(e) => e.preventDefault()}
      />
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
        Middle-drag to orbit · Shift+middle-drag to pan · Scroll to zoom · Orbit tool (O) for touchpads
      </div>
      {!hasWalls && tool === 'select' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-md border border-line bg-raised px-3 py-2 text-ink shadow-popover">
            Pick Wall (L) or Rectangle (R) and draw right here, or in the 2D plan.
          </div>
        </div>
      )}
    </div>
  );
}
