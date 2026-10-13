/**
 * The building's 3D meshes and their shared materials: used by the 3D view and for 3D pictures on sheets.
 */
import * as THREE from 'three';
import { drawPattern } from '../lib/patterns';
import type { Pattern } from '../types';
import { roofMesh, type Finish, type Model3D, type Sides } from './model';
/**
 * Free a group's geometry. Materials of the building are shared and kept (see MATERIALS), so an
 * edit doesn't make the graphics card compile its shaders again; others are freed with the group.
 */
export function disposeGroup(group: THREE.Object3D) {
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
export const MATERIALS = new Map<string, THREE.Material>();
/** Materials that live on across rebuilds (the shared ones and their faded or lit variants). */
export const KEPT = new WeakSet<THREE.Material>();
export const keep = <T extends THREE.Material>(m: T): T => {
  KEPT.add(m);
  return m;
};
const EDGE_MATERIAL = keep(new THREE.LineBasicMaterial({ color: '#57534e', transparent: true, opacity: 0.35 }));
/** The edges of a box one metre each way. */
const BOX_EDGES = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
/** Edges between the sides of a round column or part (32 sides, 11.25° apart) aren't drawn. */
const ROUND_CREASE = 20;
/** A plot's setback line on the ground, dashed as on the plan. */
const GUIDE_MATERIAL = keep(new THREE.LineDashedMaterial({ color: '#44403c', dashSize: 0.3, gapSize: 0.2 }));

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

export function buildMeshes(model: Model3D): THREE.Group {
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
      // A box's twelve edges, sized to the box (quicker than finding them from its faces).
      const edges = new THREE.LineSegments(BOX_EDGES.clone(), edgeMaterial);
      edges.scale.set(geometry.parameters.width, geometry.parameters.height, geometry.parameters.depth);
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
    for (const h of floor.holes ?? []) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material(floor.color, floor.opacity ?? 1, floor.finish));
    mesh.position.y = floor.y + 0.005;
    mesh.receiveShadow = true;
    mesh.userData = { id: floor.id, level: floor.level };
    group.add(mesh);
  }

  for (const t of model.terrain ?? []) {
    if (!t.indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(t.positions, 3));
    // Patterns (the lawn's grass) laid flat in metres.
    const uv: number[] = [];
    for (let i = 0; i < t.positions.length; i += 3) uv.push(t.positions[i], t.positions[i + 2]);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(t.indices);
    geometry.computeVertexNormals();
    let mat = material(t.color, t.opacity ?? 1, t.finish);
    if (t.kind === 'road') {
      // A road lies just over the ground: keep it in front of it from afar.
      const key = `${t.color}/road`;
      let road = materials.get(key);
      if (!road) {
        road = keep(mat.clone());
        road.polygonOffset = true;
        road.polygonOffsetFactor = -2;
        road.polygonOffsetUnits = -2;
        materials.set(key, road);
      }
      mat = road;
    }
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    mesh.userData = { id: t.id, level: t.level };
    group.add(mesh);
  }

  for (const guide of model.guides ?? []) {
    const pts = guide.points.map(([x, z], i) => new THREE.Vector3(x, guide.ys?.[i] ?? guide.y, z));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), GUIDE_MATERIAL);
    line.computeLineDistances();
    line.userData = { level: guide.level };
    group.add(line);
  }

  /** A flat outline (with any holes) as a three.js shape, in its own axes. */
  const shapeOf = (outline: [number, number][], holes: [number, number][][] = [], flipY = false) => {
    const v = ([a, b]: [number, number]) => new THREE.Vector2(a, flipY ? -b : b);
    const shape = new THREE.Shape(outline.map(v));
    for (const h of holes) shape.holes.push(new THREE.Path(h.map(v)));
    return shape;
  };
  /** `crease`: the least angle (degrees) between faces drawn as an edge (more for round things). */
  const addWithEdges = (mesh: THREE.Mesh, level?: string, edges = true, crease?: number) => {
    group.add(mesh);
    if (!edges) return;
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, crease), edgeMaterial);
    lines.position.copy(mesh.position);
    lines.rotation.copy(mesh.rotation);
    lines.userData = { level };
    group.add(lines);
  };

  for (const slab of [...model.slabs, ...model.blocks, ...(model.context ?? [])]) {
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
    // Round columns and parts: no lines down the joins between the sides of the cylinder.
    const round = slab.role === 'column' || slab.role === 'furniture';
    addWithEdges(mesh, slab.level, true, round ? ROUND_CREASE : undefined);
  }

  for (const roof of model.roofs ?? []) {
    const { positions, indices } = roofMesh(roof);
    if (!indices.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    // Patterns laid in plan, in metres.
    const uv: number[] = [];
    for (let i = 0; i < positions.length; i += 3) uv.push(positions[i], positions[i + 2]);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material(roof.color, roof.opacity ?? 1, roof.finish));
    mesh.castShadow = roof.role !== 'glass';
    mesh.receiveShadow = roof.role !== 'glass';
    mesh.userData = { id: roof.id, level: roof.level };
    group.add(mesh);
    // Ridges, hips, valleys and the eaves, not the joins across a flat face.
    const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 10), edgeMaterial);
    lines.userData = { level: roof.level };
    group.add(lines);
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
