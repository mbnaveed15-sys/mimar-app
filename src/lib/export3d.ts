import { ShapeUtils, Vector2 } from 'three';
import type { Model3D, Solid } from '../three/model';

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

/** The six faces of a box solid, turned and placed as in the 3D view. */
function addBox(mesh: ExportMesh, s: Solid) {
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
  face(mesh, [c(-1, 0, 1), c(1, 0, 1), c(1, 1, 1), c(-1, 1, 1)], turn(0, 1));
  face(mesh, [c(-1, 0, -1), c(-1, 1, -1), c(1, 1, -1), c(1, 0, -1)], turn(0, -1));
}

/** Triangles of a flat outline (x, z in metres), wound so they face up. */
function triangulate(points: [number, number][]): [number, number, number][] {
  const tris = ShapeUtils.triangulateShape(
    points.map(([x, z]) => new Vector2(x, z)),
    [],
  );
  return tris.map(([a, b, c]) => {
    const [ax, az] = points[a];
    const [bx, bz] = points[b];
    const [cx, cz] = points[c];
    // Facing +y needs (b - a) × (c - a) to point up.
    const up = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    return up >= 0 ? [a, b, c] : [a, c, b];
  });
}

/** A flat outline at height y, facing up (or down). */
function addFlat(mesh: ExportMesh, points: [number, number][], y: number, down = false) {
  const start = mesh.positions.length / 3;
  for (const [x, z] of points) {
    mesh.positions.push(x, y, z);
    mesh.normals.push(0, down ? -1 : 1, 0);
  }
  for (const [a, b, c] of triangulate(points))
    mesh.indices.push(...(down ? [start + a, start + c, start + b] : [start + a, start + b, start + c]));
}

/** An outline extruded upward: a slab. */
function addPrism(mesh: ExportMesh, points: [number, number][], y0: number, h: number) {
  addFlat(mesh, points, y0 + h);
  addFlat(mesh, points, y0, true);
  // Sides face away from the middle of the outline.
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cz = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  points.forEach(([ax, az], i) => {
    const [bx, bz] = points[(i + 1) % points.length];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    let n: V3 = [(bz - az) / len, 0, -(bx - ax) / len];
    if (n[0] * ((ax + bx) / 2 - cx) + n[2] * ((az + bz) / 2 - cz) < 0) n = [-n[0], 0, -n[2]];
    const quad: V3[] = [
      [ax, y0, az],
      [bx, y0, bz],
      [bx, y0 + h, bz],
      [ax, y0 + h, az],
    ];
    // Wind the quad counter-clockwise as seen from outside: its normal is (b - a) × (0, h, 0).
    const cross: V3 = [-(bz - az) * h, 0, (bx - ax) * h];
    const outward = cross[0] * n[0] + cross[2] * n[2] > 0;
    face(mesh, outward ? quad : [...quad].reverse(), n);
  });
}

/** Every part of the 3D model as meshes grouped by what they are and their material. */
export function modelMeshes(model: Model3D): ExportMesh[] {
  const set = new MeshSet();
  for (const s of model.solids) addBox(set.mesh(s.role, s.color, s.opacity ?? 1, s.finish?.name), s);
  for (const f of model.floors)
    if (f.points.length >= 3) addFlat(set.mesh('floor', f.color, 1, f.finish?.name), f.points, f.y + FLOOR_LIFT);
  for (const s of model.slabs)
    if (s.points.length >= 3) addPrism(set.mesh('slab', s.color, 1, s.finish?.name), s.points, s.y0, s.h);
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
