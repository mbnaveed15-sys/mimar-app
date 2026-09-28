/**
 * The natural ground of the plot, from the levels taken on it. Pure.
 *
 * The levels are joined into triangles (a Delaunay triangulation) and the ground is flat on each
 * triangle. From that come the height anywhere, contour lines, heights along a line, meshes that
 * follow the ground and the earth to move to reach a finished level.
 *
 * Coordinates: plan units (10 mm), x to the right and y down the page. Heights in millimetres.
 * Triangles run counter-clockwise in plan x/y: (b - a) × (c - a) > 0.
 */
import { pointInPolygon } from '../../geometry';
import { MM_PER_UNIT } from '../scale';
import type { Point } from '../../types';

/** A point of the natural ground: plan units across, mm up. */
export interface GroundPoint {
  x: number;
  y: number;
  z: number;
}

/** A triangle: three indices into a list of points. */
export type Tri = [number, number, number];

/** Points closer than this (plan units) on both axes are the same point. */
const SAME = 1e-6;
/** The vertex at infinity that closes the triangulation round its outer edge. */
const INF = -1;

/** Twice the signed area of a, b, c: positive when they run counter-clockwise. */
function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Positive when p is inside the circle through a, b, c (counter-clockwise). */
function inCircle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  px: number,
  py: number,
): number {
  const adx = ax - px,
    ady = ay - py,
    bdx = bx - px,
    bdy = by - py,
    cdx = cx - px,
    cdy = cy - py;
  const ad = adx * adx + ady * ady,
    bd = bdx * bdx + bdy * bdy,
    cd = cdx * cdx + cdy * cdy;
  return adx * (bdy * cd - bd * cdy) - ady * (bdx * cd - bd * cdx) + ad * (bdx * cdy - bdy * cdx);
}

/** Extent of some points (plan units), or null when there are none. */
export function boundsOf(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (!points.length) return null;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Indices of the points worth using: finite, and only the first of any that are the same. */
export function distinctPoints(points: Point[]): number[] {
  const seen = new Map<string, number[]>();
  const keep: number[] = [];
  const isSeen = (p: Point, kx: number, ky: number) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const near = seen.get(`${kx + dx},${ky + dy}`);
        if (near?.some((j) => Math.abs(points[j].x - p.x) <= SAME && Math.abs(points[j].y - p.y) <= SAME)) return true;
      }
    }
    return false;
  };
  points.forEach((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const kx = Math.floor(p.x / SAME),
      ky = Math.floor(p.y / SAME);
    if (isSeen(p, kx, ky)) return;
    const key = `${kx},${ky}`;
    const list = seen.get(key);
    if (list) list.push(i);
    else seen.set(key, [i]);
    keep.push(i);
  });
  return keep;
}

/** An order to add points in that keeps each close to the last: rows down the page, snaking. */
function snakeOrder(xs: number[], ys: number[], minY: number, maxY: number): number[] {
  const n = xs.length;
  const rows = Math.max(1, Math.ceil(Math.sqrt(n / 4)));
  const h = (maxY - minY) / rows || 1;
  const row = ys.map((y) => Math.min(rows - 1, Math.floor((y - minY) / h)));
  return xs
    .map((_, i) => i)
    .sort((i, j) => row[i] - row[j] || (row[i] % 2 ? xs[j] - xs[i] : xs[i] - xs[j]) || ys[i] - ys[j]);
}

