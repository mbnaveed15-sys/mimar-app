import { ShapeUtils, Vector2 } from 'three';
import type { Finish, Model3D, Panel, Sides, Slab3D, Solid } from '../three/model';

/** One mesh of triangles, all in one material, in metres with y up. */
export interface ExportMesh {
  name: string;
  material: ExportMaterial;
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface ExportMaterial {
  name: string;
  /** #rrggbb */
  color: string;
  opacity: number;
}

const FLOOR_LIFT = 0.005;

const hex = (c: string) => c.replace('#', '').toUpperCase();
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_|_$/g, '') || 'material';

/** Collects triangles into one mesh per role and material. */
class MeshSet {
  private meshes = new Map<string, ExportMesh>();

  mesh(kind: string, color: string, opacity = 1, materialName?: string): ExportMesh {
    const matName = safe(materialName ?? `${kind}_${hex(color)}`);
    const key = `${kind}/${matName}/${color}/${opacity}`;
    let mesh = this.meshes.get(key);
    if (!mesh) {
      mesh = {
        name: safe(`${kind}_${matName}`),
        material: { name: matName, color, opacity },
        positions: [],
        normals: [],
        indices: [],
      };
      this.meshes.set(key, mesh);
    }
    return mesh;
  }

  list(): ExportMesh[] {
    // Different roles can share a material; name each material once, by what it looks like.
    const byName = new Map<string, ExportMaterial>();
    for (const m of this.meshes.values()) {
      const seen = byName.get(m.material.name);
      if (seen && (seen.color !== m.material.color || seen.opacity !== m.material.opacity))
        m.material = { ...m.material, name: `${m.material.name}_${hex(m.material.color)}` };
      else byName.set(m.material.name, m.material);
    }
    return [...this.meshes.values()];
  }
}

type V3 = [number, number, number];

/** Add a flat face (3 or 4 corners, counter-clockwise seen from the front) with its normal. */
function face(mesh: ExportMesh, corners: V3[], normal: V3) {
  const start = mesh.positions.length / 3;
  for (const c of corners) {
    mesh.positions.push(...c);
    mesh.normals.push(...normal);
  }
  for (let i = 1; i < corners.length - 1; i++) mesh.indices.push(start, start + i, start + i + 1);
}

/** Which mesh each face goes in: a wall's side A (+z, 1), side B (-z, -1), or the rest (0). */
type MeshFor = (side: 1 | -1 | 0) => ExportMesh;

/** The six faces of a box solid, turned and placed as in the 3D view. */
function addBox(meshFor: MeshFor, s: Solid) {
  const mesh = meshFor(0);
  const cos = Math.cos(s.rotY);
  const sin = Math.sin(s.rotY);
  // Three.js turns by rotY about y: x' = x cos + z sin, z' = -x sin + z cos.
  const place = (x: number, y: number, z: number): V3 => [s.x + x * cos + z * sin, s.y0 + y, s.z - x * sin + z * cos];
  const turn = (x: number, z: number): V3 => [x * cos + z * sin, 0, -x * sin + z * cos];
  const [w, h, d] = [s.w / 2, s.h, s.d / 2];
  const c = (i: number, j: number, k: number) => place(i * w, j * h, k * d);
  face(mesh, [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)], [0, 1, 0]);
  face(mesh, [c(-1, 0, -1), c(1, 0, -1), c(1, 0, 1), c(-1, 0, 1)], [0, -1, 0]);
  face(mesh, [c(1, 0, -1), c(1, 1, -1), c(1, 1, 1), c(1, 0, 1)], turn(1, 0));
  face(mesh, [c(-1, 0, -1), c(-1, 0, 1), c(-1, 1, 1), c(-1, 1, -1)], turn(-1, 0));
  face(meshFor(1), [c(-1, 0, 1), c(1, 0, 1), c(1, 1, 1), c(-1, 1, 1)], turn(0, 1));
  face(meshFor(-1), [c(-1, 0, -1), c(-1, 1, -1), c(1, 1, -1), c(1, 0, -1)], turn(0, -1));
}

type Ring = [number, number][];

/** Signed area of an outline (positive when it runs anticlockwise in its own a/b axes). */
function area(ring: Ring): number {
  let sum = 0;
  ring.forEach(([ax, ay], i) => {
    const [bx, by] = ring[(i + 1) % ring.length];
    sum += ax * by - bx * ay;
  });
  return sum / 2;
}

