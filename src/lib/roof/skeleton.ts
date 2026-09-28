/**
 * Pitched roofs over a plan outline. `skeletonRoof` builds hipped, gabled and mixed roofs from a weighted
 * straight skeleton: every eave edge moves inward at the same speed (its roof plane rises at the slope), gable
 * edges stay where they are and become vertical gable walls. `shedRoof` is one plane rising from one edge. Pure.
 */
import type { Point } from '../../types';

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export type RoofLineKind = 'ridge' | 'hip' | 'valley' | 'eave' | 'verge';

export interface RoofFace {
  /** The outline edge (index i = points[i] to points[i+1]) this face belongs to. */
  edge: number;
  /** True for a gable's vertical face (weight 0 edge, or the non-low sides of a shed). */
  vertical: boolean;
  /** The face's corners in 3D, in order round the face, starting with the edge's two ends at z = 0. */
  points: Point3[];
}

export interface RoofLine {
  a: Point3;
  b: Point3;
  kind: RoofLineKind;
}

export interface RoofShape {
  faces: RoofFace[];
  /**
   * Every line on the roof: eaves and verges (outline edges), ridges (level lines at the top), hips (convex slope
   * meets), valleys (reflex/concave slope meets). Each line once.
   */
  lines: RoofLine[];
  /** The roof's height above the outline's level at a plan point, or null outside the outline. */
  heightAt(p: Point): number | null;
  /** The highest point's height. */
  peak: number;
}

/**
 * An outline edge as a moving line: at time t it holds the points x with n·x = c + w·t, where n is the inward
 * unit normal, d the unit direction and w the weight (1 for an eave, 0 for a gable that stays put).
 */
interface Edge {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  nx: number;
  ny: number;
  c: number;
  w: number;
}

/** A wavefront corner: where it was born (x, y at time t), its velocity, and the edges arriving and leaving. */
interface Vert {
  x: number;
  y: number;
  t: number;
  vx: number;
  vy: number;
  ein: number;
  eout: number;
  /** The skeleton node it started from. */
  node: number;
}

/** A skeleton node: plan position and the time the wavefront got there (height = time × slope). */
type Node3 = [number, number, number];
type Seg = [number, number];

interface Skeleton {
  nodes: Node3[];
  /** For each edge, the segments (node pairs) bounding its face, apart from the edge itself. */
  segs: Seg[][];
}

const hyp = Math.hypot;

function signedArea(pts: Point[]): number {
  let s = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    s += p.x * q.y - q.x * p.y;
  });
  return s / 2;
}

/** The distance from p to the segment a–b. */
function segDist(p: Point, a: Point, b: Point): number {
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const l2 = ex * ex + ey * ey;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / l2)) : 0;
  return hyp(p.x - a.x - u * ex, p.y - a.y - u * ey);
}

