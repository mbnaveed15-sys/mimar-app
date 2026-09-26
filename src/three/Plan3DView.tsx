import { useEffect, useRef, useState, type PointerEvent } from 'react';
import * as THREE from 'three';
import type { ContextTarget } from '../components/usePlanInput';
import { usePlanInput } from '../components/usePlanInput';
import { useTouch } from '../components/useTouch';
import { downloadUrl } from '../lib/exportPng';
import { baseName } from '../lib/files';
import { SNAP_LABELS, type SnapKind } from '../lib/inference';
import { protractor } from '../lib/protractor';
import { formatLength } from '../lib/units';
import { plannerStore, usePlanner, type PlannerState } from '../store/plannerStore';
import { themeColor } from '../theme/themes';
import { drawPattern } from '../lib/patterns';
import type { Bounds, Pattern, PlanDoc, Point } from '../types';
import { setCameraEye } from './cameraEye';
import { CameraRig } from './cameraRig';
import { draftElements, draftLines } from './draft3d';
import { withoutHidden } from '../lib/layers';
import { shapeDraftScene } from '../tools/shapeTools';
import { clearPicker, getPointer, setPicker, type FaceHit, type Picker3D } from './picker';
import type { StandardView } from './cameraRig';
import { isParallel, requestView, setViewControls, toggleParallel } from './viewControls';
import { buildModel, levelBaseM, M_PER_UNIT, type Finish, type Model3D, type Sides } from './model';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Free a group's geometry. Materials of the building are shared and kept (see MATERIALS), so an
 * edit doesn't make the graphics card compile its shaders again; others are freed with the group.
 */
function disposeGroup(group: THREE.Object3D) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        if (KEPT.has(m)) return;
        if (m instanceof THREE.MeshStandardMaterial) m.map?.dispose();
        m.dispose();
      });
    }
  });
}

/** The building's materials by look, kept for the whole session and shared by every rebuild. */
const MATERIALS = new Map<string, THREE.Material>();
/** Materials that live on across rebuilds (the shared ones and their faded or lit variants). */
const KEPT = new WeakSet<THREE.Material>();
const keep = <T extends THREE.Material>(m: T): T => {
  KEPT.add(m);
  return m;
};
const EDGE_MATERIAL = keep(new THREE.LineBasicMaterial({ color: '#57534e', transparent: true, opacity: 0.35 }));
/** Each mesh's box in the scene, worked out once (the model's meshes don't move once built). */
const BOXES = new WeakMap<THREE.Object3D, THREE.Box3>();
function boxOf(obj: THREE.Object3D): THREE.Box3 {
  let box = BOXES.get(obj);
  if (!box) {
    box = new THREE.Box3().setFromObject(obj);
    BOXES.set(obj, box);
  }
  return box;
}

/** Faded, lit and red variants of each shared material, made once. */
const EXTRAS = new Map<string, Map<THREE.Material, THREE.Material>>();

/**
 * One renderer for the session: the 3D view reuses it each time it opens instead of making a new
 * one (and a new graphics context) every time.
 */
let sharedRenderer: THREE.WebGLRenderer | null = null;
function rendererFor(): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    sharedRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    sharedRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    sharedRenderer.shadowMap.enabled = true;
    sharedRenderer.shadowMap.type = THREE.PCFShadowMap;
    // Checking every shader for errors is slow; only worth it while developing.
    sharedRenderer.debug.checkShaderErrors = import.meta.env.DEV;
    sharedRenderer.domElement.dataset.testid = 'plan-3d-canvas';
    sharedRenderer.domElement.className = 'block h-full w-full';
  }
  return sharedRenderer;
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

/**
 * An upright panel's two caps as their own groups, so each side can have its own material: the
 * front cap (+z, side A) takes material 2 and the back (-z, side B) material 3; the edges keep 1.
 */
function splitCaps(geometry: THREE.BufferGeometry) {
  const caps = geometry.groups.find((g) => g.materialIndex === 0);
  if (!caps) return;
  const pos = geometry.getAttribute('position');
  const end = caps.start + caps.count;
  const back: number[] = [];
  const front: number[] = [];
  for (let i = caps.start; i < end; i += 3) (pos.getZ(i) < 0 ? back : front).push(i);
  // three.js lays the back cap's triangles first, then the front's; keep that order.
  const split = caps.start + back.length * 3;
  if (back.some((i, k) => i !== caps.start + k * 3)) return;
  geometry.groups = geometry.groups.filter((g) => g !== caps);
  geometry.addGroup(caps.start, split - caps.start, 3);
  geometry.addGroup(split, end - split, 2);
}