/**
 * An outline less its holes, given in its own flat axes (a, b), pushed through from t = 0 to 1:
 * both caps and every side, including the sides of the holes. `at` places a point in the scene
 * and `dir` turns a direction given in (a, b, t) into the scene.
 */
function addExtrusion(
  mesh: ExportMesh,
  outer: Ring,
  holes: Ring[],
  at: (a: number, b: number, t: number) => V3,
  dir: (a: number, b: number, t: number) => V3,
  /** The mesh for each cap (t = 0, t = 1), when they differ from the rest. */
  capMesh: (t: 0 | 1) => ExportMesh = () => mesh,
) {
  const tris = ShapeUtils.triangulateShape(
    outer.map(([a, b]) => new Vector2(a, b)),
    holes.map((h) => h.map(([a, b]) => new Vector2(a, b))),
  );
  const all = [...outer, ...holes.flat()];
  for (const t of [0, 1] as const) {
    const cap = capMesh(t);
    const start = cap.positions.length / 3;
    const n = dir(0, 0, t ? 1 : -1);
    for (const [a, b] of all) {
      cap.positions.push(...at(a, b, t));
      cap.normals.push(...n);
    }
    for (const [i, j, k] of tris) {
      // Keep each cap's triangles facing out: check against the cap's normal.
      const [p, q, r] = [at(...all[i], t), at(...all[j], t), at(...all[k], t)];
      const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0;
      cap.indices.push(...(out ? [start + i, start + j, start + k] : [start + i, start + k, start + j]));
    }
  }
  // Sides face away from the solid: out of the outline, and into each hole.
  for (const [ring, isHole] of [[outer, false], ...holes.map((h) => [h, true] as const)] as [Ring, boolean][]) {
    const turn = (area(ring) >= 0 ? 1 : -1) * (isHole ? -1 : 1);
    ring.forEach(([a0, b0], i) => {
      const [a1, b1] = ring[(i + 1) % ring.length];
      const len = Math.hypot(a1 - a0, b1 - b0) || 1;
      const n = dir(((b1 - b0) / len) * turn, (-(a1 - a0) / len) * turn, 0);
      const quad: V3[] = [at(a0, b0, 0), at(a1, b1, 0), at(a1, b1, 1), at(a0, b0, 1)];
      const u = quad[1].map((c, k) => c - quad[0][k]);
      const v = quad[3].map((c, k) => c - quad[0][k]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out = cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] >= 0;
      face(mesh, out ? quad : [...quad].reverse(), n);
    });
  }
}

/** A flat outline at height y, facing up. */
function addFlat(mesh: ExportMesh, points: Ring, y: number) {
  const tris = ShapeUtils.triangulateShape(
    points.map(([x, z]) => new Vector2(x, z)),
    [],
  );
  const start = mesh.positions.length / 3;
  for (const [x, z] of points) {
    mesh.positions.push(x, y, z);
    mesh.normals.push(0, 1, 0);
  }
  for (const [a, b, c] of tris) {
    const [ax, az] = points[a];
    const [bx, bz] = points[b];
    const [cx, cz] = points[c];
    // Facing +y needs (b - a) × (c - a) to point up.
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    mesh.indices.push(...(up >= 0 ? [start + a, start + b, start + c] : [start + a, start + c, start + b]));
  }
}

/** An outline (less its holes) extruded upward: a slab or a block. */
function addPrism(mesh: ExportMesh, s: Slab3D) {
  addExtrusion(
    mesh,
    s.points,
    s.holes ?? [],
    (x, z, t) => [x, s.y0 + t * s.h, z],
    (x, z, t) => [x, t, z],
  );
}

/** An upright panel: its outline (less holes) turned and placed like a box, pushed through its depth. */
function addPanel(meshFor: MeshFor, p: Panel) {
  const cos = Math.cos(p.rotY);
  const sin = Math.sin(p.rotY);
  // Three.js turns by rotY about y: x' = x cos + z sin, z' = -x sin + z cos.
  const place = (x: number, y: number, z: number): V3 => [p.x + x * cos + z * sin, p.y0 + y, p.z - x * sin + z * cos];
  addExtrusion(
    meshFor(0),
    p.outline,
    p.holes ?? [],
    (u, v, t) => place(u, v, (t - 0.5) * p.depth),
    (u, v, t) => [u * cos + t * sin, v, -u * sin + t * cos],
    (t) => meshFor(t ? 1 : -1),
  );
}

