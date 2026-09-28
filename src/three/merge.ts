import * as THREE from 'three';

/** One part's triangles inside a merged mesh: where they start and how many indices, and its box. */
export interface PartRange {
  id?: string;
  /** The first index of the part's triangles in the merged geometry. */
  start: number;
  /** How many indices (three per triangle). */
  count: number;
  /** The part's box in the scene: min x, y, z, then max x, y, z. */
  box: [number, number, number, number, number, number];
}

/** A typed array that grows as numbers are added. */
class Grow<T extends Float32Array | Uint32Array> {
  size = 0;
  private data: T;
  constructor(private readonly make: new (n: number) => T) {
    this.data = new make(1024);
  }
  private room(n: number) {
    if (this.size + n <= this.data.length) return;
    const bigger = new this.make(Math.max(this.data.length * 2, this.size + n));
    bigger.set(this.data);
    this.data = bigger;
  }
  push1(a: number) {
    this.room(1);
    this.data[this.size++] = a;
  }
  push2(a: number, b: number) {
    this.room(2);
    this.data[this.size++] = a;
    this.data[this.size++] = b;
  }
  push3(a: number, b: number, c: number) {
    this.room(3);
    this.data[this.size++] = a;
    this.data[this.size++] = b;
    this.data[this.size++] = c;
  }
  /** The numbers added, in an array of their own length. */
  done(): T {
    return this.data.slice(0, this.size) as T;
  }
}

interface Bucket {
  material: THREE.Material;
  level?: string;
  cast: boolean;
  receive: boolean;
  pos: Grow<Float32Array>;
  normal: Grow<Float32Array>;
  uv: Grow<Float32Array>;
  index: Grow<Uint32Array>;
  ranges: PartRange[];
  /** The mesh that added the last range, so its triangles stay in one run. */
  last?: THREE.Mesh;
}

/**
 * The building's parts merged, so the graphics card draws a big plan in a few calls instead of one
 * per wall, slab and panel (and one more for each one's edges). Meshes that share a material, a
 * floor and their shadow settings become one mesh, which keeps where each part's triangles are
 * (`userData.ranges`) so a click still finds the part; edge lines become one set per floor.
 * Anything else in the group is kept as it is. The parts' own geometry is freed.
 */
export function mergeParts(group: THREE.Group): THREE.Group {
  const out = new THREE.Group();
  const buckets = new Map<string, Bucket>();
  const lines = new Map<string, { material: THREE.Material; level?: string; pos: Grow<Float32Array> }>();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const obj of [...group.children]) {
    obj.updateMatrix();
    if (obj instanceof THREE.Mesh) {
      const g = obj.geometry as THREE.BufferGeometry;
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const uv = g.getAttribute('uv');
      const index = g.getIndex();
      const total = index ? index.count : pos.count;
      const mats = Array.isArray(obj.material) ? obj.material : null;
      const groups = mats && g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
      normalMatrix.getNormalMatrix(obj.matrix);
      const level: string | undefined = obj.userData.level;
      for (const part of groups) {
        const material = mats ? mats[part.materialIndex ?? 0] : (obj.material as THREE.Material);
        if (!material) continue;
        const key = `${level}|${material.uuid}|${obj.castShadow}|${obj.receiveShadow}`;
        let b = buckets.get(key);
        if (!b) {
          b = {
            material,
            level,
            cast: obj.castShadow,
            receive: obj.receiveShadow,
            pos: new Grow(Float32Array),
            normal: new Grow(Float32Array),
            uv: new Grow(Float32Array),
            index: new Grow(Uint32Array),
            ranges: [],
          };
          buckets.set(key, b);
        }
        let range = b.last === obj ? b.ranges[b.ranges.length - 1] : undefined;
        if (!range) {
          range = {
            id: obj.userData.id,
            start: b.index.size,
            count: 0,
            box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity],
          };
          b.ranges.push(range);
          b.last = obj;
        }
        // Each vertex once per part, even when it is used by several of its triangles.
        const seen = new Int32Array(pos.count).fill(-1);
        const end = Math.min(part.start + part.count, total);
        for (let i = part.start; i < end; i++) {
          const vi = index ? index.getX(i) : i;
          let at = seen[vi];
          if (at < 0) {
            at = b.pos.size / 3;
            seen[vi] = at;
            v.fromBufferAttribute(pos, vi).applyMatrix4(obj.matrix);
            n.fromBufferAttribute(nrm, vi).applyMatrix3(normalMatrix).normalize();
            b.pos.push3(v.x, v.y, v.z);
            b.normal.push3(n.x, n.y, n.z);
            b.uv.push2(uv ? uv.getX(vi) : 0, uv ? uv.getY(vi) : 0);
            const box = range.box;
            box[0] = Math.min(box[0], v.x);
            box[1] = Math.min(box[1], v.y);
            box[2] = Math.min(box[2], v.z);
            box[3] = Math.max(box[3], v.x);
            box[4] = Math.max(box[4], v.y);
            box[5] = Math.max(box[5], v.z);
          }
          b.index.push1(at);
        }
        range.count = b.index.size - range.start;
      }
      g.dispose();
    } else if (obj instanceof THREE.LineSegments && !Array.isArray(obj.material)) {
      const level: string | undefined = obj.userData.level;
      const key = `${level}|${obj.material.uuid}`;
      let l = lines.get(key);
      if (!l) lines.set(key, (l = { material: obj.material, level, pos: new Grow(Float32Array) }));
      const pos = obj.geometry.getAttribute('position');
      const index = obj.geometry.getIndex();
      const count = index ? index.count : pos.count;
      for (let i = 0; i < count; i++) {
        v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(obj.matrix);
        l.pos.push3(v.x, v.y, v.z);
      }
      obj.geometry.dispose();
    } else {
      out.add(obj);
    }
  }

  for (const b of buckets.values()) {
    if (!b.index.size) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(b.pos.done(), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(b.normal.done(), 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(b.uv.done(), 2));
    geometry.setIndex(new THREE.BufferAttribute(b.index.done(), 1));
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.userData = { level: b.level, ranges: b.ranges, base: b.material, cast: b.cast };
    mesh.raycast = partwiseRaycast(mesh, b.ranges);
    out.add(mesh);
  }
  for (const l of lines.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(l.pos.done(), 3));
    const segs = new THREE.LineSegments(geometry, l.material);
    // Clicks land on faces, never on edges: don't make every pointer move test every edge.
    segs.raycast = () => {};
    segs.userData = { level: l.level };
    out.add(segs);
  }
  return out;
}