/** Delaunay triangulation of points (indices into the array, counter-clockwise in plan x/y). */
export function delaunay(points: { x: number; y: number }[]): Tri[] {
  const ids = distinctPoints(points);
  if (ids.length < 3) return [];
  const xs = ids.map((i) => points[i].x),
    ys = ids.map((i) => points[i].y);
  const box = boundsOf(ids.map((i) => points[i]))!;
  const order = snakeOrder(xs, ys, box.minY, box.maxY);
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  const flat = 1e-12 * span * span;

  const [a] = order;
  let b = order[1];
  let c = order.slice(2).find((k) => Math.abs(orient(xs[a], ys[a], xs[b], ys[b], xs[k], ys[k])) > flat);
  if (c === undefined) return [];
  if (orient(xs[a], ys[a], xs[b], ys[b], xs[c], ys[c]) < 0) [b, c] = [c, b];

  // Each triangle: three vertices (INF for the one at infinity) and the triangle across each edge,
  // edge e running from vertex e to vertex e + 1.
  const V: number[] = [];
  const N: number[] = [];
  const alive: boolean[] = [];
  const mark: number[] = [];
  const free: number[] = [];
  let stamp = 0;
  const make = (p: number, q: number, r: number) => {
    const t = free.pop() ?? alive.length;
    V[3 * t] = p;
    V[3 * t + 1] = q;
    V[3 * t + 2] = r;
    N[3 * t] = N[3 * t + 1] = N[3 * t + 2] = -1;
    alive[t] = true;
    mark[t] = 0;
    return t;
  };
  const ghostAt = (t: number) => (V[3 * t] === INF ? 0 : V[3 * t + 1] === INF ? 1 : V[3 * t + 2] === INF ? 2 : -1);

  /** Whether p is in the circle of t, or, for a triangle at infinity, beyond its outer edge. */
  const inside = (t: number, px: number, py: number) => {
    const g = ghostAt(t);
    if (g < 0) {
      const [u, v, w] = [V[3 * t], V[3 * t + 1], V[3 * t + 2]];
      return inCircle(xs[u], ys[u], xs[v], ys[v], xs[w], ys[w], px, py) > 0;
    }
    const u = V[3 * t + ((g + 1) % 3)],
      v = V[3 * t + ((g + 2) % 3)];
    const o = orient(xs[u], ys[u], xs[v], ys[v], px, py);
    if (o !== 0) return o > 0;
    const ex = xs[v] - xs[u],
      ey = ys[v] - ys[u];
    const dot = (px - xs[u]) * ex + (py - ys[u]) * ey;
    return dot > 0 && dot < ex * ex + ey * ey;
  };

  // The first triangle and the three at infinity round it.
  const first = [make(a, b, c), make(b, a, INF), make(c, b, INF), make(a, c, INF)];
  const edges = new Map<string, number>();
  for (const t of first) for (let e = 0; e < 3; e++) edges.set(`${V[3 * t + e]},${V[3 * t + ((e + 1) % 3)]}`, t);
  for (const t of first) {
    for (let e = 0; e < 3; e++) N[3 * t + e] = edges.get(`${V[3 * t + ((e + 1) % 3)]},${V[3 * t + e]}`)!;
  }
  let last = first[0];

  const locate = (px: number, py: number) => {
    let t = last;
    const g = ghostAt(t);
    if (g >= 0) t = N[3 * t + ((g + 1) % 3)];
    const limit = 4 * alive.length + 16;
    for (let step = 0; step < limit; step++) {
      if (ghostAt(t) >= 0) return t;
      let next = -1;
      for (let i = 0; i < 3 && next < 0; i++) {
        const e = (i + step) % 3;
        const u = V[3 * t + e],
          v = V[3 * t + ((e + 1) % 3)];
        if (orient(xs[u], ys[u], xs[v], ys[v], px, py) < 0) next = N[3 * t + e];
      }
      if (next < 0) return t;
      t = next;
    }
    for (let s = 0; s < alive.length; s++) if (alive[s] && inside(s, px, py)) return s;
    return last;
  };

  for (const k of order) {
    if (k === a || k === b || k === c) continue;
    const px = xs[k],
      py = ys[k];
    const start = locate(px, py);
    stamp++;
    const cavity = [start];
    mark[start] = stamp;
    for (let i = 0; i < cavity.length; i++) {
      const t = cavity[i];
      for (let e = 0; e < 3; e++) {
        const n = N[3 * t + e];
        if (mark[n] !== stamp && inside(n, px, py)) {
          mark[n] = stamp;
          cavity.push(n);
        }
      }
    }
    // Rounding can leave an edge of the hole that the new point does not see: widen the hole.
    for (let grown = true; grown && cavity.length < alive.length;) {
      grown = false;
      for (const t of cavity) {
        for (let e = 0; e < 3; e++) {
          const n = N[3 * t + e];
          const u = V[3 * t + e],
            v = V[3 * t + ((e + 1) % 3)];
          if (mark[n] === stamp || u === INF || v === INF) continue;
          if (orient(xs[u], ys[u], xs[v], ys[v], px, py) <= 0) {
            mark[n] = stamp;
            cavity.push(n);
            grown = true;
          }
        }
      }
    }
    const rim: number[] = [];
    for (const t of cavity) {
      for (let e = 0; e < 3; e++) {
        const n = N[3 * t + e];
        if (mark[n] !== stamp) rim.push(V[3 * t + e], V[3 * t + ((e + 1) % 3)], n);
      }
    }
    for (const t of cavity) {
      alive[t] = false;
      free.push(t);
    }
    const byStart = new Map<number, number>();
    const made: number[] = [];
    for (let i = 0; i < rim.length; i += 3) {
      const [u, v, n] = [rim[i], rim[i + 1], rim[i + 2]];
      const t = make(u, v, k);
      N[3 * t] = n;
      for (let e = 0; e < 3; e++) if (V[3 * n + e] === v && V[3 * n + ((e + 1) % 3)] === u) N[3 * n + e] = t;
      byStart.set(u, t);
      made.push(t);
    }
    for (const t of made) {
      const m = byStart.get(V[3 * t + 1])!;
      N[3 * t + 1] = m;
      N[3 * m + 2] = t;
    }
    last = made.find((t) => ghostAt(t) < 0) ?? made[0];
  }

  const out: Tri[] = [];
  for (let t = 0; t < alive.length; t++) {
    if (alive[t] && ghostAt(t) < 0) out.push([ids[V[3 * t]], ids[V[3 * t + 1]], ids[V[3 * t + 2]]]);
  }
  return out;
}

