/**
 * Flat line drawings of the 3D model, seen from the side: sections and elevations. Pure.
 *
 * The model is broken into prisms (an outline pushed through a distance), their faces are
 * projected onto an upright drawing plane, and every edge is kept only where no face hides it and
 * where it is a real edge (a corner, an outline or a step back), not a joint between two pieces of
 * the same flat surface. A section also cuts the prisms at its plane: what is cut comes back as
 * filled outlines, and only what lies beyond the cut is drawn.
 *
 * Coordinates: scene metres (x, y up, z = plan y). On the drawing, u runs to the right, v is the
 * height and d the distance away from the viewer.
 */

/** A 2D point on the drawing: [u, v] in metres. */
export type P2 = [number, number];
/** A 3D point on the drawing: [u, v, d] in metres. */
type P3 = [number, number, number];
/** A scene point: [x, y, z] in metres. */
export type V3 = [number, number, number];

/** An outline (with any holes, all as scene points) pushed through `extrude` (a scene vector). */
export interface Prism {
  rings: V3[][];
  extrude: V3;
}

/** Where the drawing is seen from: a point and the (level) direction looked in, in scene x/z. */
export interface ViewFrame {
  origin: { x: number; z: number };
  /** The way the viewer looks, a unit vector in x/z. */
  look: { x: number; z: number };
  /** Cut the model at the plane through the origin (a section), or see all of it (an elevation). */
  cut: boolean;
  /** Leave out everything below this height (an elevation hides what is underground). */
  minV?: number;
}

/** A line of the drawing. `heavy` marks an outline against the sky or empty space. */
export interface Line2 {
  a: P2;
  b: P2;
  heavy?: boolean;
}

/** Everything the model shows from one side. */
export interface Projection {
  /** Cut through (sections only): each an outline and its holes, filled solid. */
  cut: P2[][][];
  /** Visible edges beyond the cut (or all visible edges, for an elevation). */
  lines: Line2[];
  /** Extent of what is drawn, or null when nothing is. */
  bounds: { minU: number; maxU: number; minV: number; maxV: number } | null;
}

/** Depths closer than this (metres) count as the same surface. */
const EPS = 1e-4;
/** How far to each side of an edge to look for the surfaces meeting there. */
const SIDE = 2e-3;

/** The right-hand direction on the drawing, in scene x/z, for a viewer looking along `look`. */
export function rightOf(look: { x: number; z: number }): { x: number; z: number } {
  return { x: -look.z, z: look.x };
}

function toView(frame: ViewFrame): (p: V3) => P3 {
  const r = rightOf(frame.look);
  const { x: ox, z: oz } = frame.origin;
  return ([x, y, z]) => [(x - ox) * r.x + (z - oz) * r.z, y, (x - ox) * frame.look.x + (z - oz) * frame.look.z];
}

interface Face {
  rings: P3[][];
  /** Depth plane: d = d0 + du * u + dv * v. */
  d0: number;
  du: number;
  dv: number;
  /** Unit normal (for telling flat joints from corners). */
  n: P3;
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  /** A cut surface (a section's black fill), at the plane of the cut. */
  cut?: boolean;
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Newell's normal of a ring (not normalised). */
function newell(ring: P3[]): P3 {
  const n: P3 = [0, 0, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

/** A face on the drawing, or null when it is seen edge-on (it hides nothing). */
function makeFace(rings: P3[][], cut = false): Face | null {
  const outer = rings[0];
  if (!outer || outer.length < 3) return null;
  const nn = newell(outer);
  const len = Math.hypot(nn[0], nn[1], nn[2]);
  if (len < 1e-12) return null;
  const n: P3 = [nn[0] / len, nn[1] / len, nn[2] / len];
  if (Math.abs(n[2]) < 1e-6) return null;
  const p = outer[0];
  const du = -n[0] / n[2];
  const dv = -n[1] / n[2];
  const d0 = p[2] - du * p[0] - dv * p[1];
  let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const q of outer) {
    minU = Math.min(minU, q[0]);
    maxU = Math.max(maxU, q[0]);
    minV = Math.min(minV, q[1]);
    maxV = Math.max(maxV, q[1]);
  }
  return { rings, d0, du, dv, n, minU, maxU, minV, maxV, cut };
}

const depthAt = (f: Face, u: number, v: number) => f.d0 + f.du * u + f.dv * v;

/** Even-odd point in polygon over all rings (holes included). */
function inside(rings: { 0: number; 1: number }[][], u: number, v: number): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ui, vi] = [ring[i][0], ring[i][1]];
      const [uj, vj] = [ring[j][0], ring[j][1]];
      if (vi > v !== vj > v && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) hit = !hit;
    }
  }
  return hit;
}

