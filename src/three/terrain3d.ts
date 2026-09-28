/**
 * The site in 3D: the ground as meshes (the plot's lawn, the natural ground round it, levelled areas
 * and the banks between them), the neighbouring buildings and roads, and how walls, the plinth and
 * steps reach down to the ground. Scene units are metres (x = plan x, z = plan y, y up); the ground's
 * heights are in mm. Pure.
 */
import { pointInPolygon } from '../geometry';
import { MM_PER_UNIT } from '../lib/scale';
import { groundOf, type Ground } from '../lib/terrain/ground';
import { boundsOf, meshArea } from '../lib/terrain/surface';
import type { ContextItem, PlanDoc, Point } from '../types';
import type { Look, Slab3D, Solid } from './model';

/** Metres per plan unit. */
const M = MM_PER_UNIT / 1000;

export type TerrainKind = 'lawn' | 'natural' | 'pad' | 'bank' | 'road';

/** A piece of ground as triangles, in metres. */
export interface TerrainMesh {
  /** What it is: the plot's lawn, the natural ground, a levelled area, the bank between two, or a road. */
  kind: TerrainKind;
  /** Corners, three numbers (x, y, z) each. */
  positions: number[];
  /** Triangles, three corner indices each (facing up, for the flat kinds). */
  indices: number[];
  color: string;
  finish?: Look['finish'];
  opacity?: number;
  /** The plan item it shows (the plot, a levelled area, a road), for picking. */
  id?: string;
  level?: string;
}

export interface Site {
  ground: Ground;
  /** The ground is flat at ±0 everywhere (no levels, nothing levelled): walls stand as they always did. */
  flat: boolean;
  terrain: TerrainMesh[];
  /** Neighbouring buildings, as blocks. */
  context: Slab3D[];
  /** The plot's lawn is flat at this height (m) and drawn as a floor; null when it follows the ground (a 'lawn' mesh). */
  lawnY: number | null;
  /** The height (mm) of the plot's own finished ground at a point inside it (its lawn). */
  lawnAt(x: number, y: number): number;
  /** Where the big ground plane goes (m): just under the lowest ground. */
  groundY: number;
}

const NATURAL = '#b7b58e';
const BANK = '#a48a6a';
const PAD = '#cdbf9c';
const ROAD = '#4b5563';
const BUILDING = '#d4d4d8';
const LAWN_OPACITY = 0.82;

/** The lawn follows the ground this finely (plan units: 0.5 m). */
const LAWN_CELL = 50;
/** The natural ground round the plot: this fine (1 m), reaching this far past everything (10 m)... */
const RING_CELL = 100;
const RING_MARGIN = 1000;
/** ...with about this many points at most (a coarser mesh for a big site). */
const RING_POINTS = 8000;
/** The ground plane lies this far (m) under the lowest ground. */
const PLANE_BELOW = 0.05;
/** Roads are sampled every 1 m and lie this far (m) over the ground. */
const ROAD_STEP = 100;
const ROAD_LIFT = 0.01;
const ROAD_WIDTH_MM = 6000;
const BUILDING_HEIGHT_MM = 6000;
/** Walls are stepped every 3 m or so, and the ground is read under them every 1 m. */
const WALL_STEP_M = 3;
const WALL_SAMPLE = 100;
/** The ground beside a wall is read this far (plan units: 100 mm) out from its faces. */
const FACE_GAP = 10;

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/** Whether two outlines overlap (a corner of one inside the other, or two edges crossing). */
function overlaps(a: Point[], b: Point[]): boolean {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return true;
  const side = (p: Point, q: Point, r: Point) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  for (let i = 0; i < a.length; i++) {
    const [p, q] = [a[i], a[(i + 1) % a.length]];
    for (let j = 0; j < b.length; j++) {
      const [r, s] = [b[j], b[(j + 1) % b.length]];
      if (side(p, q, r) * side(p, q, s) < 0 && side(r, s, p) * side(r, s, q) < 0) return true;
    }
  }
  return false;
}

const union = (boxes: (Box | null)[]): Box | null =>
  boxes.reduce<Box | null>(
    (u, b) =>
      !b
        ? u
        : !u
          ? { ...b }
          : {
              minX: Math.min(u.minX, b.minX),
              minY: Math.min(u.minY, b.minY),
              maxX: Math.max(u.maxX, b.maxX),
              maxY: Math.max(u.maxY, b.maxY),
            },
    null,
  );