/** The natural ground: triangles joining the levels, and its height anywhere. */
export interface Surface {
  points: GroundPoint[];
  triangles: Tri[];
  /** No levels: the ground is flat at ±0. */
  empty: boolean;
  /** Extent of the levels (plan units), or null when empty. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /**
   * Height (mm) at a point: inside the triangles, on the plane of the one it is in; outside them,
   * the height of the nearest point on their outer edge (so the ground stays flat beyond the last
   * level). One level: flat at its height. Two or more collinear levels: the height of the nearest
   * point on the line through them (clamped to its ends). None: 0.
   */
  heightAt(x: number, y: number): number;
}

/** Height along a line of levels: nearest point on it, between its ends, interpolated. */
function lineHeight(pts: GroundPoint[]): (x: number, y: number) => number {
  const ids = distinctPoints(pts);
  const a = pts[ids[0]];
  if (ids.length === 1) return () => a.z;
  let far = a;
  for (const i of ids)
    if (Math.hypot(pts[i].x - a.x, pts[i].y - a.y) > Math.hypot(far.x - a.x, far.y - a.y)) far = pts[i];
  const len = Math.hypot(far.x - a.x, far.y - a.y);
  const ux = (far.x - a.x) / len,
    uy = (far.y - a.y) / len;
  const stations = ids
    .map((i) => ({ t: (pts[i].x - a.x) * ux + (pts[i].y - a.y) * uy, z: pts[i].z }))
    .sort((p, q) => p.t - q.t)
    .filter((s, i, all) => i === 0 || s.t - all[i - 1].t > 1e-9);
  return (x, y) => {
    const t = (x - a.x) * ux + (y - a.y) * uy;
    if (t <= stations[0].t) return stations[0].z;
    let lo = 0,
      hi = stations.length - 1;
    if (t >= stations[hi].t) return stations[hi].z;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (stations[mid].t <= t) lo = mid;
      else hi = mid;
    }
    const s = stations[lo],
      e = stations[hi];
    return s.z + ((t - s.t) / (e.t - s.t)) * (e.z - s.z);
  };
}