/** Keep the part of a ring at depth d >= 0 (Sutherland–Hodgman against one plane). */
function clipRing(ring: P3[]): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ina = a[2] >= 0;
    const inb = b[2] >= 0;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = a[2] / (a[2] - b[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0]);
    }
  }
  return out;
}

/** The faces of a prism, as rings of scene points: its two ends and a side per outline edge. */
function prismFaces(prism: Prism): V3[][][] {
  const e = prism.extrude;
  const shift = (p: V3): V3 => [p[0] + e[0], p[1] + e[1], p[2] + e[2]];
  const faces: V3[][][] = [prism.rings, prism.rings.map((r) => r.map(shift))];
  for (const ring of prism.rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      faces.push([[a, b, shift(b), shift(a)]]);
    }
  return faces;
}

/**
 * Where a straight line (through `o`, along unit `dir`, in the ring's own 2D coordinates) is inside
 * the rings: parameter intervals along it.
 */
function lineIntervals(rings: [number, number][][], o: [number, number], dir: [number, number]): [number, number][] {
  const ts: number[] = [];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      // Solve o + t*dir = a + s*(b - a).
      const ex = b[0] - a[0];
      const ey = b[1] - a[1];
      const den = dir[0] * -ey - dir[1] * -ex;
      if (Math.abs(den) < 1e-12) continue;
      const rx = a[0] - o[0];
      const ry = a[1] - o[1];
      const t = (rx * -ey - ry * -ex) / den;
      const s = (dir[0] * ry - dir[1] * rx) / den;
      // Half-open, so a line through a corner counts it once.
      if (s >= 0 && s < 1) ts.push(t);
    }
  ts.sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ts.length; i += 2) if (ts[i + 1] - ts[i] > 1e-9) out.push([ts[i], ts[i + 1]]);
  return out;
}

/** Where a prism crosses the plane d = 0: filled outlines on the drawing (each with its holes). */
function cutOf(prism: Prism, view: (p: V3) => P3): P2[][][] {
  const e = prism.extrude;
  const rings = prism.rings.map((r) => r.map(view));
  const ev = sub(view(e), view([0, 0, 0]));
  const out: P2[][][] = [];
  const outer = rings[0];
  if (!outer || outer.length < 3) return out;
  const all = [...outer, ...outer.map((p): P3 => [p[0] + ev[0], p[1] + ev[1], p[2] + ev[2]])];
  if (Math.min(...all.map((p) => p[2])) >= 0 || Math.max(...all.map((p) => p[2])) <= 0) return out;
  const upright = Math.abs(ev[0]) < 1e-9 && Math.abs(ev[2]) < 1e-9;
  if (upright) {
    // Pushed straight up (walls, slabs, stairs): cut the plan outline along the line d = 0.
    const y0 = outer[0][1];
    const flat = rings.map((r) => r.map((p): [number, number] => [p[0], p[2]]));
    const lo = Math.min(y0, y0 + ev[1]);
    const hi = Math.max(y0, y0 + ev[1]);
    for (const [t0, t1] of lineIntervals(flat, [0, 0], [1, 0]))
      out.push([
        [
          [t0, lo],
          [t1, lo],
          [t1, hi],
          [t0, hi],
        ],
      ]);
    return out;
  }
  // Pushed sideways (panels round shaped openings): the outline is upright, in its own plane.
  const a = rings[0][0];
  const n = newell(outer);
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const along: P3 = (() => {
    // A level direction in the outline's plane.
    const h: P3 = [n[2], 0, -n[0]];
    const l = Math.hypot(h[0], h[2]) || 1;
    return [h[0] / l, 0, h[2] / l];
  })();
  const toLocal = (p: P3): [number, number] => {
    const q = sub(p, a);
    return [q[0] * along[0] + q[2] * along[2], q[1]];
  };
  const local = rings.map((r) => r.map(toLocal));
  if (Math.abs(n[2] / nl) > 0.95) {
    // The cut runs along the outline's face: the cut is the outline itself, where the plane is.
    const t = a[2] === ev[2] ? 0 : -a[2] / ev[2];
    if (t < 0 || t > 1) return out;
    out.push(rings.map((r) => r.map((p): P2 => [p[0] + ev[0] * t, p[1]])));
    return out;
  }
  // The cut runs across it: slice the outline at the middle of its depth.
  if (Math.abs(along[2]) < 1e-9) return out;
  // Where along the outline the plane is, at the front and at the back of its depth.
  const s0 = -a[2] / along[2];
  const s1 = -(a[2] + ev[2]) / along[2];
  const mid = (s0 + s1) / 2;
  const u0 = a[0] + along[0] * s0;
  const u1 = a[0] + ev[0] + along[0] * s1;
  const [ulo, uhi] = [Math.min(u0, u1), Math.max(u0, u1)];
  if (uhi - ulo < 1e-6) return out;
  for (const [t0, t1] of lineIntervals(local, [mid, 0], [0, 1])) {
    const [vlo, vhi] = [a[1] + t0, a[1] + t1];
    out.push([
      [
        [ulo, vlo],
        [uhi, vlo],
        [uhi, vhi],
        [ulo, vhi],
      ],
    ]);
  }
  return out;
}