const inBox = (p: Point, b: Box) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/** A flat mesh from meshArea (plan units, mm) in the scene, every triangle facing up. */
function toMesh(
  kind: TerrainKind,
  area: { points: Point[]; z: number[]; triangles: [number, number, number][] },
  look: Omit<TerrainMesh, 'kind' | 'positions' | 'indices'>,
): TerrainMesh | null {
  if (!area.triangles.length) return null;
  // Only the corners the triangles use (a hole's edge inside another hole has none).
  const positions: number[] = [];
  const index = new Map<number, number>();
  const corner = (i: number) => {
    let k = index.get(i);
    if (k === undefined) {
      k = positions.length / 3;
      index.set(i, k);
      positions.push(area.points[i].x * M, area.z[i] / 1000, area.points[i].y * M);
    }
    return k;
  };
  const indices: number[] = [];
  for (const [a, b, c] of area.triangles) {
    const [pa, pb, pc] = [area.points[a], area.points[b], area.points[c]];
    // Facing +y (scene z = plan y) needs (b - a) × (c - a) to point up.
    const up = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y);
    for (const i of up >= 0 ? [a, b, c] : [a, c, b]) indices.push(corner(i));
  }
  return { kind, positions, indices, ...look };
}

/** Points along a closed outline, every `step` or closer (as meshArea puts them), with each one's outward normal. */
function alongOutline(ring: Point[], step: number): { p: Point; out: Point }[] {
  let twice = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    twice += a.x * b.y - b.x * a.y;
  });
  const sign = twice >= 0 ? 1 : -1;
  const out: { p: Point; out: Point }[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) return;
    const normal = { x: (sign * (b.y - a.y)) / len, y: (-sign * (b.x - a.x)) / len };
    const n = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s <= n; s++)
      out.push({ p: { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n }, out: normal });
  });
  return out;
}

/**
 * An upright strip round an outline from `top` to `bottom` (both mm, functions of the point and its
 * outward normal): the bank between a levelled area and the ground outside it. Null where they meet.
 */
function bank(
  ring: Point[],
  step: number,
  top: (p: Point, out: Point) => number,
  bottom: (p: Point, out: Point) => number,
): TerrainMesh | null {
  const pts = alongOutline(ring, step);
  const positions: number[] = [];
  const indices: number[] = [];
  const hs = pts.map(({ p, out }) => [top(p, out), bottom(p, out)]);
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (a.p.x === b.p.x && a.p.y === b.p.y) continue; // the end of one edge is the start of the next
    const [[ta, ba], [tb, bb]] = [hs[i], hs[i + 1]];
    if (Math.abs(ta - ba) < 1 && Math.abs(tb - bb) < 1) continue;
    const k = positions.length / 3;
    positions.push(
      a.p.x * M,
      ba / 1000,
      a.p.y * M,
      b.p.x * M,
      bb / 1000,
      b.p.y * M,
      b.p.x * M,
      tb / 1000,
      b.p.y * M,
      a.p.x * M,
      ta / 1000,
      a.p.y * M,
    );
    indices.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  return indices.length ? { kind: 'bank', positions, indices, color: BANK } : null;
}

/** A road: a strip along its centre line, lying on the natural ground, left out where `keep` says. */
function roadStrip(
  road: ContextItem,
  height: (x: number, y: number) => number,
  keep: (p: Point) => boolean,
  look: Look,
): TerrainMesh | null {
  const line = road.points.filter((p, i) => i === 0 || p.x !== road.points[i - 1].x || p.y !== road.points[i - 1].y);
  if (line.length < 2) return null;
  const half = (road.widthMm ?? ROAD_WIDTH_MM) / MM_PER_UNIT / 2;
  const normalOf = (a: Point, b: Point) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  };
  // Stations along the line, each with the direction to offset it by (mitred at the corners).
  const stations: { p: Point; n: Point }[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const n = normalOf(a, b);
    let start = n;
    if (i > 0) {
      const before = normalOf(line[i - 1], a);
      const mx = before.x + n.x,
        my = before.y + n.y;
      const len = Math.hypot(mx, my);
      if (len > 1e-6) {
        const scale = 1 / Math.max(0.5, (mx / len) * n.x + (my / len) * n.y || 1);
        start = { x: (mx / len) * scale, y: (my / len) * scale };
      }
    }
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / ROAD_STEP));
    for (let s = 0; s < count; s++)
      stations.push({
        p: { x: a.x + ((b.x - a.x) * s) / count, y: a.y + ((b.y - a.y) * s) / count },
        n: s ? n : start,
      });
  }
  const last = line[line.length - 1];
  stations.push({ p: last, n: normalOf(line[line.length - 2], last) });

  const positions: number[] = [];
  const indices: number[] = [];
  const index = new Map<number, number>();
  const corners = (i: number) => {
    const known = index.get(i);
    if (known !== undefined) return known;
    const { p, n } = stations[i];
    const k = positions.length / 3;
    for (const side of [-1, 1]) {
      const x = p.x + n.x * half * side,
        y = p.y + n.y * half * side;
      positions.push(x * M, height(x, y) / 1000 + ROAD_LIFT, y * M);
    }
    index.set(i, k);
    return k;
  };
  for (let i = 0; i + 1 < stations.length; i++) {
    if (!keep(stations[i].p) || !keep(stations[i + 1].p)) continue;
    const [a, b] = [corners(i), corners(i + 1)];
    // Each quad as two triangles, turned to face up.
    for (const tri of [
      [a, a + 1, b + 1],
      [a, b + 1, b],
    ]) {
      const [p, q, r] = tri.map((k) => [positions[3 * k], positions[3 * k + 2]]);
      const up = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]);
      indices.push(...(up >= 0 ? tri : [tri[0], tri[2], tri[1]]));
    }
  }
  if (!indices.length) return null;
  return { kind: 'road', positions, indices, color: look.color, id: road.id, level: 'ground' };
}