/** Height on the triangles, found through a grid of cells, or on their outer edge beyond them. */
function meshHeight(
  pts: GroundPoint[],
  tris: Tri[],
  box: { minX: number; minY: number; maxX: number; maxY: number },
): (x: number, y: number) => number {
  const T = tris.length;
  // Per triangle: first corner, the two edges from it, 1 / their cross product and the two rises.
  const k = new Float64Array(T * 10);
  tris.forEach(([i, j, l], t) => {
    const p = pts[i],
      q = pts[j],
      r = pts[l];
    const dx1 = q.x - p.x,
      dy1 = q.y - p.y,
      dx2 = r.x - p.x,
      dy2 = r.y - p.y;
    const det = dx1 * dy2 - dx2 * dy1;
    k.set([p.x, p.y, p.z, dx1, dy1, dx2, dy2, det > 0 ? 1 / det : 0, q.z - p.z, r.z - p.z], 10 * t);
  });

  const w = box.maxX - box.minX || 1,
    h = box.maxY - box.minY || 1;
  const gx = Math.max(1, Math.min(1024, Math.round(Math.sqrt((T * w) / h)))),
    gy = Math.max(1, Math.min(1024, Math.round(T / gx)));
  const cw = w / gx,
    ch = h / gy;
  const cellX = (x: number) => Math.min(gx - 1, Math.max(0, Math.floor((x - box.minX) / cw)));
  const cellY = (y: number) => Math.min(gy - 1, Math.max(0, Math.floor((y - box.minY) / ch)));
  const range = tris.map(([i, j, l]) => {
    const xs = [pts[i].x, pts[j].x, pts[l].x],
      ys = [pts[i].y, pts[j].y, pts[l].y];
    return [cellX(Math.min(...xs)), cellX(Math.max(...xs)), cellY(Math.min(...ys)), cellY(Math.max(...ys))];
  });
  const start = new Int32Array(gx * gy + 1);
  for (const [x0, x1, y0, y1] of range) {
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) start[cy * gx + cx + 1]++;
  }
  for (let c = 0; c < gx * gy; c++) start[c + 1] += start[c];
  const fill = start.slice(0, gx * gy);
  const list = new Int32Array(start[gx * gy]);
  range.forEach(([x0, x1, y0, y1], t) => {
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) list[fill[cy * gx + cx]++] = t;
  });

  const use = new Map<number, number>();
  const n = pts.length;
  for (const tri of tris) {
    for (let e = 0; e < 3; e++) {
      const i = tri[e],
        j = tri[(e + 1) % 3];
      const key = Math.min(i, j) * n + Math.max(i, j);
      use.set(key, (use.get(key) ?? 0) + 1);
    }
  }
  const hull: number[] = [];
  for (const [key, count] of use) if (count === 1) hull.push(Math.floor(key / n), key % n);

  const onPlane = (t: number, x: number, y: number) => {
    const o = 10 * t;
    const px = x - k[o],
      py = y - k[o + 1];
    const l1 = (px * k[o + 6] - py * k[o + 5]) * k[o + 7],
      l2 = (k[o + 3] * py - k[o + 4] * px) * k[o + 7];
    return { l: Math.min(l1, l2, 1 - l1 - l2), z: k[o + 2] + l1 * k[o + 8] + l2 * k[o + 9] };
  };
  const onHull = (x: number, y: number) => {
    let best = Infinity,
      z = 0;
    for (let e = 0; e < hull.length; e += 2) {
      const p = pts[hull[e]],
        q = pts[hull[e + 1]];
      const ex = q.x - p.x,
        ey = q.y - p.y;
      const s = Math.max(0, Math.min(1, ((x - p.x) * ex + (y - p.y) * ey) / (ex * ex + ey * ey)));
      const d = (p.x + s * ex - x) ** 2 + (p.y + s * ey - y) ** 2;
      if (d < best) {
        best = d;
        z = p.z + s * (q.z - p.z);
      }
    }
    return z;
  };
  return (x, y) => {
    if (x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY) {
      const c = cellY(y) * gx + cellX(x);
      let bestL = -Infinity,
        bestZ = 0;
      for (let s = start[c]; s < start[c + 1]; s++) {
        const { l, z } = onPlane(list[s], x, y);
        if (l >= -1e-9) return z;
        if (l > bestL) {
          bestL = l;
          bestZ = z;
        }
      }
      if (bestL >= -1e-6) return bestZ;
    }
    return onHull(x, y);
  };
}