/** A uniform grid over the drawing, so each edge only tests the faces near it. */
class FaceGrid {
  private cells = new Map<string, number[]>();
  constructor(
    private faces: Face[],
    private size: number,
  ) {
    faces.forEach((f, i) => {
      for (let cu = Math.floor(f.minU / size); cu <= Math.floor(f.maxU / size); cu++)
        for (let cv = Math.floor(f.minV / size); cv <= Math.floor(f.maxV / size); cv++) {
          const key = `${cu},${cv}`;
          const list = this.cells.get(key);
          if (list) list.push(i);
          else this.cells.set(key, [i]);
        }
    });
  }
  near(minU: number, maxU: number, minV: number, maxV: number): Face[] {
    const seen = new Set<number>();
    const s = this.size;
    for (let cu = Math.floor(minU / s); cu <= Math.floor(maxU / s); cu++)
      for (let cv = Math.floor(minV / s); cv <= Math.floor(maxV / s); cv++)
        for (const i of this.cells.get(`${cu},${cv}`) ?? []) seen.add(i);
    return [...seen].map((i) => this.faces[i]);
  }
}

/** Parameters (0..1) where segment a–b crosses a ring's edges. */
function crossings(a: P2, b: P2, rings: P3[][], out: number[]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const ring of rings)
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      const q = ring[(i + 1) % ring.length];
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-14) continue;
      const rx = p[0] - a[0];
      const ry = p[1] - a[1];
      const t = (rx * ey - ry * ex) / den;
      const s = (rx * dy - ry * dx) / den;
      if (t > 0 && t < 1 && s >= -1e-9 && s <= 1 + 1e-9) out.push(t);
    }
}

/** What an edge meets at one point: hidden, a joint in a flat surface, an outline, or a plain edge. */
type Seen = 'hidden' | 'joint' | 'outline' | 'edge';

function classify(near: Face[], u: number, v: number, d: number, pu: number, pv: number): Seen {
  for (const f of near) {
    if (u < f.minU - EPS || u > f.maxU + EPS || v < f.minV - EPS || v > f.maxV + EPS) continue;
    if (depthAt(f, u, v) < d - EPS && inside(f.rings, u, v)) return 'hidden';
  }
  /** The nearest face just to one side of the edge. */
  const nearest = (qu: number, qv: number): Face | null => {
    let best: Face | null = null;
    let bestD = Infinity;
    for (const f of near) {
      if (qu < f.minU || qu > f.maxU || qv < f.minV || qv > f.maxV) continue;
      const fd = depthAt(f, qu, qv);
      if (fd < bestD - EPS && inside(f.rings, qu, qv)) {
        best = f;
        bestD = fd;
      }
    }
    return best;
  };
  const one = nearest(u + pu * SIDE, v + pv * SIDE);
  const two = nearest(u - pu * SIDE, v - pv * SIDE);
  const d1 = one ? depthAt(one, u, v) : Infinity;
  const d2 = two ? depthAt(two, u, v) : Infinity;
  // Something nearer meets it on either side: the edge runs along (or behind) that thing's outline.
  if (d1 < d - 10 * EPS || d2 < d - 10 * EPS) return 'hidden';
  const at1 = Math.abs(d1 - d) <= 10 * EPS;
  const at2 = Math.abs(d2 - d) <= 10 * EPS;
  if (at1 && at2) {
    const same = one!.n[0] * two!.n[0] + one!.n[1] * two!.n[1] + one!.n[2] * two!.n[2] > 1 - 1e-6;
    return same ? 'joint' : 'edge';
  }
  // A surface on one side and nothing at all on the other: an outline against the sky.
  if ((at1 && !two) || (at2 && !one)) return 'outline';
  return 'edge';
}