const ROUGHNESS: Partial<Record<Pattern, number>> = { marble: 0.35, granite: 0.4, metal: 0.4, glass: 0.1, tiles: 0.5 };

function buildMeshes(model: Model3D): THREE.Group {
  const group = new THREE.Group();
  const materials = MATERIALS;
  const material = (color: string, opacity = 1, finish?: Finish) => {
    const key = `${color}/${opacity}/${finish?.pattern}/${finish?.spanM}`;
    let mat = materials.get(key);
    if (!mat) {
      const map = finish ? patternTexture(color, finish) : null;
      mat = keep(
        new THREE.MeshStandardMaterial({
          color: map ? '#ffffff' : color,
          map,
          roughness: (finish && ROUGHNESS[finish.pattern]) ?? 0.85,
          metalness: finish?.pattern === 'metal' ? 0.5 : 0,
          transparent: opacity < 1,
          opacity,
          side: THREE.DoubleSide,
        }),
      );
      materials.set(key, mat);
    }
    return mat;
  };
  const edgeMaterial = EDGE_MATERIAL;
  /** A wall piece's materials: its own look, and each big face's (side A on +z, side B on -z). */
  const sideLooks = (s: { color: string; opacity?: number; finish?: Finish; sides?: Sides }) => {
    const main = material(s.color, s.opacity, s.finish);
    const { plus, minus } = s.sides ?? {};
    return {
      main,
      plus: plus ? material(plus.color, s.opacity, plus.finish) : main,
      minus: minus ? material(minus.color, s.opacity, minus.finish) : main,
      patterned: !!(s.finish || plus?.finish || minus?.finish),
    };
  };

  for (const s of model.solids) {
    const geometry = new THREE.BoxGeometry(Math.max(s.w, 0.001), Math.max(s.h, 0.001), Math.max(s.d, 0.001));
    const looks = sideLooks(s);
    if (looks.patterned) metricUVs(geometry);
    // A box's faces come in the order +x, -x, +y, -y, +z, -z.
    const mesh = new THREE.Mesh(
      geometry,
      s.sides ? [looks.main, looks.main, looks.main, looks.main, looks.plus, looks.minus] : looks.main,
    );
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
    const mesh = new THREE.Mesh(geometry, material(floor.color, floor.opacity ?? 1, floor.finish));
    mesh.position.y = floor.y + 0.005;
    mesh.receiveShadow = true;
    mesh.userData = { id: floor.id, level: floor.level };
    group.add(mesh);
  }

  /** A flat outline (with any holes) as a three.js shape, in its own axes. */
  const shapeOf = (outline: [number, number][], holes: [number, number][][] = [], flipY = false) => {
    const v = ([a, b]: [number, number]) => new THREE.Vector2(a, flipY ? -b : b);
    const shape = new THREE.Shape(outline.map(v));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(v)));
    return shape;
  };
  const addWithEdges = (mesh: THREE.Mesh, level?: string, edges = true) => {
    group.add(mesh);
    if (!edges) return;
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMaterial);
    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.userData = { level };
    group.add(lines);
  };

  for (const slab of [...model.slabs, ...model.blocks]) {
    if (slab.points.length < 3) continue;
    // Shapes are drawn in x/y; turning them flat maps shape y to -z, so flip z here.
    const geometry = new THREE.ExtrudeGeometry(shapeOf(slab.points, slab.holes, true), {
      depth: slab.h,
      bevelEnabled: false,
    });
    geometry.rotateX(-Math.PI / 2);
    const flatShape = slab.role === 'shape';
    const mesh = new THREE.Mesh(geometry, material(slab.color, slab.opacity ?? 1, slab.finish));
    mesh.position.y = slab.y0;
    mesh.castShadow = !flatShape;
    mesh.receiveShadow = !flatShape;
    mesh.userData = { id: slab.id, level: slab.level };
    addWithEdges(mesh, slab.level);
  }

  for (const panel of model.panels) {
    if (panel.outline.length < 3) continue;
    const geometry = new THREE.ExtrudeGeometry(shapeOf(panel.outline, panel.holes), {
      depth: panel.depth,
      bevelEnabled: false,
      curveSegments: 1,
    });
    geometry.translate(0, 0, -panel.depth / 2);
    const looks = sideLooks(panel);
    if (looks.patterned) metricUVs(geometry);
    if (panel.sides) splitCaps(geometry);
    const mesh = new THREE.Mesh(geometry, panel.sides ? [looks.main, looks.main, looks.plus, looks.minus] : looks.main);
    mesh.position.set(panel.x, panel.y0, panel.z);
    mesh.rotation.y = panel.rotY;
    mesh.castShadow = panel.role === 'wall';
    mesh.receiveShadow = panel.role !== 'glass';
    mesh.userData = { id: panel.id, level: panel.level };
    addWithEdges(mesh, panel.level, panel.role !== 'glass');
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
  /** The face Push/Pull would take hold of, lit up. */
  highlight: THREE.Mesh | null;
  raycaster: THREE.Raycaster;
  last: Model3D | null;
  fitted: boolean;
  /** Framed while the plan was empty: in split view, framed again when the first thing is drawn on the plan. */
  fittedEmpty: boolean;
  /** A standard view asked for before the building was first built. */
  pendingView: StandardView | null;
  /** Materials made for faded floors and highlighted items (by look, then base material), kept for the session. */
  extras: Map<string, Map<THREE.Material, THREE.Material>>;
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
  intersection: '#9333ea',
  'on-wall': '#dc2626',
  'on-line': '#dc2626',
  'building-line': '#dc2626',
  'on-face': '#dc2626',
  corner: '#16a34a',
  perpendicular: '#9333ea',
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
  const erasing = new Set(s.draft?.type === 'erase' ? s.draft.ids : []);
  const cache = (look: string) => {
    let m = stage.extras.get(look);
    if (!m) stage.extras.set(look, (m = new Map()));
    return m;
  };
  const faded = cache('faded');
  const lit = cache('lit');
  const red = cache('red');
  const variant = (
    looks: Map<THREE.Material, THREE.Material>,
    base: THREE.Material,
    make: (m: THREE.MeshStandardMaterial) => void,
  ) => {
    let m = looks.get(base);
    if (!m) {
      const copy = keep((base as THREE.MeshStandardMaterial).clone());
      make(copy);
      looks.set(base, copy);
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
    const base: THREE.Material | THREE.Material[] = (obj.userData.base ??= obj.material);
    // A wall with a material per side has a list of them: each gets the look.
    const each = (looks: Map<THREE.Material, THREE.Material>, make: (m: THREE.MeshStandardMaterial) => void) =>
      Array.isArray(base) ? base.map((b) => variant(looks, b, make)) : variant(looks, base, make);
    obj.userData.pickable = !!obj.userData.id && !above;
    if (above)
      obj.material = each(faded, (m) => {
        m.transparent = true;
        m.opacity = 0.12;
        m.depthWrite = false;
      });
    else if (obj.userData.id && erasing.has(obj.userData.id))
      obj.material = each(red, (m) => {
        m.emissive = new THREE.Color('#dc2626');
        m.emissiveIntensity = 0.6;
      });
    else if (obj.userData.id && selected.has(obj.userData.id))
      obj.material = each(lit, (m) => {
        m.emissive = new THREE.Color('#2563eb');
        m.emissiveIntensity = 0.45;
      });
    else obj.material = base;
    obj.castShadow = !above;
  });
}