/** The natural ground from its levels. Levels with a missing coordinate are left out. */
export function buildSurface(points: GroundPoint[]): Surface {
  const pts = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  const triangles = delaunay(pts);
  if (!pts.length) return { points: pts, triangles, empty: true, bounds: null, heightAt: () => 0 };
  const bounds = boundsOf(pts)!;
  const height = triangles.length ? meshHeight(pts, triangles, bounds) : lineHeight(pts);
  return {
    points: pts,
    triangles,
    empty: false,
    bounds,
    heightAt: (x, y) => (Number.isFinite(x) && Number.isFinite(y) ? height(x, y) : 0),
  };
}

/** At most this many contour levels are drawn. */
const MAX_LEVELS = 500;

/** Join segments (pairs of end keys) into polylines of keys; a loop ends on its first key. */
function chain(segs: [string, string][]): string[][] {
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const key of s) {
      const list = at.get(key);
      if (list) list.push(i);
      else at.set(key, [i]);
    }
  });
  const used = new Uint8Array(segs.length);
  const walk = (i: number, from: string) => {
    const keys = [from];
    let key = from;
    for (let s = i; s >= 0;) {
      used[s] = 1;
      key = segs[s][0] === key ? segs[s][1] : segs[s][0];
      keys.push(key);
      s = at.get(key)!.find((j) => !used[j]) ?? -1;
    }
    return keys;
  };
  const lines: string[][] = [];
  for (const [key, list] of at) {
    if (list.length % 2 === 0) continue;
    for (const i of list) if (!used[i]) lines.push(walk(i, key));
  }
  segs.forEach((s, i) => {
    if (!used[i]) lines.push(walk(i, s[0]));
  });
  return lines;
}

/**
 * Contour lines of a surface at every multiple of intervalMm between its lowest and highest level,
 * each chained into polylines (a line that comes back to its start is closed: last point equals first).
 */