/**
 * A merged mesh's hit test: only the triangles of the parts whose box the ray passes through, so
 * pointing at a big plan stays as quick as it was with a mesh per part.
 */
function partwiseRaycast(mesh: THREE.Mesh, ranges: PartRange[]): THREE.Mesh['raycast'] {
  const boxes = ranges.map((r) =>
    new THREE.Box3(new THREE.Vector3(...r.box.slice(0, 3)), new THREE.Vector3(...r.box.slice(3))).expandByScalar(1e-4),
  );
  const whole = new THREE.Box3();
  boxes.forEach((b) => whole.union(b));
  return (raycaster, intersects) => {
    // The merged mesh sits where it was built: only its parent can have moved.
    const toLocal = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const ray = raycaster.ray.clone().applyMatrix4(toLocal);
    if (!ray.intersectsBox(whole)) return;
    const range = mesh.geometry.drawRange;
    const saved = [range.start, range.count] as const;
    for (let i = 0; i < ranges.length; i++) {
      if (!ray.intersectsBox(boxes[i])) continue;
      mesh.geometry.setDrawRange(ranges[i].start, ranges[i].count);
      THREE.Mesh.prototype.raycast.call(mesh, raycaster, intersects);
    }
    mesh.geometry.setDrawRange(...saved);
  };
}

/** The part a merged mesh's triangle belongs to (by the triangle's number). */
export function partAt(ranges: PartRange[], faceIndex: number): PartRange | undefined {
  const at = faceIndex * 3;
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (at < r.start) hi = mid - 1;
    else if (at >= r.start + r.count) lo = mid + 1;
    else return r;
  }
  return undefined;
}

/**
 * Runs of parts drawn in the same look, for a merged mesh's groups: each part's look is a material
 * number (0 as usual, 1 lit, 2 red); neighbours with the same look share one draw.
 */
export function lookRuns(ranges: PartRange[], look: (id: string | undefined) => number) {
  const runs: { start: number; count: number; look: number }[] = [];
  for (const r of ranges) {
    const k = look(r.id);
    const prev = runs[runs.length - 1];
    if (prev && prev.look === k && prev.start + prev.count === r.start) prev.count += r.count;
    else runs.push({ start: r.start, count: r.count, look: k });
  }
  return runs;
}