/** Project prisms onto the drawing: a section's cut, and the visible lines. */
export function project(prisms: Prism[], frame: ViewFrame): Projection {
  const view = toView(frame);
  const faces: Face[] = [];
  const cut: P2[][][] = [];
  /** Edges keyed by their rounded ends, so an edge shared by two faces is drawn once. */
  const edges = new Map<string, [P3, P3]>();
  const key = (p: P3) => `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)},${Math.round(p[2] * 1e4)}`;

  for (const prism of prisms) {
    if (frame.cut) cut.push(...cutOf(prism, view));
    for (const face of prismFaces(prism)) {
      let rings = face.map((r) => r.map(view));
      if (frame.cut) rings = rings.map(clipRing).filter((r) => r.length >= 3);
      if (!rings.length) continue;
      const f = makeFace(rings);
      if (f) faces.push(f);
      for (const ring of rings)
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % ring.length];
          // Seen end-on, it is only a point.
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
          // Along the cut itself: drawn as the cut's outline.
          if (frame.cut && Math.abs(a[2]) < 1e-6 && Math.abs(b[2]) < 1e-6) continue;
          const [ka, kb] = [key(a), key(b)];
          const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
          if (!edges.has(k)) edges.set(k, [a, b]);
        }
    }
  }
  for (const piece of cut) {
    const f = makeFace(
      piece.map((r) => r.map((p): P3 => [p[0], p[1], 0])),
      true,
    );
    if (f) faces.push(f);
  }

  const span = faces.reduce((m, f) => Math.max(m, f.maxU - f.minU, f.maxV - f.minV), 0);
  const grid = new FaceGrid(faces, Math.max(0.5, Math.min(4, span / 8 || 1)));
  const lines: Line2[] = [];
  for (const [a, b] of edges.values()) lines.push(...visibleParts(a, b, grid));

  const minV = frame.minV;
  const shown = minV === undefined ? lines : clipBelow(lines, minV);
  return { cut, lines: mergeLines(shown), bounds: boundsOf(cut, shown) };
}