/** Every part of the 3D model as meshes grouped by what they are and their material. Flat shapes are left out. */
export function modelMeshes(model: Model3D): ExportMesh[] {
  const set = new MeshSet();
  /** Each face's mesh: a wall side's own material where it has one, else the part's. */
  const meshFor =
    (part: { role: string; color: string; opacity?: number; finish?: Finish; sides?: Sides }): MeshFor =>
    (side) => {
      const look = side === 1 ? part.sides?.plus : side === -1 ? part.sides?.minus : undefined;
      const { color, finish } = look ?? part;
      return set.mesh(part.role, color, part.opacity ?? 1, finish?.name);
    };
  for (const s of model.solids) addBox(meshFor(s), s);
  for (const f of model.floors)
    if (f.points.length >= 3) addFlat(set.mesh('floor', f.color, 1, f.finish?.name), f.points, f.y + FLOOR_LIFT);
  for (const s of [...model.slabs, ...model.blocks])
    if (s.points.length >= 3 && s.role !== 'shape') addPrism(set.mesh(s.role ?? 'slab', s.color, 1, s.finish?.name), s);
  for (const p of model.panels) if (p.outline.length >= 3 && p.role !== 'shape') addPanel(meshFor(p), p);
  return set.list().filter((m) => m.indices.length > 0);
}