/** How a site item looks: its material's colour (and pattern), or a colour of its own. */
export type LookOf = (material: string | undefined, fallback: string) => Look;

let last: { key: unknown[]; site: Site | null } | null = null;

/**
 * The plan's site in 3D, or null when there is nothing to show (the ground is flat at ±0 and there
 * are no neighbours). `pit` is the outline (plan units) the lawn opens over, round a basement.
 * Worked out again only when the ground, the materials, the pit or the neighbours change.
 */
export function siteOf(doc: PlanDoc, pit: Point[] | null, plotLook: Look, lookOf: LookOf): Site | null {
  const ground = groundOf(doc);
  const context = doc.elements.filter((el): el is ContextItem => el.type === 'context');
  const key = [
    ground,
    doc.materials,
    pit ? pit.map((p) => `${p.x},${p.y}`).join(' ') : '',
    plotLook.color,
    plotLook.finish?.pattern,
    plotLook.finish?.spanM,
    ...context,
  ];
  if (last && last.key.length === key.length && last.key.every((k, i) => k === key[i])) return last.site;
  const site = makeSite(ground, context, pit, plotLook, lookOf);
  last = { key, site };
  return site;
}

function makeSite(
  ground: Ground,
  context: ContextItem[],
  pit: Point[] | null,
  plotLook: Look,
  lookOf: LookOf,
): Site | null {
  const flat = !ground.shaped && !ground.graded;
  if (flat && !context.length) return null;
  const { plot, plotOutline, pads, levelled, levelMm, shaped } = ground;
  const terrain: TerrainMesh[] = [];

  /** The plot's own finished ground (inside it, or on its edge). */
  const lawnAt = (x: number, y: number) => {
    const p = { x, y };
    for (const pad of pads) if (pointInPolygon(p, pad.points)) return pad.zMm;
    return levelled ? levelMm : ground.naturalAt(x, y);
  };

  // The plot's lawn: flat (a floor) when levelled and clear of levelled areas, else a mesh on the ground.
  let lawnY: number | null = null;
  const plotted = plot && plotOutline && plotOutline.length >= 3 ? plotOutline : null;
  if (plotted) {
    const padInPlot = pads.some((pad) => pad.points.length >= 3 && overlaps(pad.points, plotted));
    if (flat || (!padInPlot && (levelled || !shaped))) lawnY = levelled ? levelMm / 1000 : 0;
    else {
      const lawn = toMesh('lawn', meshArea(plotted, pit ? [pit] : [], LAWN_CELL, lawnAt), {
        color: plotLook.color,
        ...(plotLook.finish && { finish: plotLook.finish }),
        opacity: LAWN_OPACITY,
        id: plot!.id,
        level: 'ground',
      });
      if (lawn) terrain.push(lawn);
    }
  }

  const buildings = context.filter((c) => c.kind === 'building' && c.points.length >= 3);
  let box: Box | null = null;
  let groundY = 0;
  if (!flat) {
    // Levelled areas outside the plot: each flat at its height, clear of the plot and of those drawn over it.
    const outside = pads.filter(
      (pad) => pad.points.length >= 3 && (!plotted || !pad.points.every((p) => pointInPolygon(p, plotted))),
    );
    outside.forEach((pad, i) => {
      const holes = [...(plotted ? [plotted] : []), ...outside.slice(0, i).map((q) => q.points)];
      const b = boundsOf(pad.points)!;
      const cell = Math.max(LAWN_CELL, Math.max(b.maxX - b.minX, b.maxY - b.minY) / 4);
      const look = lookOf(pad.material, PAD);
      const mesh = toMesh(
        'pad',
        meshArea(pad.points, holes, cell, () => pad.zMm),
        { color: look.color, ...(look.finish && { finish: look.finish }), id: pad.id, level: 'ground' },
      );
      if (mesh) terrain.push(mesh);
    });

    // The natural ground round it all, reaching a little past the plot, the levels, the levelled areas and the neighbours.
    const core = union([
      plotted ? boundsOf(plotted) : null,
      ground.natural.bounds,
      ...pads.map((p) => boundsOf(p.points)),
      ...buildings.map((b) => boundsOf(b.points)),
    ]);
    if (core) {
      box = {
        minX: core.minX - RING_MARGIN,
        minY: core.minY - RING_MARGIN,
        maxX: core.maxX + RING_MARGIN,
        maxY: core.maxY + RING_MARGIN,
      };
      const [w, h] = [box.maxX - box.minX, box.maxY - box.minY];
      // Flat natural ground needs no more than its outline and holes.
      const cell = shaped
        ? Math.max(RING_CELL, Math.sqrt((w * h) / RING_POINTS))
        : Math.max(RING_CELL, Math.max(w, h) / 4);
      const outline = [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY },
      ];
      const holes = [...(plotted ? [plotted] : []), ...outside.map((p) => p.points)];
      const ring = toMesh('natural', meshArea(outline, holes, cell, ground.naturalAt), { color: NATURAL });
      if (ring) terrain.push(ring);

      // Banks where the finished ground meets the ground outside: round the plot and each levelled area.
      const beyond = (p: Point, out: Point) => ground.finishedAt(p.x + out.x * 2, p.y + out.y * 2);
      if (plotted) {
        const top = lawnY === null ? (p: Point) => lawnAt(p.x, p.y) : () => lawnY! * 1000;
        const b = bank(plotted, LAWN_CELL, top, beyond);
        if (b) terrain.push(b);
      }
      for (const pad of outside) {
        const b = bank(pad.points, LAWN_CELL, () => pad.zMm, beyond);
        if (b) terrain.push(b);
      }

      // The ground plane goes under the lowest ground; the natural ground's edge drops to it.
      groundY = lowestY(terrain, lawnY) - PLANE_BELOW;
      const skirt = bank(
        outline,
        cell,
        (p) => ground.naturalAt(p.x, p.y),
        () => groundY * 1000,
      );
      if (skirt) terrain.push(skirt);
    }
  }

  // Neighbours: buildings stand on the natural ground as blocks, roads lie on it.
  const blocks: Slab3D[] = buildings.map((b) => {
    const centroid = {
      x: b.points.reduce((s, p) => s + p.x, 0) / b.points.length,
      y: b.points.reduce((s, p) => s + p.y, 0) / b.points.length,
    };
    const onSite = !box || b.points.every((p) => inBox(p, box!));
    const base = onSite ? Math.min(...[centroid, ...b.points].map((p) => ground.naturalAt(p.x, p.y))) / 1000 : groundY;
    const top = ground.naturalAt(centroid.x, centroid.y) / 1000 + (b.heightMm ?? BUILDING_HEIGHT_MM) / 1000;
    const look = lookOf(b.material, BUILDING);
    return {
      points: b.points.map((p): [number, number] => [p.x * M, p.y * M]),
      y0: base,
      h: Math.max(0.1, top - base),
      color: look.color,
      ...(look.finish && { finish: look.finish }),
      id: b.id,
      level: 'ground',
      role: 'block' as const,
    };
  });
  const keep = box ? (p: Point) => inBox(p, box!) : () => true;
  for (const road of context.filter((c) => c.kind === 'road')) {
    const strip = roadStrip(road, ground.naturalAt, keep, lookOf(road.material, ROAD));
    if (strip) terrain.push(strip);
  }

  return { ground, flat, terrain, context: blocks, lawnY, lawnAt, groundY };
}

