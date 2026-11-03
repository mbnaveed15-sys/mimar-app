/**
 * The walls of a floor as a graph for the structure: where they meet (corners, tees and crosses, and
 * free ends), and the runs of wall between those junctions, measured along the wall. Pure.
 */
import { arcOf, directionAlong, partOf, pointAlong, projectOnWall, runLength } from '../arc';
import { thicknessOf } from '../../walls';
import type { Point, Wall } from '../../types';

/** Junctions closer than this are one (plan units: 80 mm). */
const JOIN = 8;

export interface Junction {
  p: Point;
  /** Unit directions of the wall pieces leaving it. */
  dirs: Point[];
  /** It needs a column: a corner, tee, cross or free end (not a straight joint between two walls). */
  column: boolean;
}

/** A piece of wall between two junctions (or splits). */
export interface Piece {
  wall: Wall;
  t0: number;
  t1: number;
  a: number;
  b: number;
  length: number;
}

/** Wall pieces from one column junction to the next, and their total length along the walls. */
export interface Run {
  pieces: Piece[];
  length: number;
  /** The junction at each end (indexes into `junctions`). */
  from: number;
  to: number;
}

export interface WallGraph {
  junctions: Junction[];
  runs: Run[];
}

/** Where two straight walls cross strictly inside both, as fractions along each. */
function crossing(a: Wall, b: Wall): [number, number] | null {
  if (arcOf(a) || arcOf(b)) return null;
  const rx = a.x2 - a.x1;
  const ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1;
  const sy = b.y2 - b.y1;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / den;
  const u = ((b.x1 - a.x1) * ry - (b.y1 - a.y1) * rx) / den;
  const e = 1e-4;
  return t > e && t < 1 - e && u > e && u < 1 - e ? [t, u] : null;
}

/** The point at a distance along a run, and the wall direction there. */
export function alongRun(run: Run, d: number): { p: Point; dir: Point; piece: Piece; t: number } {
  let left = Math.max(0, Math.min(d, run.length));
  for (const piece of run.pieces) {
    if (left <= piece.length + 1e-6 || piece === run.pieces[run.pieces.length - 1]) {
      const f = piece.length ? Math.min(1, left / piece.length) : 0;
      const t = piece.t0 + (piece.t1 - piece.t0) * f;
      const dir = directionAlong(piece.wall, t);
      const s = piece.t1 >= piece.t0 ? 1 : -1;
      return { p: pointAlong(piece.wall, t), dir: { x: dir.x * s, y: dir.y * s }, piece, t };
    }
    left -= piece.length;
  }
  const last = run.pieces[run.pieces.length - 1];
  return { p: pointAlong(last.wall, last.t1), dir: directionAlong(last.wall, last.t1), piece: last, t: last.t1 };
}

/** How far along a run a point on one of its walls is (null when it isn't on the run). */
export function distanceOnRun(run: Run, wallId: string, t: number): number | null {
  let d = 0;
  for (const piece of run.pieces) {
    const lo = Math.min(piece.t0, piece.t1);
    const hi = Math.max(piece.t0, piece.t1);
    if (piece.wall.id === wallId && t >= lo - 1e-6 && t <= hi + 1e-6) {
      const f = piece.t1 === piece.t0 ? 0 : (t - piece.t0) / (piece.t1 - piece.t0);
      return d + f * piece.length;
    }
    d += piece.length;
  }
  return null;
}

/** The graph of a floor's walls. */
export function wallGraph(walls: Wall[]): WallGraph {
  const junctions: Junction[] = [];
  const at = (p: Point): number => {
    const i = junctions.findIndex((j) => Math.hypot(j.p.x - p.x, j.p.y - p.y) < JOIN);
    if (i >= 0) return i;
    junctions.push({ p, dirs: [], column: false });
    return junctions.length - 1;
  };
  // Where each wall is split: its ends, other walls' ends on it (tees), and crossings.
  const splits = walls.map(() => new Set<number>([0, 1]));
  walls.forEach((w, i) => {
    for (const [j, o] of walls.entries()) {
      if (i === j) continue;
      for (const p of [
        { x: o.x1, y: o.y1 },
        { x: o.x2, y: o.y2 },
      ]) {
        const near = projectOnWall(w, p);
        if (near.dist < Math.max(JOIN, thicknessOf(w) / 2) && near.t > 1e-3 && near.t < 1 - 1e-3) splits[i].add(near.t);
      }
      if (j > i) {
        const c = crossing(w, o);
        if (c) {
          splits[i].add(c[0]);
          splits[j].add(c[1]);
        }
      }
    }
  });
  // Pieces between splits, and the junction at each split.
  type Edge = { piece: Piece; ends: [number, number] };
  const edges: Edge[] = [];
  walls.forEach((w, i) => {
    const ts = [...splits[i]].sort((a, b) => a - b).filter((t, k, arr) => k === 0 || t - arr[k - 1] > 1e-4);
    for (let k = 0; k + 1 < ts.length; k++) {
      const [t0, t1] = [ts[k], ts[k + 1]];
      const a = at(pointAlong(w, t0));
      const b = at(pointAlong(w, t1));
      const length = runLength(partOf(w, t0, t1));
      if (length < 1) continue;
      const d0 = directionAlong(w, t0);
      const d1 = directionAlong(w, t1);
      junctions[a].dirs.push(d0);
      junctions[b].dirs.push({ x: -d1.x, y: -d1.y });
      edges.push({ piece: { wall: w, t0, t1, a, b, length }, ends: [a, b] });
    }
  });
  for (const j of junctions) {
    // Directions within 10° are one.
    const dirs: Point[] = [];
    for (const d of j.dirs) if (!dirs.some((e) => e.x * d.x + e.y * d.y > Math.cos((10 * Math.PI) / 180))) dirs.push(d);
    j.dirs = dirs;
    const straight =
      dirs.length === 2 && dirs[0].x * dirs[1].x + dirs[0].y * dirs[1].y < -Math.cos((10 * Math.PI) / 180);
    j.column = dirs.length > 0 && !straight;
  }
  // Runs: walk from each column junction along unvisited pieces until the next column junction.
  const byJunction = new Map<number, Edge[]>();
  for (const e of edges)
    for (const end of e.ends) {
      const list = byJunction.get(end) ?? [];
      list.push(e);
      byJunction.set(end, list);
    }
  const used = new Set<Edge>();
  const runs: Run[] = [];
  const walk = (start: number, first: Edge) => {
    const pieces: Piece[] = [];
    let cur = start;
    let edge: Edge | undefined = first;
    while (edge && !used.has(edge)) {
      used.add(edge);
      const forward = edge.piece.a === cur;
      const p = edge.piece;
      pieces.push(forward ? p : { ...p, t0: p.t1, t1: p.t0, a: p.b, b: p.a });
      cur = forward ? p.b : p.a;
      if (junctions[cur].column) break;
      edge = byJunction.get(cur)?.find((e) => !used.has(e));
    }
    if (pieces.length) runs.push({ pieces, length: pieces.reduce((t, p) => t + p.length, 0), from: start, to: cur });
  };
  junctions.forEach((j, i) => {
    if (!j.column) return;
    for (const e of byJunction.get(i) ?? []) if (!used.has(e)) walk(i, e);
  });
  // Closed loops with no column junction (a round room): start one at its first junction.
  for (const e of edges)
    if (!used.has(e)) {
      junctions[e.ends[0]].column = true;
      walk(e.ends[0], e);
    }
  return { junctions, runs };
}