export function contourLines(surface: Surface, intervalMm: number): { zMm: number; lines: Point[][] }[] {
  const { points: pts, triangles } = surface;
  if (!triangles.length || !(intervalMm > 0) || !Number.isFinite(intervalMm)) return [];
  let lo = Infinity,
    hi = -Infinity;
  const low = triangles.map((tri) => Math.min(pts[tri[0]].z, pts[tri[1]].z, pts[tri[2]].z));
  const high = triangles.map((tri) => Math.max(pts[tri[0]].z, pts[tri[1]].z, pts[tri[2]].z));
  for (let t = 0; t < triangles.length; t++) {
    lo = Math.min(lo, low[t]);
    hi = Math.max(hi, high[t]);
  }
  const first = Math.ceil(lo / intervalMm),
    last = Math.min(Math.floor(hi / intervalMm), first + MAX_LEVELS - 1);
  const out: { zMm: number; lines: Point[][] }[] = [];
  for (let n = first; n <= last; n++) {
    const level = n * intervalMm;
    const where = new Map<string, Point>();
    const seen = new Set<string>();
    const segs: [string, string][] = [];
    // Where the level crosses the edge from i (below) to j (at or above it).
    const cross = (i: number, j: number) => {
      const p = pts[i],
        q = pts[j];
      const key = q.z === level ? `v${j}` : `e${Math.min(i, j)}_${Math.max(i, j)}`;
      if (!where.has(key)) {
        const t = (level - p.z) / (q.z - p.z);
        where.set(key, { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) });
      }
      return key;
    };
    for (let t = 0; t < triangles.length; t++) {
      if (level > high[t] || level <= low[t]) continue;
      const tri = triangles[t];
      const up = tri.map((i) => pts[i].z >= level);
      const above = up.filter(Boolean).length;
      if (above === 0 || above === 3) continue;
      // The corner on its own side of the level, and the other two.
      const lone = up.findIndex((u) => u === (above === 1));
      const o = tri[lone],
        p = tri[(lone + 1) % 3],
        q = tri[(lone + 2) % 3];
      const ends = above === 1 ? [cross(p, o), cross(q, o)] : [cross(o, p), cross(o, q)];
      if (ends[0] === ends[1]) continue;
      const id = ends[0] < ends[1] ? `${ends[0]}|${ends[1]}` : `${ends[1]}|${ends[0]}`;
      if (seen.has(id)) continue;
      seen.add(id);
      segs.push([ends[0], ends[1]]);
    }
    if (!segs.length) continue;
    out.push({ zMm: level, lines: chain(segs).map((keys) => keys.map((key) => where.get(key)!)) });
  }
  return out;
}

/** Whether a point is inside an outline and outside all its holes. */
function inArea(p: Point, outline: Point[], holes: Point[][]): boolean {
  return pointInPolygon(p, outline) && !holes.some((h) => pointInPolygon(p, h));
}

/** Distance from p to the segment a–b. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const ex = b.x - a.x,
    ey = b.y - a.y;
  const len2 = ex * ex + ey * ey;
  const s = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0;
  return Math.hypot(a.x + s * ex - p.x, a.y + s * ey - p.y);
}

/**
 * A triangle mesh of an area (an outline less its holes, plan units), fine enough to follow the
 * ground: points on the outline and holes every `cell` or closer, a grid of points `cell` apart
 * inside (none closer than 0.4 cell to an edge), triangulated, keeping triangles whose centre is
 * inside the outline and outside every hole. z is `height` at each point (mm). A cell too small for
 * the area is widened to keep the mesh to about 200,000 points.
 */