const FACE_GLOW = new THREE.MeshBasicMaterial({
  color: '#f59e0b',
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/** Take the face highlight away. */
function clearHighlight(stage: Stage) {
  if (!stage.highlight) return;
  stage.scene.remove(stage.highlight);
  stage.highlight.geometry.dispose();
  stage.highlight = null;
}

/**
 * The triangles of a mesh that lie in the plane of a face hit (all of that face, whatever its
 * shape), in the scene's coordinates.
 */
function faceGeometry(mesh: THREE.Mesh, hit: THREE.Intersection): THREE.BufferGeometry | null {
  if (!hit.face) return null;
  const pos = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.getIndex();
  const n = hit.face.normal.clone().normalize();
  const p = mesh.worldToLocal(hit.point.clone());
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const tri = new THREE.Triangle();
  const faceN = new THREE.Vector3();
  const out: number[] = [];
  const count = index ? index.count : pos.count;
  for (let i = 0; i + 2 < count; i += 3) {
    const [ia, ib, ic] = index ? [index.getX(i), index.getX(i + 1), index.getX(i + 2)] : [i, i + 1, i + 2];
    a.fromBufferAttribute(pos, ia);
    b.fromBufferAttribute(pos, ib);
    c.fromBufferAttribute(pos, ic);
    tri.set(a, b, c).getNormal(faceN);
    if (faceN.dot(n) > 0.999 && Math.abs(a.clone().sub(p).dot(n)) < 1e-4) out.push(...a, ...b, ...c);
  }
  if (!out.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return geometry.applyMatrix4(mesh.matrixWorld);
}

const GHOST = new THREE.MeshStandardMaterial({
  color: '#2563eb',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/** How often (ms) the 3D view catches up while something is dragged on the plan in split view. */
const SPLIT_THROTTLE_MS = 300;
/** A rebuild slower than this (ms) waits for the drag to end instead, so the plan stays smooth. */
const SLOW_BUILD_MS = 60;
/** How long the last rebuild of the building took (ms). */
let lastBuildMs = 0;

/**
 * The plan to build in 3D. In split view, while something is being dragged on the plan, it follows
 * at most every 300 ms, or (on a big house, where a rebuild is slow) waits until the drag ends.
 */
function useShownDoc(): PlanDoc {
  const [doc, setDoc] = useState(() => plannerStore.getState().doc);
  useEffect(() => {
    let timer: number | null = null;
    const unsubscribe = plannerStore.subscribe((s, prev) => {
      if (s.doc === prev.doc && s.batchBase === prev.batchBase) return;
      const busy = s.split && !s.view3d && s.batchBase !== null;
      if (!busy) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        setDoc(s.doc);
      } else if (timer === null && lastBuildMs <= SLOW_BUILD_MS) {
        timer = window.setTimeout(() => {
          timer = null;
          setDoc(plannerStore.getState().doc);
        }, SPLIT_THROTTLE_MS);
      }
    });
    return () => {
      unsubscribe();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);
  return doc;
}

/** Metres per screen pixel in the 3D view (also while the pointer is on the plan, in split view). */
const metresPerPx = (s: PlannerState) => (s.px3d || s.pxUnits() || 1) * M_PER_UNIT;

/**
 * Redraw what is being drawn, the snap marker and guide lines. `hitY` is the height (metres) of what
 * the pointer is on, so the marker shows there (a wall's top corner, say) rather than on the floor.
 */
function drawOverlay(stage: Stage, s: PlannerState, pxMetres: number, hitY: number | null) {
  stage.scene.remove(stage.overlay);
  stage.overlay.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
      obj.geometry.dispose();
      const m = obj.material as THREE.Material;
      if (m !== GHOST && !KEPT.has(m)) m.dispose();
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
        // The ghost's own materials are the shared ones: swap them for the ghost look, don't free them.
        obj.material = GHOST;
        obj.castShadow = false;
      }
    });
    overlay.add(ghost);
  }
  const lines = draftLines(s);
  if (lines.length) {
    const pts = lines.flatMap(([a, b, z]) => [
      new THREE.Vector3(a.x * M_PER_UNIT, base + (z ? z[0] / 1000 : 0) + 0.02, a.y * M_PER_UNIT),
      new THREE.Vector3(b.x * M_PER_UNIT, base + (z ? z[1] / 1000 : 0) + 0.02, b.y * M_PER_UNIT),
    ]);
    const geometry = new THREE.BufferGeometry().setFromPoints(pts);
    // A tape off the floor is drawn over what is in front of it, so it shows where it runs.
    const lifted = lines.some(([, , z]) => z && (z[0] > 0 || z[1] > 0));
    const segs = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: !lifted }),
    );
    segs.renderOrder = lifted ? 10 : 0;
    overlay.add(segs);
  }
  const d = s.draft;
  if (d?.type === 'rotate') {
    // The protractor, about 60 pixels across whatever the zoom, flat on the floor.
    const { ring, ticks, arc } = protractor(d.center, (pxMetres * 60) / M_PER_UNIT, d.start, d.angle);
    const at = (p: Point) => new THREE.Vector3(p.x * M_PER_UNIT, base + 0.02, p.y * M_PER_UNIT);
    const segs: Point[] = [
      ...ring.flatMap((p, i) => [p, ring[(i + 1) % ring.length]]),
      ...ticks.flat(),
      ...arc.flatMap((p, i) => (i ? [arc[i - 1], p] : [d.center, p])),
      ...(arc.length ? [arc[arc.length - 1], d.center] : []),
    ];
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(segs.map(at)),
      new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false }),
    );
    lines.renderOrder = 10;
    overlay.add(lines);
  }
  const outline = shapeDraftScene(s);
  if (outline.length >= 2) {
    const closed = d?.type === 'shape' && d.kind !== 'polygon';
    const pts = outline.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const geometry = new THREE.BufferGeometry().setFromPoints(closed ? [...pts, pts[0]] : pts);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#2563eb', depthTest: false }));
    line.renderOrder = 10;
    overlay.add(line);
  }
  const inf = s.inference;
  if (inf) {
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(0.02, pxMetres * 6), 16, 12),
      new THREE.MeshBasicMaterial({ color: SNAP_COLORS[inf.kind], depthTest: false }),
    );
    marker.renderOrder = 10;
    const y = hitY !== null && hitY > base + 0.05 ? hitY : base + 0.01;
    const [x, z] = [inf.point.x * M_PER_UNIT, inf.point.y * M_PER_UNIT];
    marker.position.set(x, y, z);
    overlay.add(marker);
    if (y > base + 0.05) {
      // A dashed line down to the floor being drawn on, where the point lands.
      const drop = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(x, base, z)]),
        new THREE.LineDashedMaterial({ color: SNAP_COLORS[inf.kind], dashSize: 0.1, gapSize: 0.07, depthTest: false }),
      );
      drop.computeLineDistances();
      drop.renderOrder = 10;
      overlay.add(drop);
    }
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
  const strength = 0.5 + s.grid.strength / 200;
  const ground = levelIndex(s, s.activeLevel) === 0;
  // On the ground floor the grid is drawn as a backdrop: the plot, floors and everything solid cover it, so
  // it never floats over the plot's grass. It can't fade there, so its colours are mixed with the ground's.
  const shade = (c: string) =>
    ground
      ? '#' + new THREE.Color(themeColor('--plan-room', '#dfe5dc')).lerp(new THREE.Color(c), strength).getHexString()
      : c;
  const grid = new THREE.GridHelper(
    divisions * step,
    divisions,
    shade(colors?.major ?? themeColor('--plan-grid-major', '#bbbbbb')),
    shade(colors?.minor ?? themeColor('--plan-grid', '#dddddd')),
  );
  const snapTo = (v: number) => Math.round(v / step) * step;
  grid.position.set(
    snapTo(stage.last.centre.x),
    levelBaseM(s.doc, s.activeLevel, s.wallHeightMm) + 0.003,
    snapTo(stage.last.centre.z),
  );
  const mat = grid.material as THREE.LineBasicMaterial;
  if (ground) {
    mat.depthTest = false;
    mat.depthWrite = false;
    grid.renderOrder = -1;
  } else {
    mat.transparent = true;
    mat.opacity = strength;
  }
  stage.grid = grid;
  stage.scene.add(grid);
}