/** The lowest height (m) of the ground meshes (roads aside) and a flat lawn. */
function lowestY(terrain: TerrainMesh[], lawnY: number | null): number {
  let low = lawnY ?? Infinity;
  for (const t of terrain) {
    if (t.kind === 'road') continue;
    for (let i = 1; i < t.positions.length; i += 3) if (t.positions[i] < low) low = t.positions[i];
  }
  return Number.isFinite(low) ? low : 0;
}

// ---- Standing things on the ground ----

/** The finished ground's lowest height (mm) along a line (plan units), read every 1 m. */
export function lowestAlong(ground: Ground, a: Point, b: Point): number {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / WALL_SAMPLE));
  let low = Infinity;
  for (let i = 0; i <= n; i++)
    low = Math.min(low, ground.finishedAt(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n));
  return low;
}

/** The finished ground's lowest height (mm) under a box: at its corners and middle. */
export function lowestUnder(ground: Ground, s: Solid): number {
  const [c, sn] = [Math.cos(s.rotY), Math.sin(s.rotY)];
  let low = ground.finishedAt(s.x / M, s.z / M);
  for (const [i, k] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    // Three.js turns local (x, z) by rotY: x' = x cos + z sin, z' = -x sin + z cos.
    const [lx, lz] = [(i * s.w) / 2, (k * s.d) / 2];
    low = Math.min(low, ground.finishedAt((s.x + lx * c + lz * sn) / M, (s.z - lx * sn + lz * c) / M));
  }
  return low;
}