/** Whether p is inside the polygon or within tol of its boundary. */
function covers(poly: Point[], p: Point, tol: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (segDist(p, a, b) <= tol) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** How far p is from the polygon's boundary. */
function boundaryDist(poly: Point[], p: Point): number {
  let d = Infinity;
  poly.forEach((a, i) => (d = Math.min(d, segDist(p, a, poly[(i + 1) % poly.length]))));
  return d;
}

function extent(pts: Point[]): number {
  if (!pts.length) return 0;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const s = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return Number.isFinite(s) ? s : 0;
}

function makeEdge(a: Point, b: Point, w: number): Edge {
  const len = hyp(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / len;
  const dy = (b.y - a.y) / len;
  return { ax: a.x, ay: a.y, dx, dy, nx: -dy, ny: dx, c: -dy * a.x + dx * a.y, w };
}

/** How a corner between edges A (arriving) and B (leaving) moves: it stays on both moving lines. */
function velocity(A: Edge, B: Edge): [number, number] {
  const det = A.nx * B.ny - A.ny * B.nx;
  if (Math.abs(det) > 1e-9) return [(A.w * B.ny - B.w * A.ny) / det, (A.nx * B.w - B.nx * A.w) / det];
  // Edges in line: the corner moves straight in with them. Edges face to face: a spike, cleared before it moves.
  if (A.nx * B.nx + A.ny * B.ny > 0)
    return [((A.nx + B.nx) / 2) * ((A.w + B.w) / 2), ((A.ny + B.ny) / 2) * ((A.w + B.w) / 2)];
  return [0, 0];
}

/** Moves the vertices from index `start` (going round) by `count` places and puts `items` there. */
function replaceRun(loop: Vert[], start: number, count: number, items: Vert[]): Vert[] {
  const s = ((start % loop.length) + loop.length) % loop.length;
  const rot = [...loop.slice(s), ...loop.slice(0, s)];
  return [...items, ...rot.slice(count)];
}

/**
 * Runs the wavefront of a counter-clockwise (y up) outline inward, event by event: an edge shrinking to nothing
 * (its two corners meet) or a reflex corner running into another edge (splitting the wavefront in two). Events
 * at the same moment are settled together by merging corners that meet, clearing zero-width spikes, letting an
 * eave that catches up with a gable in line with it sweep the gable's piece, and dropping loops that have closed
 * up. Returns null if it gets stuck (every edge still left is a gable) or runs too long.
 */
function wavefront(pts: Point[], edges: Edge[], eps: number): Skeleton | null {
  const n = pts.length;
  const nodes: Node3[] = pts.map((p) => [p.x, p.y, 0]);
  const segs: Seg[][] = edges.map(() => []);
  let ops = 0;

  const nodeAt = (x: number, y: number, t: number): number => {
    for (let i = 0; i < nodes.length; i++) {
      const q = nodes[i];
      if (Math.abs(q[0] - x) <= eps && Math.abs(q[1] - y) <= eps && Math.abs(q[2] - t) <= eps) return i;
    }
    nodes.push([x, y, t]);
    return nodes.length - 1;
  };
  const make = (p: Point, t: number, ein: number, eout: number, node = nodeAt(p.x, p.y, t)): Vert => {
    const [vx, vy] = velocity(edges[ein], edges[eout]);
    return { x: p.x, y: p.y, t, vx, vy, ein, eout, node };
  };
  const pos = (v: Vert, t: number): Point => ({ x: v.x + v.vx * (t - v.t), y: v.y + v.vy * (t - v.t) });
  // A corner's track from where it was born to where it ends bounds the faces of both its edges.
  const finish = (v: Vert, node: number) => {
    if (node === v.node) return;
    segs[v.ein].push([v.node, node]);
    if (v.eout !== v.ein) segs[v.eout].push([v.node, node]);
  };
  const addSeg = (a: number, b: number, e: number) => {
    if (a !== b) segs[e].push([a, b]);
  };
  const reflex = (v: Vert) => {
    const A = edges[v.ein];
    const B = edges[v.eout];
    return A.dx * B.dy - A.dy * B.dx < -1e-9;
  };
  const faceToFace = (v: Vert) => {
    const A = edges[v.ein];
    const B = edges[v.eout];
    return Math.abs(A.nx * B.ny - A.ny * B.nx) <= 1e-9 && A.nx * B.nx + A.ny * B.ny < 0;
  };
  // Edges in line (they share a corner) but moving at different speeds: the slower one is overtaken.
  const overtaken = (v: Vert) => {
    const A = edges[v.ein];
    const B = edges[v.eout];
    return Math.abs(A.nx * B.ny - A.ny * B.nx) <= 1e-9 && A.nx * B.nx + A.ny * B.ny > 0 && A.w !== B.w;
  };
  const nodeOf = (p: Point, t: number) => nodeAt(p.x, p.y, t);

  /** Ends a loop that has closed up; what is left of its edges becomes ridge lines. */
  const close = (loop: Vert[], t: number) => {
    ops++;
    const P = loop.map((v) => pos(v, t));
    const ids = P.map((p) => nodeOf(p, t));
    loop.forEach((v, i) => finish(v, ids[i]));
    if (loop.length === 2) {
      addSeg(ids[0], ids[1], loop[0].eout);
      addSeg(ids[0], ids[1], loop[1].eout);
    } else if (loop.length > 2) {
      loop.forEach((v, i) => addSeg(ids[i], ids[(i + 1) % loop.length], v.eout));
    }
  };

  /** Merges corners that have met, clears spikes and closes empty loops. Returns null once the loop is gone. */
  const clean = (start: Vert[], t: number): Vert[] | null => {
    let loop = start;
    for (let guard = 0; guard < 10000; guard++) {
      const m = loop.length;
      if (m < 3) {
        close(loop, t);
        return null;
      }
      const P = loop.map((v) => pos(v, t));
      let hit = -1;
      for (let i = 0; i < m && hit < 0; i++) {
        const q = P[(i + 1) % m];
        if (hyp(P[i].x - q.x, P[i].y - q.y) <= eps) hit = i;
      }
      if (hit >= 0) {
        ops++;
        const u = loop[hit];
        const v = loop[(hit + 1) % m];
        const q = P[(hit + 1) % m];
        const mid = { x: (P[hit].x + q.x) / 2, y: (P[hit].y + q.y) / 2 };
        const node = nodeOf(mid, t);
        finish(u, node);
        finish(v, node);
        loop = replaceRun(loop, hit, 2, [make(mid, t, u.ein, v.eout, node)]);
        continue;
      }
      const lap = loop.findIndex(overtaken);
      if (lap >= 0) {
        // An eave's line has caught up with the gable next to it: the gable's piece is swept at once, level.
        ops++;
        const v = loop[lap];
        const nv = nodeOf(P[lap], t);
        finish(v, nv);
        if (edges[v.ein].w < edges[v.eout].w) {
          const u = loop[(lap - 1 + m) % m];
          const nu = nodeOf(P[(lap - 1 + m) % m], t);
          addSeg(nu, nv, v.ein);
          addSeg(nu, nv, v.eout);
          finish(u, nu);
          loop = replaceRun(loop, lap - 1, 2, [make(P[(lap - 1 + m) % m], t, u.ein, v.eout, nu)]);
        } else {
          const w = loop[(lap + 1) % m];
          const nw = nodeOf(P[(lap + 1) % m], t);
          addSeg(nv, nw, v.ein);
          addSeg(nv, nw, v.eout);
          finish(w, nw);
          loop = replaceRun(loop, lap, 2, [make(P[(lap + 1) % m], t, v.ein, w.eout, nw)]);
        }
        continue;
      }
      const tip = loop.findIndex(faceToFace);
      if (tip >= 0) {
        // Two edges folded back on each other: the shorter is used up along the longer, leaving a ridge.
        ops++;
        const u = loop[(tip - 1 + m) % m];
        const v = loop[tip];
        const w = loop[(tip + 1) % m];
        const pu = P[(tip - 1 + m) % m];
        const pv = P[tip];
        const pw = P[(tip + 1) % m];
        const la = hyp(pv.x - pu.x, pv.y - pu.y);
        const lb = hyp(pw.x - pv.x, pw.y - pv.y);
        const nv = nodeOf(pv, t);
        finish(v, nv);
        if (Math.abs(la - lb) <= eps) {
          const nu = nodeOf(pu, t);
          addSeg(nv, nu, v.ein);
          addSeg(nv, nu, v.eout);
          finish(u, nu);
          finish(w, nu);
          loop = replaceRun(loop, tip - 1, 3, [make(pu, t, u.ein, w.eout, nu)]);
        } else if (la > lb) {
          const nw = nodeOf(pw, t);
          addSeg(nv, nw, v.ein);
          addSeg(nv, nw, v.eout);
          finish(w, nw);
          loop = replaceRun(loop, tip, 2, [make(pw, t, v.ein, w.eout, nw)]);
        } else {
          const nu = nodeOf(pu, t);
          addSeg(nv, nu, v.ein);
          addSeg(nv, nu, v.eout);
          finish(u, nu);
          loop = replaceRun(loop, tip - 1, 2, [make(pu, t, u.ein, v.eout, nu)]);
        }
        continue;
      }
      if (Math.abs(signedArea(P)) <= eps * eps) {
        close(loop, t);
        return null;
      }
      return loop;
    }
    return loop;
  };

  /** A reflex corner lying on an edge of its loop that isn't its own, if there is one. */
  const findSplit = (loop: Vert[], t: number): [number, number] | null => {
    const m = loop.length;
    const P = loop.map((v) => pos(v, t));
    for (let i = 0; i < m; i++) {
      if (!reflex(loop[i])) continue;
      for (let k = 0; k < m; k++) {
        if (k === i || k === (i - 1 + m) % m) continue;
        const E = edges[loop[k].eout];
        const a = P[k];
        const b = P[(k + 1) % m];
        const s = E.nx * P[i].x + E.ny * P[i].y - E.c - E.w * t;
        if (Math.abs(s) > eps) continue;
        const along = (P[i].x - a.x) * E.dx + (P[i].y - a.y) * E.dy;
        const len = (b.x - a.x) * E.dx + (b.y - a.y) * E.dy;
        if (along >= -eps && along <= len + eps) return [i, k];
      }
    }
    return null;
  };

  /** Splits the loop where corner i meets the edge leaving corner k. */
  const split = (loop: Vert[], i: number, k: number, t: number): Vert[][] => {
    ops++;
    const m = loop.length;
    const v = loop[i];
    const p = pos(v, t);
    const node = nodeOf(p, t);
    finish(v, node);
    const e = loop[k].eout;
    const a = [make(p, t, e, v.eout, node)];
    for (let j = (i + 1) % m; ; j = (j + 1) % m) {
      a.push(loop[j]);
      if (j === k) break;
    }
    const b = [make(p, t, v.ein, e, node)];
    for (let j = (k + 1) % m; j !== i; j = (j + 1) % m) b.push(loop[j]);
    return [a, b];
  };

  /** The time of the next event at or after `floor`, or Infinity. */
  const nextEvent = (loops: Vert[][], now: number, floor: number): number => {
    let best = Infinity;
    for (const loop of loops) {
      const m = loop.length;
      const P = loop.map((v) => pos(v, now));
      for (let k = 0; k < m; k++) {
        const a = loop[k];
        const b = loop[(k + 1) % m];
        const E = edges[a.eout];
        const len = (P[(k + 1) % m].x - P[k].x) * E.dx + (P[(k + 1) % m].y - P[k].y) * E.dy;
        const rate = (b.vx - a.vx) * E.dx + (b.vy - a.vy) * E.dy;
        if (rate < -1e-12) {
          const t = now + Math.max(len, 0) / -rate;
          if (t >= floor && t < best) best = t;
        }
      }
      for (let i = 0; i < m; i++) {
        const v = loop[i];
        if (!reflex(v)) continue;
        for (let k = 0; k < m; k++) {
          if (k === i || k === (i - 1 + m) % m) continue;
          const E = edges[loop[k].eout];
          const s = E.nx * P[i].x + E.ny * P[i].y - E.c - E.w * now;
          const rate = E.nx * v.vx + E.ny * v.vy - E.w;
          if (rate >= -1e-12 || s < -eps) continue;
          const t = now + Math.max(s, 0) / -rate;
          if (t < floor || t >= best) continue;
          const pi = pos(v, t);
          const pa = pos(loop[k], t);
          const pb = pos(loop[(k + 1) % m], t);
          const along = (pi.x - pa.x) * E.dx + (pi.y - pa.y) * E.dy;
          const len = (pb.x - pa.x) * E.dx + (pb.y - pa.y) * E.dy;
          if (along >= -eps && along <= len + eps) best = t;
        }
      }
    }
    return best;
  };

  let loops: Vert[][] = [pts.map((p, i) => make(p, 0, (i - 1 + n) % n, i, i))];
  let now = 0;
  let floor = 0;
  const limit = 50 * n + 200;
  for (let iter = 0; loops.length; iter++) {
    if (iter > limit) return null;
    const t = nextEvent(loops, now, floor);
    if (!Number.isFinite(t)) return null;
    now = Math.max(now, t);
    const before = ops;
    const work = loops.slice();
    const settled: Vert[][] = [];
    for (let guard = 0; work.length; guard++) {
      if (guard > 100 * n + 1000) return null;
      const loop = clean(work.pop()!, now);
      if (!loop) continue;
      const s = findSplit(loop, now);
      if (s) work.push(...split(loop, s[0], s[1], now));
      else settled.push(loop);
    }
    loops = settled;
    // Nothing happened (a near miss): look past this moment next time so the loop can't stall.
    floor = ops > before ? now : now + eps;
  }
  return { nodes, segs };
}

/**
 * Chains each face's segments into a loop, starting with its own outline edge, then checks the result: the
 * sloped faces must be planar and tile the outline. Returns null if anything is off.
 */
function assemble(pts: Point[], edges: Edge[], sk: Skeleton, eps: number): number[][] | null {
  const n = pts.length;
  const { nodes } = sk;
  const cycles: number[][] = [];
  const tol = eps * 10;
  let area = 0;
  for (let j = 0; j < n; j++) {
    const E = edges[j];
    const flat = (id: number): Point => {
      const [x, y, t] = nodes[id];
      return E.w > 0 ? { x, y } : { x: (x - E.ax) * E.dx + (y - E.ay) * E.dy, y: t };
    };
    const seen = new Set<string>();
    const list: Seg[] = [];
    for (const [a, b] of sk.segs[j]) {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (a === b || seen.has(key)) continue;
      seen.add(key);
      list.push([a, b]);
    }
    const used = list.map(() => false);
    // Follows segments from prev→cur, always taking the sharpest left turn, until it gets back to `home`.
    const walk = (from: number, to: number): number[] | null => {
      const path = [from, to];
      let [prev, cur] = [from, to];
      for (let guard = 0; guard <= list.length; guard++) {
        const pc = flat(cur);
        const pp = flat(prev);
        const back = Math.atan2(pp.y - pc.y, pp.x - pc.x);
        let pick = -1;
        let pickTurn = Infinity;
        list.forEach(([a, b], s) => {
          if (used[s] || (a !== cur && b !== cur)) return;
          const o = flat(a === cur ? b : a);
          let turn = back - Math.atan2(o.y - pc.y, o.x - pc.x);
          turn = ((turn % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          if (turn < 1e-12) turn = 2 * Math.PI;
          if (turn < pickTurn) [pick, pickTurn] = [s, turn];
        });
        if (pick < 0) return null;
        used[pick] = true;
        const next = list[pick][0] === cur ? list[pick][1] : list[pick][0];
        if (next === from) return path;
        path.push(next);
        [prev, cur] = [cur, next];
      }
      return null;
    };
    const cycle = walk(j, (j + 1) % n);
    if (!cycle) return null;
    // A face can be pinched (two lobes touching at a corner): walk what's left and splice it in there.
    for (let s = used.indexOf(false); s >= 0; s = used.indexOf(false)) {
      used[s] = true;
      let lobe = walk(list[s][0], list[s][1]);
      const at = lobe ? cycle.findIndex((id) => lobe!.includes(id)) : -1;
      if (!lobe || at < 0) continue;
      if (signedArea(lobe.map(flat)) < 0) lobe = lobe.reverse();
      const k = lobe.indexOf(cycle[at]);
      cycle.splice(at + 1, 0, ...lobe.slice(k + 1), ...lobe.slice(0, k), cycle[at]);
    }
    // Planar: every corner of a sloped face is as high as its distance in from the edge; a gable's lie on it.
    for (const id of cycle) {
      const [x, y, t] = nodes[id];
      const off = E.nx * x + E.ny * y - E.c;
      if (Math.abs(E.w > 0 ? off - E.w * t : off) > tol * 10) return null;
    }
    if (E.w > 0) {
      const a = signedArea(cycle.map((id) => ({ x: nodes[id][0], y: nodes[id][1] })));
      if (a < -tol * tol) return null;
      area += a;
    }
    cycles.push(cycle);
  }
  const whole = signedArea(pts);
  if (Math.abs(area - whole) > 1e-7 * whole) return null;
  return cycles;
}

/** The outline with repeated and in-line points dropped; runs[k] lists the input edges cleaned edge k covers. */
interface Clean {
  pts: Point[];
  runs: number[][];
  gable: boolean[];
}

function cleanOutline(outline: Point[], gable: boolean[], tol: number): Clean {
  const pts = outline.map((p) => ({ x: p.x, y: p.y }));
  const runs = outline.map((_, i) => [i]);
  const gab = outline.map((_, i) => !!gable[i]);
  for (let changed = true; changed && pts.length >= 3;) {
    changed = false;
    const m = pts.length;
    for (let i = 0; i < m; i++) {
      const h = (i - 1 + m) % m;
      const p = pts[h];
      const q = pts[i];
      const r = pts[(i + 1) % m];
      const la = hyp(q.x - p.x, q.y - p.y);
      const lb = hyp(r.x - q.x, r.y - q.y);
      const inLine = Math.abs((q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x)) <= 1e-9 * la * lb;
      if (la > tol && lb > tol && !inLine) continue;
      // Merge edge h (p to q) with edge i (q to r). A zero-length edge takes the other's gable flag.
      gab[h] = la <= tol ? gab[i] : lb <= tol ? gab[h] : gab[h] && gab[i];
      runs[h] = runs[h].concat(runs[i]);
      pts.splice(i, 1);
      runs.splice(i, 1);
      gab.splice(i, 1);
      changed = true;
      break;
    }
  }
  return { pts, runs, gable: gab };
}

const p3 = (x: number, y: number, z: number): Point3 => ({ x, y, z });

/** One line per input edge: eave for eave edges, verge for gable edges. */
function outlineLines(outline: Point[], clean: Clean, tol: number): RoofLine[] {
  const n = outline.length;
  const lines: RoofLine[] = [];
  clean.runs.forEach((run, k) =>
    run.forEach((i) => {
      const a = outline[i];
      const b = outline[(i + 1) % n];
      if (hyp(b.x - a.x, b.y - a.y) <= tol) return;
      lines.push({ a: p3(a.x, a.y, 0), b: p3(b.x, b.y, 0), kind: clean.gable[k] ? 'verge' : 'eave' });
    }),
  );
  return lines;
}

/** The input edge a cleaned edge's face is filed under: the first of its run with any length. */
function runEdge(outline: Point[], run: number[], tol: number): number {
  const n = outline.length;
  const ok = run.find((i) => hyp(outline[(i + 1) % n].x - outline[i].x, outline[(i + 1) % n].y - outline[i].y) > tol);
  return ok ?? run[0];
}

function emptyShape(): RoofShape {
  return { faces: [], lines: [], heightAt: () => null, peak: 0 };
}

/** The fail-safe: a flat roof over the outline. */
function flatShape(outline: Point[], clean: Clean, tol: number): RoofShape {
  const poly = clean.pts;
  return {
    faces: [{ edge: runEdge(outline, clean.runs[0], tol), vertical: false, points: poly.map((p) => p3(p.x, p.y, 0)) }],
    lines: outlineLines(outline, clean, tol),
    heightAt: (p) => (covers(poly, p, tol * 100) ? 0 : null),
    peak: 0,
  };
}

/**
 * Sorts the face boundaries into roof lines. A boundary shared by two sloped faces is a ridge when level, else a
 * hip where the faces meet at a convex angle and a valley at a concave one; between a sloped face and a gable it
 * is a verge (the rake). Lines standing straight up (the corners between two vertical faces) are left out, and so
 * are lines between two faces in one plane.
 */
function skeletonLines(edges: Edge[], nodes: Node3[], cycles: number[][], slope: number, eps: number): RoofLine[] {
  const used = [...new Set(cycles.flat())];
  const pieces = (a: number, b: number): number[] => {
    const A = nodes[a];
    const B = nodes[b];
    const e = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const l2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
    const inner: [number, number][] = [];
    for (const id of used) {
      if (id === a || id === b || l2 === 0) continue;
      const C = nodes[id];
      const u = ((C[0] - A[0]) * e[0] + (C[1] - A[1]) * e[1] + (C[2] - A[2]) * e[2]) / l2;
      if (u <= 0 || u >= 1) continue;
      if (hyp(A[0] + u * e[0] - C[0], A[1] + u * e[1] - C[1], A[2] + u * e[2] - C[2]) <= eps) inner.push([u, id]);
    }
    inner.sort((p, q) => p[0] - q[0]);
    return [a, ...inner.map((p) => p[1]), b];
  };
  const shared = new Map<string, { f: number; a: number; b: number }[]>();
  cycles.forEach((cycle, f) => {
    for (let i = 1; i < cycle.length; i++) {
      const run = pieces(cycle[i], cycle[(i + 1) % cycle.length]);
      for (let k = 0; k + 1 < run.length; k++) {
        const [a, b] = [run[k], run[k + 1]];
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const list = shared.get(key) ?? [];
        list.push({ f, a, b });
        shared.set(key, list);
      }
    }
  });
  const lines: RoofLine[] = [];
  for (const sides of shared.values()) {
    const { a, b } = sides[0];
    const A = nodes[a];
    const B = nodes[b];
    if (hyp(A[0] - B[0], A[1] - B[1]) <= eps) continue;
    const level = Math.abs(A[2] - B[2]) <= eps;
    const sloped = sides.filter((s) => edges[s.f].w > 0);
    let kind: RoofLineKind;
    if (sloped.length >= 2) {
      const [s, o] = sloped;
      const E = edges[s.f];
      const G = edges[o.f];
      if (Math.abs(E.nx - G.nx) + Math.abs(E.ny - G.ny) <= 1e-9 && Math.abs(E.c - G.c) <= eps) continue;
      // Face s lies to the left of its own a→b; the roof is convex there if s's plane dips below o's.
      const ex = nodes[s.b][0] - nodes[s.a][0];
      const ey = nodes[s.b][1] - nodes[s.a][1];
      kind = level ? 'ridge' : (E.nx - G.nx) * -ey + (E.ny - G.ny) * ex < 0 ? 'hip' : 'valley';
    } else if (sloped.length === 1) {
      kind = sides.length >= 2 ? 'verge' : level ? 'ridge' : 'hip';
    } else if (sides.length === 1) {
      kind = 'verge';
    } else {
      continue;
    }
    const [lo, hi] = A[2] <= B[2] ? [A, B] : [B, A];
    lines.push({ a: p3(lo[0], lo[1], lo[2] * slope), b: p3(hi[0], hi[1], hi[2] * slope), kind });
  }
  return lines;
}

/**
 * A hipped (all weights 1), gabled (some weights 0) or mixed roof by the weighted straight skeleton. `gable[i]`
 * true makes edge i a gable: it stays put and its face is a vertical wall up to the roof. Works for any simple
 * outline in either winding; points in line are dropped first (a run of edges in line becomes one face, filed
 * under the run's first edge, and is a gable only if every edge in it is). With slope 0 the roof is flat and
 * gable faces are left out. A gable meeting a reflex corner carries on as a wall into the plan (the roof steps
 * there, as the weighted skeleton has it). Never throws: if the skeleton can't be built (say gables wall in a pocket no eave
 * reaches) the roof is hipped all round instead, and if that fails too, or every edge is a gable, it is flat.
 */
export function skeletonRoof(outline: Point[], slope: number, gable: boolean[] = []): RoofShape {
  const rise = Number.isFinite(slope) && slope > 0 ? slope : 0;
  const scale = extent(outline);
  if (!(scale > 0) || outline.length < 3) return emptyShape();
  const tol = 1e-9 * scale;
  const clean = cleanOutline(outline, gable, tol);
  const m = clean.pts.length;
  if (m < 3 || Math.abs(signedArea(clean.pts)) <= tol * scale) return emptyShape();
  // Work counter-clockwise (y up): q-edge j is clean edge cEdge(j).
  const flip = signedArea(clean.pts) < 0;
  const q = flip ? clean.pts.slice().reverse() : clean.pts;
  const cEdge = (j: number) => (flip ? (2 * m - 2 - j) % m : j);
  const edges = q.map((a, j) => makeEdge(a, q[(j + 1) % m], clean.gable[cEdge(j)] ? 0 : 1));
  const eps = 1e-7 * scale;
  const sk = wavefront(q, edges, eps);
  const cycles = sk && assemble(q, edges, sk, eps);
  if (!sk || !cycles) {
    // A pocket walled in by gables alone can't be roofed: hip it all instead (or lie flat if nothing is an eave).
    const some = clean.gable.some(Boolean) && !clean.gable.every(Boolean);
    return some ? skeletonRoof(outline, slope) : flatShape(outline, clean, tol);
  }

  const { nodes } = sk;
  const faces: RoofFace[] = [];
  const planes: { poly: Point[]; e: Edge }[] = [];
  cycles.forEach((cycle, j) => {
    const e = edges[j];
    if (e.w > 0) planes.push({ poly: cycle.map((id) => ({ x: nodes[id][0], y: nodes[id][1] })), e });
    if (e.w === 0 && rise === 0) return;
    let ids = cycle;
    if (flip) {
      const r = cycle.slice().reverse();
      ids = [...r.slice(r.length - 2), ...r.slice(0, r.length - 2)];
    }
    const points = ids.map((id) => p3(nodes[id][0], nodes[id][1], nodes[id][2] * rise));
    faces.push({ edge: runEdge(outline, clean.runs[cEdge(j)], tol), vertical: e.w === 0, points });
  });
  faces.sort((a, b) => a.edge - b.edge);
  const peak = Math.max(0, ...cycles.flat().map((id) => nodes[id][2])) * rise;
  const near = eps * 10;
  const heightAt = (p: Point): number | null => {
    if (!covers(q, p, near)) return null;
    let best: Edge | null = null;
    let bestD = Infinity;
    for (const { poly, e } of planes) {
      if (covers(poly, p, near)) {
        best = e;
        break;
      }
      const d = boundaryDist(poly, p);
      if (d < bestD) [best, bestD] = [e, d];
    }
    if (!best) return 0;
    return Math.min(peak, Math.max(0, (best.nx * p.x + best.ny * p.y - best.c) * rise));
  };
  return {
    faces,
    lines: [...outlineLines(outline, clean, tol), ...skeletonLines(edges, nodes, cycles, rise, near)],
    heightAt,
    peak,
  };
}

/**
 * A single sloping plane rising from the low edge; every other edge is a vertical face up to the plane. The
 * plane's height is the distance in from the low edge's line × slope; if part of the outline lies behind that
 * line the whole plane is lifted so its lowest corner is at 0 (and the low edge gets a vertical face too).
 * Lines: the low edge is the eave, the other outline edges and the plane's edges on top of the walls are verges.
 */
export function shedRoof(outline: Point[], slope: number, lowEdge: number): RoofShape {
  const rise = Number.isFinite(slope) && slope > 0 ? slope : 0;
  const n = outline.length;
  const scale = extent(outline);
  if (n < 3 || !(scale > 0) || Math.abs(signedArea(outline)) <= 1e-9 * scale * scale) return emptyShape();
  const tol = 1e-9 * scale;
  const k = ((Math.floor(Number.isFinite(lowEdge) ? lowEdge : 0) % n) + n) % n;
  const a = outline[k];
  const b = outline[(k + 1) % n];
  const len = hyp(b.x - a.x, b.y - a.y);
  const sign = signedArea(outline) >= 0 ? 1 : -1;
  const nx = len > tol ? (-(b.y - a.y) / len) * sign : 0;
  const ny = len > tol ? ((b.x - a.x) / len) * sign : 0;
  const along = (p: Point) => nx * (p.x - a.x) + ny * (p.y - a.y);
  const low = Math.min(0, ...outline.map(along));
  const h = (p: Point) => (along(p) - low) * rise;
  const peak = Math.max(0, ...outline.map(h));
  const tiny = tol * Math.max(rise, 1);
  const at = (i: number) => outline[((i % n) + n) % n];

  const faces: RoofFace[] = [];
  const lines: RoofLine[] = [];
  faces.push({ edge: k, vertical: false, points: outline.map((_, i) => at(k + i)).map((p) => p3(p.x, p.y, h(p))) });
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const r = at(i + 1);
    if (hyp(r.x - p.x, r.y - p.y) <= tol) continue;
    lines.push({ a: p3(p.x, p.y, 0), b: p3(r.x, r.y, 0), kind: i === k ? 'eave' : 'verge' });
    const [hp, hr] = [h(p), h(r)];
    if (hp <= tiny && hr <= tiny) continue;
    const points = [p3(p.x, p.y, 0), p3(r.x, r.y, 0)];
    if (hr > tiny) points.push(p3(r.x, r.y, hr));
    if (hp > tiny) points.push(p3(p.x, p.y, hp));
    faces.push({ edge: i, vertical: true, points });
    const [lo, hi] = hp <= hr ? [p3(p.x, p.y, hp), p3(r.x, r.y, hr)] : [p3(r.x, r.y, hr), p3(p.x, p.y, hp)];
    lines.push({ a: lo, b: hi, kind: 'verge' });
  }
  const near = tol * 100;
  return {
    faces,
    lines,
    heightAt: (p) => (covers(outline, p, near) ? Math.min(peak, Math.max(0, h(p))) : null),
    peak,
  };
}