const rgb01 = (color: string): V3 => {
  const n = parseInt(hex(color).padEnd(6, '0').slice(0, 6), 16) || 0;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (n: number) => (Math.abs(n) < 1e-9 ? '0' : String(Math.round(n * 1e6) / 1e6));

/** Wavefront OBJ and its MTL: open in 3ds Max, Rhino, Revit, Blender, Twinmotion and most others. */
export function toObj(meshes: ExportMesh[], mtlName: string): { obj: string; mtl: string } {
  const obj = ['# Mimar 3D export (metres, y up)', `mtllib ${mtlName}`];
  let offset = 1;
  for (const m of meshes) {
    obj.push(`o ${m.name}`);
    for (let i = 0; i < m.positions.length; i += 3)
      obj.push(`v ${f(m.positions[i])} ${f(m.positions[i + 1])} ${f(m.positions[i + 2])}`);
    for (let i = 0; i < m.normals.length; i += 3)
      obj.push(`vn ${f(m.normals[i])} ${f(m.normals[i + 1])} ${f(m.normals[i + 2])}`);
    obj.push(`usemtl ${m.material.name}`);
    for (let i = 0; i < m.indices.length; i += 3) {
      const [a, b, c] = [m.indices[i], m.indices[i + 1], m.indices[i + 2]].map((x) => x + offset);
      obj.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
    }
    offset += m.positions.length / 3;
  }
  const seen = new Set<string>();
  const mtl = ['# Mimar materials'];
  for (const { material } of meshes) {
    if (seen.has(material.name)) continue;
    seen.add(material.name);
    const [r, g, b] = rgb01(material.color);
    mtl.push(
      `newmtl ${material.name}`,
      `Kd ${f(r)} ${f(g)} ${f(b)}`,
      `Ka 0 0 0`,
      `d ${f(material.opacity)}`,
      `illum 1`,
      '',
    );
  }
  return { obj: obj.join('\n') + '\n', mtl: mtl.join('\n') };
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** COLLADA (.dae): SketchUp imports it directly (File › Import), as do Twinmotion and Blender. */
export function toDae(meshes: ExportMesh[], title: string): string {
  const materials = [...new Map(meshes.map((m) => [m.material.name, m.material])).values()];
  const id = (s: string) => xml(safe(s));
  const effects = materials
    .map((mat) => {
      const [r, g, b] = rgb01(mat.color);
      return `    <effect id="${id(mat.name)}-fx"><profile_COMMON><technique sid="common"><lambert>
      <diffuse><color>${f(r)} ${f(g)} ${f(b)} 1</color></diffuse>
      <transparency><float>${f(mat.opacity)}</float></transparency>
    </lambert></technique></profile_COMMON></effect>`;
    })
    .join('\n');
  const mats = materials
    .map(
      (mat) =>
        `    <material id="${id(mat.name)}" name="${xml(mat.name)}"><instance_effect url="#${id(mat.name)}-fx"/></material>`,
    )
    .join('\n');
  const geometries = meshes
    .map((m, i) => {
      const g = `g${i}`;
      const n = m.positions.length / 3;
      const p = [];
      for (const v of m.indices) p.push(v, v);
      return `    <geometry id="${g}" name="${xml(m.name)}"><mesh>
      <source id="${g}-pos"><float_array id="${g}-pos-a" count="${m.positions.length}">${m.positions.map(f).join(' ')}</float_array>
        <technique_common><accessor source="#${g}-pos-a" count="${n}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
      <source id="${g}-nrm"><float_array id="${g}-nrm-a" count="${m.normals.length}">${m.normals.map(f).join(' ')}</float_array>
        <technique_common><accessor source="#${g}-nrm-a" count="${n}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
      <vertices id="${g}-v"><input semantic="POSITION" source="#${g}-pos"/></vertices>
      <triangles material="mat" count="${m.indices.length / 3}">
        <input semantic="VERTEX" source="#${g}-v" offset="0"/><input semantic="NORMAL" source="#${g}-nrm" offset="1"/>
        <p>${p.join(' ')}</p>
      </triangles>
    </mesh></geometry>`;
    })
    .join('\n');
  const nodes = meshes
    .map(
      (
        m,
        i,
      ) => `      <node id="n${i}" name="${xml(m.name)}"><instance_geometry url="#g${i}"><bind_material><technique_common>
        <instance_material symbol="mat" target="#${id(m.material.name)}"/>
      </technique_common></bind_material></instance_geometry></node>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
  <asset><contributor><authoring_tool>Mimar</authoring_tool></contributor><title>${xml(title)}</title><unit name="meter" meter="1"/><up_axis>Y_UP</up_axis></asset>
  <library_effects>
${effects}
  </library_effects>
  <library_materials>
${mats}
  </library_materials>
  <library_geometries>
${geometries}
  </library_geometries>
  <library_visual_scenes>
    <visual_scene id="scene" name="${xml(title)}">
${nodes}
    </visual_scene>
  </library_visual_scenes>
  <scene><instance_visual_scene url="#scene"/></scene>
</COLLADA>
`;
}

/** Binary glTF (.glb): for Twinmotion, Blender, Unreal and Windows 3D Viewer. */
export function toGlb(meshes: ExportMesh[]): Uint8Array<ArrayBuffer> {
  const materials = [...new Map(meshes.map((m) => [m.material.name, m.material])).values()];
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const add = (data: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
    chunks.push(bytes);
    byteLength += bytes.length; // always a multiple of 4 for these types
    return bufferViews.length - 1;
  };
  const gltfMeshes = meshes.map((m) => {
    const pos = new Float32Array(m.positions);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i++) {
      min[i % 3] = Math.min(min[i % 3], pos[i]);
      max[i % 3] = Math.max(max[i % 3], pos[i]);
    }
    const count = pos.length / 3;
    accessors.push({ bufferView: add(pos, 34962), componentType: 5126, count, type: 'VEC3', min, max });
    const position = accessors.length - 1;
    accessors.push({ bufferView: add(new Float32Array(m.normals), 34962), componentType: 5126, count, type: 'VEC3' });
    const normal = accessors.length - 1;
    const idx = new Uint32Array(m.indices);
    accessors.push({ bufferView: add(idx, 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
    return {
      name: m.name,
      primitives: [
        {
          attributes: { POSITION: position, NORMAL: normal },
          indices: accessors.length - 1,
          material: materials.findIndex((x) => x.name === m.material.name),
        },
      ],
    };
  });
  const json = {
    asset: { version: '2.0', generator: 'Mimar' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes: gltfMeshes,
    materials: materials.map((mat) => {
      const [r, g, b] = rgb01(mat.color).map(toLinear);
      return {
        name: mat.name,
        pbrMetallicRoughness: { baseColorFactor: [r, g, b, mat.opacity], metallicFactor: 0, roughnessFactor: 0.85 },
        doubleSided: true,
        ...(mat.opacity < 1 ? { alphaMode: 'BLEND' } : {}),
      };
    }),
    accessors,
    bufferViews,
    buffers: [{ byteLength }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
  const total = 12 + 8 + jsonPadded + 8 + byteLength;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonPadded);
  let at = 20 + jsonPadded;
  view.setUint32(at, byteLength, true);
  view.setUint32(at + 4, 0x004e4942, true); // "BIN\0"
  at += 8;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