/** The visible pieces of one edge. */
function visibleParts(a: P3, b: P3, grid: FaceGrid): Line2[] {
  const minU = Math.min(a[0], b[0]) - SIDE;
  const maxU = Math.max(a[0], b[0]) + SIDE;
  const minV = Math.min(a[1], b[1]) - SIDE;
  const maxV = Math.max(a[1], b[1]) + SIDE;
  const near = grid.near(minU, maxU, minV, maxV);
  const a2: P2 = [a[0], a[1]];
  const b2: P2 = [b[0], b[1]];
  const ts = [0, 1];
  for (const f of near) {
    if (maxU < f.minU || minU > f.maxU || maxV < f.minV || minV > f.maxV) continue;
    crossings(a2, b2, f.rings, ts);
    // Where the edge passes through the face's depth.
    const ga = a[2] - depthAt(f, a[0], a[1]);
    const gb = b[2] - depthAt(f, b[0], b[1]);
    if (ga * gb < 0) ts.push(ga / (ga - gb));
  }
  ts.sort((x, y) => x - y);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const pu = -(b[1] - a[1]) / len;
  const pv = (b[0] - a[0]) / len;
  const out: Line2[] = [];
  let run: { t0: number; t1: number; heavy: boolean } | null = null;
  const flush = () => {
    if (run && run.t1 - run.t0 > 1e-9) {
      const at = (t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      out.push({ a: at(run.t0), b: at(run.t1), ...(run.heavy && { heavy: true }) });
    }
    run = null;
  };
  for (let i = 0; i + 1 < ts.length; i++) {
    const [t0, t1] = [ts[i], ts[i + 1]];
    if (t1 - t0 < 1e-9) continue;
    const t = (t0 + t1) / 2;
    const u = a[0] + (b[0] - a[0]) * t;
    const v = a[1] + (b[1] - a[1]) * t;
    const d = a[2] + (b[2] - a[2]) * t;
    const seen = classify(near, u, v, d, pu, pv);
    if (seen === 'hidden' || seen === 'joint') {
      flush();
      continue;
    }
    const heavy = seen === 'outline';
    if (run && run.heavy === heavy && Math.abs(run.t1 - t0) < 1e-9) run.t1 = t1;
    else {
      flush();
      run = { t0, t1, heavy };
    }
  }
  flush();
  return out;
}

/** Cut lines off below a height. */
function clipBelow(lines: Line2[], minV: number): Line2[] {
  const out: Line2[] = [];
  for (const l of lines) {
    const [a, b] = [l.a, l.b];
    if (a[1] < minV - 1e-9 && b[1] < minV - 1e-9) continue;
    if (a[1] >= minV - 1e-9 && b[1] >= minV - 1e-9) {
      out.push(l);
      continue;
    }
    const t = (minV - a[1]) / (b[1] - a[1]);
    const m: P2 = [a[0] + (b[0] - a[0]) * t, minV];
    out.push({ ...l, ...(a[1] < minV ? { a: m } : { b: m }) });
  }
  return out;
}

/** Join lines that carry on in a straight line (edges of pieces laid end to end), and drop repeats. */
export function mergeLines(lines: Line2[]): Line2[] {
  const groups = new Map<string, { t0: number; t1: number; heavy: boolean; o: P2; dir: P2 }[]>();
  for (const l of lines) {
    // Point every line the same way, so lines along one straight line match.
    const flip = l.b[0] - l.a[0] < -1e-12 || (Math.abs(l.b[0] - l.a[0]) <= 1e-12 && l.b[1] < l.a[1]);
    const a = flip ? l.b : l.a;
    const dx = Math.abs(l.b[0] - l.a[0]) <= 1e-12 ? 0 : Math.abs(l.b[0] - l.a[0]);
    const dy = flip ? l.a[1] - l.b[1] : l.b[1] - l.a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const dir: P2 = [dx / len, dy / len];
    // The line's own offset from the origin, and its angle, name the straight line it is on.
    const off = a[0] * -dir[1] + a[1] * dir[0];
    const k = `${Math.round(Math.atan2(dir[1], dir[0]) * 1e5)}:${Math.round(off * 1e4)}:${l.heavy ? 1 : 0}`;
    const t0 = a[0] * dir[0] + a[1] * dir[1];
    const list = groups.get(k) ?? [];
    list.push({ t0, t1: t0 + len, heavy: !!l.heavy, o: [-dir[1] * off, dir[0] * off], dir });
    groups.set(k, list);
  }
  const out: Line2[] = [];
  for (const list of groups.values()) {
    list.sort((x, y) => x.t0 - y.t0);
    let cur = { ...list[0] };
    const push = (c: typeof cur) =>
      out.push({
        a: [c.o[0] + c.dir[0] * c.t0, c.o[1] + c.dir[1] * c.t0],
        b: [c.o[0] + c.dir[0] * c.t1, c.o[1] + c.dir[1] * c.t1],
        ...(c.heavy && { heavy: true }),
      });
    for (const next of list.slice(1)) {
      if (next.t0 <= cur.t1 + 1e-6) cur.t1 = Math.max(cur.t1, next.t1);
      else {
        push(cur);
        cur = { ...next };
      }
    }
    push(cur);
  }
  return out;
}

function boundsOf(cut: P2[][][], lines: Line2[]): Projection['bounds'] {
  let [minU, maxU, minV, maxV] = [Infinity, -Infinity, Infinity, -Infinity];
  const add = (p: P2) => {
    minU = Math.min(minU, p[0]);
    maxU = Math.max(maxU, p[0]);
    minV = Math.min(minV, p[1]);
    maxV = Math.max(maxV, p[1]);
  };
  cut.forEach((poly) => poly[0]?.forEach(add));
  lines.forEach((l) => (add(l.a), add(l.b)));
  return minU === Infinity ? null : { minU, maxU, minV, maxV };
}