/**
 * The ground a wall stands in (mm) at a plan point: the higher of the finished ground either side of
 * it (read just out from its faces), so a wall on a bank keeps its height above the higher side.
 * `rotY` is how the wall is turned in the scene and `depthM` its thickness.
 */
export function groundBeside(ground: Ground, p: Point, rotY: number, depthM: number): number {
  const off = depthM / 2 / M + FACE_GAP;
  // Local z (across the wall) in plan terms: (sin rotY, cos rotY).
  const [nx, ny] = [Math.sin(rotY), Math.cos(rotY)];
  return Math.max(ground.finishedAt(p.x + nx * off, p.y + ny * off), ground.finishedAt(p.x - nx * off, p.y - ny * off));
}

/**
 * A boundary wall's piece stepped down the slope, as such walls are built: cut along its length into
 * steps of about 3 m. A piece standing on the ground (y0 = 0) has each step's base at the lowest
 * ground under it (natural or finished, either side) and its top at the ground at the step's middle
 * plus its height; a piece higher up (over an opening) is raised by the ground at the step's middle.
 * Neighbouring steps at the same heights are joined again.
 */
export function stepOnGround(s: Solid, ground: Ground): Solid[] {
  // A box's own x axis runs, on the plan, along (cos rotY, -sin rotY); its z axis along (sin rotY, cos rotY).
  const [ux, uy] = [Math.cos(s.rotY), -Math.sin(s.rotY)];
  const [nx, ny] = [Math.sin(s.rotY), Math.cos(s.rotY)];
  const [cx, cy] = [s.x / M, s.z / M];
  const off = s.d / 2 / M + FACE_GAP;
  const at = (t: number, k = 0): Point => ({ x: cx + ux * t + nx * k, y: cy + uy * t + ny * k });
  const half = s.w / 2 / M;
  const n = Math.max(1, Math.round(s.w / WALL_STEP_M));
  const foot = s.y0 <= 1e-6;
  const steps: { t0: number; t1: number; y0: number; y1: number }[] = [];
  for (let i = 0; i < n; i++) {
    const [t0, t1] = [-half + (2 * half * i) / n, -half + (2 * half * (i + 1)) / n];
    const mid = groundBeside(ground, at((t0 + t1) / 2), s.rotY, s.d) / 1000;
    let y0 = s.y0 + mid;
    if (foot) {
      let low = Infinity;
      const m = Math.max(1, Math.ceil((t1 - t0) / WALL_SAMPLE));
      for (let j = 0; j <= m; j++)
        for (const k of [-off, 0, off]) {
          const p = at(t0 + ((t1 - t0) * j) / m, k);
          low = Math.min(low, ground.naturalAt(p.x, p.y), ground.finishedAt(p.x, p.y));
        }
      y0 = low / 1000;
    }
    const y1 = s.y0 + s.h + mid;
    const prev = steps[steps.length - 1];
    if (prev && Math.abs(prev.y0 - y0) < 1e-3 && Math.abs(prev.y1 - y1) < 1e-3) prev.t1 = t1;
    else steps.push({ t0, t1, y0, y1 });
  }
  return steps.map(({ t0, t1, y0, y1 }) => {
    const c = at((t0 + t1) / 2);
    return { ...s, x: c.x * M, z: c.y * M, w: (t1 - t0) * M, y0, h: Math.max(0.001, y1 - y0) };
  });
}