/** The plan in 3D, where every tool works too: walls, openings, structure, furniture and more. */
export default function Plan3DView({ onContextMenu }: { onContextMenu?: (target: ContextTarget) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [supported] = useState(hasWebGL);
  const doc = useShownDoc();
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
  /** The selection box being dragged, in screen pixels. */
  const [box, setBox] = useState<Bounds | null>(null);
  const [parallel, setParallel] = useState(isParallel);
  /** The snap's name next to the pointer (Endpoint, Midpoint…), as in SketchUp. */
  const labelRef = useRef<HTMLDivElement>(null);
  const showSnapLabel = (s: PlannerState) => {
    const el = labelRef.current;
    const host = hostRef.current;
    if (!el || !host) return;
    // In split view, only while the pointer is over the 3D side (the plan shows its own label).
    const text = s.inference && s.view3d ? SNAP_LABELS[s.inference.kind] : '';
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
    if (!text) return;
    const r = host.getBoundingClientRect();
    const p = getPointer();
    el.style.left = `${p.x - r.left + 14}px`;
    el.style.top = `${p.y - r.top + 14}px`;
  };

  // Create the renderer, camera and lights once.
  useEffect(() => {
    const host = hostRef.current;
    if (!supported || !host) return;
    const renderer = rendererFor();
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
    ground.renderOrder = -2; // under the ground-floor grid
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
      highlight: null,
      raycaster: new THREE.Raycaster(),
      last: null,
      fitted: false,
      fittedEmpty: false,
      pendingView: null,
      extras: EXTRAS,
      render: () => {
        renderer.render(scene, rig.active);
        // The camera on the plan, for the 2D side of split view.
        const across = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
        setCameraEye({
          at: { x: camera.position.x / M_PER_UNIT, y: camera.position.z / M_PER_UNIT },
          target: { x: rig.target.x / M_PER_UNIT, y: rig.target.z / M_PER_UNIT },
          fovDeg: rig.parallel ? 0 : THREE.MathUtils.radToDeg(across),
        });
      },
    };
    stageRef.current = stage;

    // Zooming, standard views and the projection, for the View menu and the keys.
    const redraw = () => {
      pickRef.current = null;
      drawOverlay(stage, plannerStore.getState(), metresPerPx(plannerStore.getState()), null);
      stage.render();
    };
    setViewControls({
      zoom(factor) {
        rig.dolly(factor);
        redraw();
      },
      extents() {
        if (stage.last) rig.extents(stage.last.centre, stage.last.size);
        redraw();
      },
      view(name) {
        if (!stage.last) stage.pendingView = name;
        else rig.view(name, stage.last.centre, stage.last.size);
        redraw();
      },
      setParallel(on) {
        rig.parallel = on;
        setParallel(on); // the button in the corner follows the menu
        redraw();
      },
      parallel: () => rig.parallel,
    });

    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      rig.apply(); // the parallel camera follows the new shape
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
      if (s.tool !== prev.tool && stage.highlight) {
        clearHighlight(stage);
        stage.render();
      }
      if (
        s.draft !== prev.draft ||
        s.inference !== prev.inference ||
        s.tool !== prev.tool ||
        s.activeLevel !== prev.activeLevel
      ) {
        const under = s.view3d ? pickRef.current?.pick : undefined;
        drawOverlay(stage, s, metresPerPx(s), under?.id ? under.world.y : null);
        showSnapLabel(s);
        stage.render();
      }
      const erasing = (x: PlannerState) => (x.draft?.type === 'erase' ? x.draft : null);
      if (s.selectedIds !== prev.selectedIds || s.activeLevel !== prev.activeLevel || erasing(s) !== erasing(prev)) {
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
      setViewControls(null);
      host.removeEventListener('wheel', onWheel);
      resize.disconnect();
      disposeGroup(scene);
      // The renderer and the shared materials stay for the next time the 3D view opens.
      renderer.renderLists.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
      plannerStore.getState().setPx3d(null);
      setCameraEye(null);
    };
  }, [supported]);

  // Rebuild the building whenever the plan or 3D settings change.
  useEffect(() => {
    const stage = stageRef.current;
    const host = hostRef.current;
    if (!stage || !host) return;
    const started = performance.now();
    const shown = withoutHidden(doc, { layers: doc.layers, showFurniture });
    const model = buildModel(shown, { wallHeightMm, showFurniture });
    clearHighlight(stage);
    stage.scene.remove(stage.model);
    disposeGroup(stage.model);
    stage.model = buildMeshes(model);
    stage.model.add(layoutLines(shown, wallHeightMm));
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

    const state = plannerStore.getState();
    if (!stage.fitted) {
      if (stage.pendingView) stage.rig.view(stage.pendingView, model.centre, model.size);
      else stage.rig.fit(model.centre, model.size, !model.solids.length);
      stage.pendingView = null;
      stage.fitted = true;
      stage.fittedEmpty = !model.solids.length;
    } else if (stage.fittedEmpty && model.solids.length && state.split && !state.view3d) {
      // Drawn on the plan beside an empty 3D view: bring it into view.
      stage.rig.fit(model.centre, model.size);
      stage.fittedEmpty = false;
    }
    styleMeshes(stage, state);
    drawGrid(stage, state);
    drawOverlay(stage, state, metresPerPx(state), null);
    host.dataset.solids = String(model.solids.length);
    host.dataset.floors = String(model.floors.length);
    host.dataset.slabs = String(model.slabs.length);
    host.dataset.blocks = String(model.blocks.filter((b) => b.role === 'block').length);
    host.dataset.shapes = String(
      model.blocks.filter((b) => b.role === 'shape').length + model.panels.filter((p) => p.role === 'shape').length,
    );
    host.dataset.panels = String(model.panels.filter((p) => p.role === 'wall').length);
    stage.render();
    lastBuildMs = performance.now() - started;
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

  // Let the Shape and Push/Pull tools look into the scene while the 3D view is showing.
  useEffect(() => {
    if (!supported) return;
    const aim = (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) return null;
      const rect = stage.renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      stage.raycaster.setFromCamera(
        new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
        stage.rig.active,
      );
      return stage;
    };
    const v = (p: [number, number, number]) => new THREE.Vector3(...p);
    /** What each face handed out was, so it can be lit up. */
    const hits = new WeakMap<object, THREE.Intersection>();
    const picker: Picker3D = {
      is3d: true,
      highlight(hit) {
        const stage = stageRef.current;
        if (!stage) return;
        const was = stage.highlight;
        clearHighlight(stage);
        const from = hit && hits.get(hit);
        const geometry = from && from.object instanceof THREE.Mesh ? faceGeometry(from.object, from) : null;
        if (geometry) {
          stage.highlight = new THREE.Mesh(geometry, FACE_GLOW);
          stage.highlight.renderOrder = 5;
          stage.scene.add(stage.highlight);
        }
        if (was || geometry) stage.render();
      },
      faceAt(clientX, clientY) {
        const stage = aim(clientX, clientY);
        if (!stage) return null;
        const s = plannerStore.getState();
        const hit = stage.raycaster
          .intersectObjects(stage.model.children, false)
          .find((h) => h.object instanceof THREE.Mesh && h.object.userData.pickable);
        if (!hit?.face || (hit.object.userData.level ?? 'ground') !== s.activeLevel) return null;
        const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
        const face: FaceHit = {
          id: hit.object.userData.id,
          point: [hit.point.x, hit.point.y, hit.point.z],
          normal: [n.x, n.y, n.z],
        };
        hits.set(face, hit);
        return face;
      },
      onPlane(clientX, clientY, point, normal) {
        const stage = aim(clientX, clientY);
        if (!stage) return null;
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(v(normal).normalize(), v(point));
        const hit = stage.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
        return hit ? [hit.x, hit.y, hit.z] : null;
      },
      alongLine(clientX, clientY, origin, dir) {
        const stage = aim(clientX, clientY);
        if (!stage) return null;
        // The point on the line nearest the line of sight (closest points of two lines).
        const { origin: o, direction: d } = stage.raycaster.ray;
        const n = v(dir).normalize();
        const w0 = o.clone().sub(v(origin));
        const b = d.dot(n);
        const denom = 1 - b * b;
        if (denom < 1e-4) return null; // looking straight along the line
        return (w0.dot(n) - b * w0.dot(d)) / denom;
      },
      extentsAlong(axis, exceptId) {
        const stage = stageRef.current;
        if (!stage) return [];
        const out: number[] = [0]; // the ground
        const key = (['x', 'y', 'z'] as const)[axis];
        for (const obj of stage.model.children) {
          if (!(obj instanceof THREE.Mesh) || !obj.userData.pickable || obj.userData.id === exceptId) continue;
          const box = boxOf(obj);
          out.push(box.min[key], box.max[key]);
        }
        return out;
      },
    };
    setPicker(picker);
    return () => {
      if (stageRef.current) clearHighlight(stageRef.current);
      clearPicker(picker);
    };
  }, [supported]);

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
    stage.raycaster.setFromCamera(ndc, stage.rig.active);
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
    // Towards the horizon (or above it) the floor is too far away to draw on: keep the last point.
    const far = Math.max(200, stage.rig.distance * 8);
    if (!world || stage.camera.position.distanceTo(world) > far) return last?.pick ?? null;
    const distance = stage.camera.position.distanceTo(world);
    const metresPerPx = stage.rig.parallel
      ? stage.rig.metresPerPixel(rect.height)
      : (2 * distance * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2)) / rect.height;
    s.setPx3d(metresPerPx / M_PER_UNIT);
    const pick = { plan: { x: world.x / M_PER_UNIT, y: world.z / M_PER_UNIT }, world, id };
    pickRef.current = { x: clientX, y: clientY, pick };
    return pick;
  }

  /** Where a plan point on the floor being drawn appears on screen (far off-screen when behind the camera). */
  function project(p: Point): Point {
    const stage = stageRef.current;
    if (!stage) return { x: NaN, y: NaN };
    const s = plannerStore.getState();
    const v = new THREE.Vector3(p.x * M_PER_UNIT, levelBaseM(s.doc, s.activeLevel, s.wallHeightMm), p.y * M_PER_UNIT);
    v.project(stage.rig.active);
    if (v.z > 1) return { x: NaN, y: NaN };
    const r = stage.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }

  const input = usePlanInput(
    (e) => pickAt(e.clientX, e.clientY)?.plan ?? pickRef.current?.pick.plan ?? { x: 0, y: 0 },
    onContextMenu,
    (e) => pickAt(e.clientX, e.clientY)?.id ?? null,
    { show: setBox, project },
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
      // SketchUp turns round the point under the pointer.
      const stage = stageRef.current;
      const under = mode === 'orbit' ? pickAt(e.clientX, e.clientY) : null;
      if (stage && under) stage.rig.pivotAbout(under.world);
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
      {box && <SelectionBox box={box} host={hostRef.current} />}
      <div
        ref={labelRef}
        data-testid="snap-label-3d"
        className="pointer-events-none absolute hidden rounded-sm bg-raised/90 px-1 text-[11px] text-ink shadow-popover"
      />
      <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <button onClick={resetView} className={btn}>
            Reset view
          </button>
          <select
            aria-label="Standard view"
            className={btn}
            value=""
            onChange={(e) => {
              if (e.target.value) requestView(e.target.value as StandardView);
            }}
          >
            <option value="">Views…</option>
            <option value="top">Top</option>
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="iso">Iso</option>
          </select>
          <button
            onClick={toggleParallel}
            className={btn}
            aria-pressed={parallel}
            title="Parallel projection: no perspective, as for elevations"
          >
            {parallel ? 'Parallel' : 'Perspective'}
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

/** The selection box being dragged in the 3D view. */
function SelectionBox({ box, host }: { box: Bounds; host: HTMLElement | null }) {
  const r = host?.getBoundingClientRect();
  if (!r) return null;
  return (
    <div
      data-testid="selection-box"
      className="pointer-events-none absolute border border-accent bg-accent/10"
      style={{
        left: box.minX - r.left,
        top: box.minY - r.top,
        width: box.maxX - box.minX,
        height: box.maxY - box.minY,
      }}
    />
  );
}

/** Layout (drafting) lines, lying faintly on their floors. */
function layoutLines(doc: PlanDoc, wallHeightMm: number): THREE.Object3D {
  const byLevel = new Map<string, THREE.Vector3[]>();
  for (const el of doc.elements) {
    if (el.type !== 'line') continue;
    const level = el.levelId ?? 'ground';
    const y = levelBaseM(doc, level, wallHeightMm) + (el.elevMm ?? 0) / 1000 + 0.012;
    const pts = byLevel.get(level) ?? [];
    pts.push(
      new THREE.Vector3(el.x1 * M_PER_UNIT, y, el.y1 * M_PER_UNIT),
      new THREE.Vector3(el.x2 * M_PER_UNIT, y, el.y2 * M_PER_UNIT),
    );
    byLevel.set(level, pts);
  }
  const group = new THREE.Group();
  for (const [level, pts] of byLevel) {
    const lines = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: '#57534e', transparent: true, opacity: 0.7 }),
    );
    lines.userData = { level };
    group.add(lines);
  }
  return group;
}
