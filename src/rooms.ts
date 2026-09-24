import { pointInPolygon } from './geometry';
import { MM_PER_UNIT } from './lib/scale';
import type { PlanElement, Point, Room, Wall } from './types';

/** Points closer than this (plan units) are treated as the same corner. */
const EPS = 0.5;

/** Signed shoelace area; positive for the faces this module returns. */
export function signedArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (pts: Point[]) => Math.abs(signedArea(pts));

/** Where two segments cross, as a parameter along the first, or null. */
function segmentIntersection(a: Point, b: Point, c: Point, d: Point): number | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) return null; // parallel
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / denom;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / denom;
  const tol = 1e-6;
  return t >= -tol && t <= 1 + tol && u >= -tol && u <= 1 + tol ? t : null;
}

function paramOnSegment(a: Point, b: Point, p: Point): number | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return null;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0 || t > 1) return null;
  const dist = Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
  return dist <= EPS ? t : null;
}

interface Graph {
  nodes: Point[];
  /** Outgoing neighbours of each node, sorted by angle. */
  adjacency: number[][];
}

/** Split walls where they meet or cross and build a graph of corners and wall pieces. */
export function buildWallGraph(walls: Wall[]): Graph {
  const nodes: Point[] = [];
  const nodeIndex = (p: Point) => {
    const found = nodes.findIndex((n) => Math.hypot(n.x - p.x, n.y - p.y) <= EPS);
    if (found >= 0) return found;
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
  };

  const edges = new Set<string>();
  const segs = walls.map((w) => ({ a: { x: w.x1, y: w.y1 }, b: { x: w.x2, y: w.y2 } }));
  for (let i = 0; i < segs.length; i++) {
    const { a, b } = segs[i];
    const ts = new Set<number>([0, 1]);
    for (let j = 0; j < segs.length; j++) {
      if (i === j) continue;
      const t = segmentIntersection(a, b, segs[j].a, segs[j].b);
      if (t !== null) ts.add(Math.min(1, Math.max(0, t)));
      // T-junction: another wall ends on this one.
      for (const end of [segs[j].a, segs[j].b]) {
        const te = paramOnSegment(a, b, end);
        if (te !== null) ts.add(te);
      }
    }
    const ids = [...ts]
      .sort((x, y) => x - y)
      .map((t) => nodeIndex({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }));
    for (let k = 0; k + 1 < ids.length; k++) {
      const [u, v] = [ids[k], ids[k + 1]];
      if (u !== v) edges.add(u < v ? `${u}-${v}` : `${v}-${u}`);
    }
  }

  const adjacency: number[][] = nodes.map(() => []);
  for (const e of edges) {
    const [u, v] = e.split('-').map(Number);
    adjacency[u].push(v);
    adjacency[v].push(u);
  }
  const angle = (from: number, to: number) => Math.atan2(nodes[to].y - nodes[from].y, nodes[to].x - nodes[from].x);
  adjacency.forEach((list, u) => list.sort((p, q) => angle(u, p) - angle(u, q)));
  return { nodes, adjacency };
}

/** Remove there-and-back spikes left by walls that stick into a room. */
function removeSpikes(pts: Point[]): Point[] {
  const out = [...pts];
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const prev = out[(i - 1 + out.length) % out.length];
      const next = out[(i + 1) % out.length];
      if (Math.hypot(prev.x - next.x, prev.y - next.y) <= EPS) {
        // Drop the spike tip and one copy of the repeated corner.
        const drop = [i, (i + 1) % out.length].sort((a, b) => b - a);
        drop.forEach((d) => out.splice(d, 1));
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** Every enclosed area formed by the walls, as polygons with positive signed area. */
export function wallFaces(walls: Wall[]): Point[][] {
  const { nodes, adjacency } = buildWallGraph(walls);
  const visited = new Set<string>();
  const faces: Point[][] = [];

  for (let u = 0; u < nodes.length; u++) {
    for (const v of adjacency[u]) {
      if (visited.has(`${u}>${v}`)) continue;
      const loop: number[] = [];
      let [a, b] = [u, v];
      for (let guard = 0; guard < 10000 && !visited.has(`${a}>${b}`); guard++) {
        visited.add(`${a}>${b}`);
        loop.push(a);
        // Turn to the neighbour just before the way back, keeping the face on one side.
        const around = adjacency[b];
        const back = around.indexOf(a);
        const next = around[(back - 1 + around.length) % around.length];
        [a, b] = [b, next];
      }
      const pts = removeSpikes(loop.map((i) => nodes[i]));
      if (pts.length >= 3 && signedArea(pts) > 1) faces.push(pts);
    }
  }
  return faces;
}

/** The smallest area enclosed by walls around p, or null if p is not enclosed. */
export function detectRoom(elements: PlanElement[], p: Point): Point[] | null {
  const walls = elements.filter((el): el is Wall => el.type === 'wall');
  const containing = wallFaces(walls).filter((f) => pointInPolygon(p, f));
  if (!containing.length) return null;
  return containing.reduce((best, f) => (polygonArea(f) < polygonArea(best) ? f : best));
}

/** A point inside the polygon suitable for its label. */
export function labelPoint(pts: Point[]): Point {
  const a = signedArea(pts);
  if (Math.abs(a) > 1e-9) {
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const cross = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * cross;
      cy += (p.y + q.y) * cross;
    }
    const c = { x: cx / (6 * a), y: cy / (6 * a) };
    if (pointInPolygon(c, pts)) return c;
  }
  // L-shaped rooms: fall back to the middle of the first corner's triangle.
  return { x: (pts[0].x + pts[1].x + pts[2].x) / 3, y: (pts[0].y + pts[1].y + pts[2].y) / 3 };
}

/** Floor area of a room in square millimetres. */
export const roomAreaSqMm = (room: Room) => polygonArea(room.points) * MM_PER_UNIT * MM_PER_UNIT;