export function meshArea(
  outline: Point[],
  holes: Point[][],
  cell: number,
  height: (x: number, y: number) => number,
): { points: Point[]; z: number[]; triangles: Tri[] } {
  const box = boundsOf(outline);
  if (outline.length < 3 || !box || !(cell > 0) || !Number.isFinite(cell)) return { points: [], z: [], triangles: [] };
  const rings = [outline, ...holes.filter((h) => h.length >= 3)];
  const perimeter = rings.reduce(
    (sum, r) =>
      sum + r.reduce((s, p, i) => s + Math.hypot(r[(i + 1) % r.length].x - p.x, r[(i + 1) % r.length].y - p.y), 0),
    0,
  );
  const area = (box.maxX - box.minX) * (box.maxY - box.minY);
  const step = Math.max(cell, Math.sqrt(area / 200000), perimeter / 50000);

  const points: Point[] = [];
  for (const ring of rings) {
    ring.forEach((a, i) => {
      const b = ring[(i + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let s = 0; s < n; s++) points.push({ x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n });
    });
  }
  for (let y = Math.ceil(box.minY / step) * step; y <= box.maxY; y += step) {
    for (let x = Math.ceil(box.minX / step) * step; x <= box.maxX; x += step) {
      const p = { x, y };
      if (!inArea(p, outline, holes)) continue;
      const clear = rings.every((r) => r.every((a, i) => segmentDistance(p, a, r[(i + 1) % r.length]) >= 0.4 * step));
      if (clear) points.push(p);
    }
  }
  const triangles = delaunay(points).filter(([i, j, k]) =>
    inArea(
      { x: (points[i].x + points[j].x + points[k].x) / 3, y: (points[i].y + points[j].y + points[k].y) / 3 },
      outline,
      holes,
    ),
  );
  return { points, z: points.map((p) => height(p.x, p.y)), triangles };
}

/**
 * Earth to dig out and to bring in over an area (outline less holes, plan units) to go from
 * `natural` to `finished` (both mm, functions of x, y): cut where natural is above finished, fill
 * where below; in cubic metres, and the area in m². Sampled at the middle of each cell of a grid of
 * about 40,000 cells over the outline's extent (cells between 1 and 100 plan units, stretched a
 * little to fit the extent exactly).
 */
export function earthworks(
  outline: Point[],
  holes: Point[][],
  natural: (x: number, y: number) => number,
  finished: (x: number, y: number) => number,
): { cutM3: number; fillM3: number; areaM2: number } {
  const box = boundsOf(outline);
  const w = box ? box.maxX - box.minX : 0,
    h = box ? box.maxY - box.minY : 0;
  if (!box || outline.length < 3 || !(w > 0) || !(h > 0) || !Number.isFinite(w * h)) {
    return { cutM3: 0, fillM3: 0, areaM2: 0 };
  }
  const cell = Math.min(100, Math.max(1, Math.sqrt((w * h) / 40000)));
  const nx = Math.max(1, Math.round(w / cell)),
    ny = Math.max(1, Math.round(h / cell));
  const cw = w / nx,
    ch = h / ny;
  const cellM2 = ((cw * MM_PER_UNIT) / 1000) * ((ch * MM_PER_UNIT) / 1000);
  let cut = 0,
    fill = 0,
    cells = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = box.minX + (i + 0.5) * cw,
        y = box.minY + (j + 0.5) * ch;
      if (!inArea({ x, y }, outline, holes)) continue;
      cells++;
      const d = natural(x, y) - finished(x, y);
      if (d > 0) cut += d;
      else if (d < 0) fill -= d;
    }
  }
  return { cutM3: (cut / 1000) * cellM2, fillM3: (fill / 1000) * cellM2, areaM2: cells * cellM2 };
}

/** At most this many steps are taken along a profile. */
const MAX_STEPS = 10000;

/**
 * Heights along a line from a to b (plan units): at both ends, every `step` plan units between,
 * and where it crosses any of the surface's triangle edges; t is the distance from a (plan units).
 * Sorted by t, no repeats.
 */
export function profileAlong(surface: Surface, a: Point, b: Point, step: number): { t: number; zMm: number }[] {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len)) return [];
  const at = (t: number) => ({ t, zMm: surface.heightAt(a.x + (dx * t) / len, a.y + (dy * t) / len) });
  if (len === 0) return [{ t: 0, zMm: surface.heightAt(a.x, a.y) }];
  const ts: number[] = [];
  if (step > 0 && Number.isFinite(step)) {
    for (let n = 1; n * step < len && n <= MAX_STEPS; n++) ts.push(n * step);
  }
  const pts = surface.points;
  const done = new Set<number>();
  for (const tri of surface.triangles) {
    for (let e = 0; e < 3; e++) {
      const i = Math.min(tri[e], tri[(e + 1) % 3]),
        j = Math.max(tri[e], tri[(e + 1) % 3]);
      const key = i * pts.length + j;
      if (done.has(key)) continue;
      done.add(key);
      const p = pts[i],
        ex = pts[j].x - p.x,
        ey = pts[j].y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12 * len * Math.hypot(ex, ey)) continue;
      const u = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den,
        s = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
      if (u >= 0 && u <= 1 && s >= 0 && s <= 1) ts.push(u * len);
    }
  }
  const tol = 1e-9 * Math.max(1, len);
  const inner = ts.filter((t) => t > tol && t < len - tol).sort((p, q) => p - q);
  const kept = [0];
  for (const t of inner) if (t - kept[kept.length - 1] > tol) kept.push(t);
  kept.push(len);
  return kept.map(at);
}
