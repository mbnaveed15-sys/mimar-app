/**
 * Sections and elevations of the plan: which there are, where each is seen from, and the drawing
 * itself (what is cut, the lines beyond, the ground and the level marks). Pure.
 */
import { buildModel, levelBaseM, M_PER_UNIT, type Model3D } from '../../three/model';
import { levelWallMm, slabMm } from '../levels';
import { outsideOutline } from '../outline';
import { isBuildingWall } from '../../walls';
import { openRooms, voidsOver, within } from '../voids';
import { sideOutward } from '../plot';
import { groundOf, type Ground } from '../terrain/ground';
import { profileAlong } from '../terrain/surface';
import { formatLevel } from './levels';
import { drawingKey, ELEVATION_NAMES, sectionLines, sectionLook, sectionTitle } from './refs';
import {
  GROUND_LEVEL,
  isSiteItem,
  levelOf,
  type DrawingRef,
  type ElevationSide,
  type Id,
  type Opening,
  type PlanDoc,
  type Plot,
  type Point,
  type Units,
  type Wall,
} from '../../types';
import { project, rightOf, type P2, type Prism, type Projection, type V3, type ViewFrame } from './hiddenLines';

/** A level marked on a section or elevation: its height above the datum (the road level, metres) and name. */
export interface LevelMark {
  v: number;
  name: string;
  /** The height as written on the drawing, e.g. +11'-6" or +3.350. */
  label: string;
}

/**
 * The ground on a section or elevation, when the plan has levels or a levelled plot: [u, v] points
 * in metres, like the drawing's lines, left to right.
 */
export interface GroundProfile {
  /** The finished ground (drawn solid), across the whole drawing. */
  finished: P2[];
  /** The natural ground where it differs from the finished ground (drawn dashed): separate pieces. */
  natural: P2[][];
}

/** A section or elevation, ready to draw. */
export interface SideDrawing extends Projection {
  title: string;
  /** How far the ground runs, u0 to u1: at height 0, or along `profile` when there is one. */
  ground: { u0: number; u1: number };
  /** The ground's shape, when the plan has any (otherwise the ground is a straight line at ±0). */
  profile?: GroundProfile;
  levels: LevelMark[];
}

/** The plot whose road side is the front, if there is one. */
function frontPlot(doc: PlanDoc): Plot | undefined {
  return doc.elements.find((el): el is Plot => el.type === 'plot' && levelOf(el) === GROUND_LEVEL);
}

/** The way the viewer of the front elevation looks: towards the plot from its road, or up the page. */
export function frontLook(doc: PlanDoc): { x: number; z: number } {
  const plot = frontPlot(doc);
  if (plot && plot.points.length >= 3) {
    const out = sideOutward(plot, plot.front);
    const len = Math.hypot(out.x, out.y);
    if (len > 0) return { x: -out.x / len, z: -out.y / len };
  }
  return { x: 0, z: -1 };
}

/** The way the viewer of each elevation looks. The left side is on the left as the front is seen. */
export function elevationLook(doc: PlanDoc, side: ElevationSide): { x: number; z: number } {
  const f = frontLook(doc);
  const r = rightOf(f);
  switch (side) {
    case 'front':
      return f;
    case 'back':
      return { x: -f.x, z: -f.z };
    case 'left':
      return r;
    case 'right':
      return { x: -r.x, z: -r.z };
  }
}

/** Walls that make up the building (glass ones too; not boundary walls, parapets or retaining walls). */
const buildingWalls = (doc: PlanDoc, levelId: Id) =>
  doc.elements.filter((el): el is Wall => el.type === 'wall' && isBuildingWall(el) && levelOf(el) === levelId);

/**
 * Floor and roof slabs the plan leaves to be understood: under each floor, and over each floor with
 * no slab drawn on it, across the outside of its walls. Where slabs are drawn, those are used.
 */
function impliedSlabs(doc: PlanDoc, wallHeightMm: number): Prism[] {
  const out: Prism[] = [];
  const slab = slabMm(doc) / 1000;
  const drawn = (id: Id) => doc.elements.some((el) => el.type === 'slab' && levelOf(el) === id);
  doc.levels.forEach((level, i) => {
    const outline = outsideOutline(buildingWalls(doc, level.id));
    if (!outline) return;
    const base = levelBaseM(doc, level.id, wallHeightMm);
    const ring = (y: number, pts: Point[] = outline): V3[] => pts.map((p) => [p.x * M_PER_UNIT, y, p.y * M_PER_UNIT]);
    // Double-height rooms leave the slab over them open.
    const voids = (pts: Point[][]) => pts.filter((v) => within(v, outline));
    const below = doc.levels[i - 1];
    if (!below || !drawn(below.id)) {
      const y = base - slab;
      const holes = voids(voidsOver(doc, level.id).map((r) => r.points));
      out.push({ rings: [ring(y), ...holes.map((h) => ring(y, h))], extrude: [0, slab, 0] });
    }
    if (!drawn(level.id)) {
      const top = base + levelWallMm(doc, level.id, wallHeightMm) / 1000;
      const holes = voids(openRooms(doc, level.id).map((r) => r.points));
      out.push({ rings: [ring(top), ...holes.map((h) => ring(top, h))], extrude: [0, slab, 0] });
    }
  });
  return out;
}

/** The model's pieces as prisms, leaving out any whose id is in `skip`. */
export function modelPrisms(model: Model3D, skip: Set<Id> = new Set()): Prism[] {
  const out: Prism[] = [];
  const keep = (id?: string) => !id || !skip.has(id);
  for (const s of model.solids) {
    if (s.role === 'furniture' || !keep(s.id) || s.h <= 0) continue;
    const ax = { x: Math.cos(s.rotY), z: -Math.sin(s.rotY) };
    const az = { x: Math.sin(s.rotY), z: Math.cos(s.rotY) };
    const corner = (i: number, j: number): V3 => [
      s.x + ((ax.x * s.w) / 2) * i + ((az.x * s.d) / 2) * j,
      s.y0,
      s.z + ((ax.z * s.w) / 2) * i + ((az.z * s.d) / 2) * j,
    ];
    out.push({ rings: [[corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)]], extrude: [0, s.h, 0] });
  }
  for (const p of model.panels) {
    if (p.role === 'shape' || !keep(p.id) || p.outline.length < 3) continue;
    const ax = { x: Math.cos(p.rotY), z: -Math.sin(p.rotY) };
    const az = { x: Math.sin(p.rotY), z: Math.cos(p.rotY) };
    const at = ([s, t]: [number, number]): V3 => [
      p.x + ax.x * s - (az.x * p.depth) / 2,
      p.y0 + t,
      p.z + ax.z * s - (az.z * p.depth) / 2,
    ];
    out.push({
      rings: [p.outline.map(at), ...(p.holes ?? []).map((h) => h.map(at))],
      extrude: [az.x * p.depth, 0, az.z * p.depth],
    });
  }
  for (const s of [...model.slabs, ...model.blocks]) {
    if (s.role === 'shape' || !keep(s.id) || s.h <= 0 || s.points.length < 3) continue;
    const ring = (pts: [number, number][]) => pts.map(([x, z]): V3 => [x, s.y0, z]);
    out.push({ rings: [ring(s.points), ...(s.holes ?? []).map(ring)], extrude: [0, s.h, 0] });
  }
  return out;
}

export interface DrawingOptions {
  wallHeightMm: number;
  units: Units;
  /**
   * The ground to draw (from the whole plan, so hidden levels still shape it); worked out from the
   * drawing's plan when missing.
   */
  ground?: Ground;
}

/** The plan has a ground to draw: levels, a levelled plot or areas, or a plot levelled off the datum. */
export const hasTerrain = (g: Ground) => g.shaped || g.graded || g.levelMm !== 0;

/**
 * Levels to mark: natural ground (or, when the plan has a ground, the datum and the level the plot is
 * finished to), each floor (the ground floor at the plinth), the top of the roof slab over the highest
 * floor with walls, and the top of the highest parapet.
 */
export function levelMarks(doc: PlanDoc, opts: DrawingOptions): LevelMark[] {
  const marks: LevelMark[] = [];
  const add = (v: number, name: string) => {
    const same = marks.find((m) => Math.abs(m.v - v) < 0.001);
    if (same) same.name = `${same.name} / ${name}`;
    else marks.push({ v, name, label: formatLevel(v * 1000, opts.units) });
  };
  const ground = opts.ground ?? groundOf(doc);
  if (hasTerrain(ground)) {
    // Heights count from the road level, which the ground no longer shows by itself.
    add(0, 'Road level (datum)');
    if (ground.plot && ground.levelled) add(ground.levelMm / 1000, 'Finished ground');
  } else add(0, 'Natural ground');
  const slab = slabMm(doc) / 1000;
  let roof: number | null = null;
  let parapet: number | null = null;
  for (const level of doc.levels) {
    const base = levelBaseM(doc, level.id, opts.wallHeightMm);
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const walls = els.filter((el): el is Wall => el.type === 'wall');
    const built = walls.some(isBuildingWall);
    if (built || level.id === GROUND_LEVEL || level.basement)
      add(base, level.id === GROUND_LEVEL && doc.plinthMm > 0 ? `${level.name} (plinth)` : level.name);
    if (built) {
      const top = base + levelWallMm(doc, level.id, opts.wallHeightMm) / 1000 + slab;
      roof = Math.max(roof ?? -Infinity, top);
    }
    for (const w of walls)
      if (w.kind === 'parapet') {
        const top = base + (w.elevMm ?? 0) / 1000 + (w.heightMm ?? 914.4) / 1000;
        parapet = Math.max(parapet ?? -Infinity, top);
      }
  }
  // The roof is only marked when no floor sits on it (a floor above is marked by its own name).
  if (roof !== null && !marks.some((m) => Math.abs(m.v - roof!) < 0.001)) add(roof, 'Top of roof slab');
  if (parapet !== null) add(parapet, 'Top of parapet');
  return marks.sort((a, b) => a.v - b.v);
}

/** Ground items (levels, contours, levelled areas, surroundings): the ground profile draws the ground. */
const siteIds = (doc: PlanDoc) => new Set(doc.elements.filter(isSiteItem).map((el) => el.id));

/** Boundary walls and the gates in them: left out of elevations, which show the building. */
function boundaryIds(doc: PlanDoc): Set<Id> {
  const walls = new Set(
    doc.elements.filter((el): el is Wall => el.type === 'wall' && el.kind === 'boundary').map((w) => w.id),
  );
  const ids = new Set([...walls, ...siteIds(doc)]);
  for (const el of doc.elements)
    if ((el.type === 'door' || el.type === 'window') && walls.has((el as Opening).wallId)) ids.add(el.id);
  return ids;
}

function finish(
  p: Projection,
  title: string,
  doc: PlanDoc,
  opts: DrawingOptions,
  profile: GroundProfile | null,
): SideDrawing {
  const b = p.bounds;
  const margin = 1;
  const ground = b ? { u0: b.minU - margin, u1: b.maxU + margin } : { u0: -1, u1: 1 };
  return {
    ...p,
    title,
    ground,
    ...(profile && { profile: trimProfile(profile, ground.u0, ground.u1) }),
    levels: levelMarks(doc, opts),
  };
}

/** Samples along the ground are this far apart (plan units: 0.5 m). */
const GROUND_STEP = 50;
/** Heights closer than this (mm) are the same ground. */
const SAME_MM = 1;
/** Either side of the edge of a levelled area, so the step at its edge is drawn upright (plan units). */
const EDGE = 0.05;

/** Where segment a–b crosses a polygon's edges, as distances from a (plan units). */
function edgeCrossings(a: Point, b: Point, poly: Point[]): number[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const out: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q.x - p.x;
    const ey = q.y - p.y;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const s = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den;
    const r = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (s >= 0 && s <= 1 && r >= 0 && r <= 1) out.push(s * len);
  }
  return out;
}

/**
 * The ground along the drawing's plane: from the point `base` (scene metres) along the drawing's u
 * (the unit vector `right`), for u from u0 to u1.
 */
export function groundProfile(
  ground: Ground,
  base: { x: number; z: number },
  right: { x: number; z: number },
  u0: number,
  u1: number,
): GroundProfile {
  const at = (u: number): Point => ({
    x: (base.x + right.x * u) / M_PER_UNIT,
    y: (base.z + right.z * u) / M_PER_UNIT,
  });
  const a = at(u0);
  const b = at(u1);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  // The natural ground's own corners, a sample every half metre, and each side of every edge where
  // the finished ground is set.
  const ts = profileAlong(ground.natural, a, b, GROUND_STEP).map((s) => s.t);
  const areas = [
    ...(ground.levelled && ground.plotOutline ? [ground.plotOutline] : []),
    ...ground.pads.map((p) => p.points),
  ];
  for (const area of areas) for (const t of edgeCrossings(a, b, area)) ts.push(t - EDGE, t + EDGE);
  const sorted = ts
    .map((t) => Math.min(len, Math.max(0, t)))
    .sort((p, q) => p - q)
    .filter((t, i, all) => i === 0 || t - all[i - 1] > 1e-6);
  const samples = sorted.map((t) => {
    const s = len > 0 ? t / len : 0;
    const x = a.x + (b.x - a.x) * s;
    const y = a.y + (b.y - a.y) * s;
    return { u: u0 + (u1 - u0) * s, fin: ground.finishedAt(x, y), nat: ground.naturalAt(x, y) };
  });
  const finished = straighten(samples.map((p): P2 => [p.u, p.fin / 1000]));
  // The natural ground only where it differs: each piece between samples where either end differs.
  const differs = samples.map((p) => Math.abs(p.nat - p.fin) > SAME_MM);
  const natural: P2[][] = [];
  let run: P2[] | null = null;
  for (let i = 0; i + 1 < samples.length; i++) {
    if (!differs[i] && !differs[i + 1]) {
      run = null;
      continue;
    }
    if (!run) {
      run = [[samples[i].u, samples[i].nat / 1000]];
      natural.push(run);
    }
    run.push([samples[i + 1].u, samples[i + 1].nat / 1000]);
  }
  return { finished, natural: natural.filter((r) => r.length >= 2).map(straighten) };
}

/** Leave out points in the middle of a straight run. */
function straighten(pts: P2[]): P2[] {
  const out: P2[] = [];
  for (const p of pts) {
    while (out.length >= 2) {
      const [o, q] = [out[out.length - 2], out[out.length - 1]];
      const cross = (q[0] - o[0]) * (p[1] - o[1]) - (q[1] - o[1]) * (p[0] - o[0]);
      const dot = (q[0] - o[0]) * (p[0] - q[0]) + (q[1] - o[1]) * (p[1] - q[1]);
      if (Math.abs(cross) < 1e-9 && dot >= 0) out.pop();
      else break;
    }
    out.push(p);
  }
  return out;
}

/** The part of a line (u rising) between u0 and u1, cut where it crosses them. */
function trimLine(pts: P2[], u0: number, u1: number): P2[] {
  const out: P2[] = [];
  const cross = (p: P2, q: P2, u: number): P2 => [u, p[1] + ((q[1] - p[1]) * (u - p[0])) / (q[0] - p[0])];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const prev = pts[i - 1];
    if (prev && prev[0] < u0 && p[0] > u0) out.push(cross(prev, p, u0));
    if (p[0] >= u0 && p[0] <= u1) out.push(p);
    if (prev && prev[0] < u1 && p[0] > u1) out.push(cross(prev, p, u1));
  }
  return out;
}

function trimProfile(profile: GroundProfile, u0: number, u1: number): GroundProfile {
  return {
    finished: trimLine(profile.finished, u0, u1),
    natural: profile.natural.map((r) => trimLine(r, u0, u1)).filter((r) => r.length >= 2),
  };
}

/** How far the prisms reach across a drawing (u, metres), seen from `origin` looking along `look`. */
function spanOf(prisms: Prism[], origin: { x: number; z: number }, look: { x: number; z: number }) {
  const r = rightOf(look);
  let [lo, hi, near] = [Infinity, -Infinity, Infinity];
  for (const prism of prisms)
    for (const ring of prism.rings)
      for (const p of ring)
        for (const [x, z] of [
          [p[0], p[2]],
          [p[0] + prism.extrude[0], p[2] + prism.extrude[2]],
        ]) {
          const u = (x - origin.x) * r.x + (z - origin.z) * r.z;
          lo = Math.min(lo, u);
          hi = Math.max(hi, u);
          near = Math.min(near, (x - origin.x) * look.x + (z - origin.z) * look.z);
        }
  return lo === Infinity ? { lo: -1, hi: 1, near: 0 } : { lo: Math.min(lo, -1), hi: Math.max(hi, 1), near };
}

/** How far in front of `origin` the building's nearest face is (metres along `look`), from its outside walls. */
function faceDepth(doc: PlanDoc, origin: { x: number; z: number }, look: { x: number; z: number }): number | null {
  for (const level of [GROUND_LEVEL, ...doc.levels.map((l) => l.id)]) {
    const outline = outsideOutline(buildingWalls(doc, level));
    if (outline?.length)
      return Math.min(
        ...outline.map((p) => (p.x * M_PER_UNIT - origin.x) * look.x + (p.y * M_PER_UNIT - origin.z) * look.z),
      );
  }
  return null;
}

/** Room either side of the drawing for the ground (metres). */
const GROUND_RUN = 2;

/**
 * Draw a section or an elevation of the plan (the plan with hidden items already left out), or null
 * when the drawing no longer exists (its section line was deleted). On a plan with a ground (levels,
 * a levelled plot), the ground follows it: along the section line, or along the face of the building
 * an elevation looks at, and an elevation leaves out what is below the finished ground there.
 */
export function sideDrawing(doc: PlanDoc, ref: DrawingRef, opts: DrawingOptions): SideDrawing | null {
  if (ref.kind === 'plan') return null;
  const ground = opts.ground ?? groundOf(doc);
  const terrain = hasTerrain(ground);
  const options = { ...opts, ground };
  if (ref.kind === 'section') {
    const line = sectionLines(doc).find((s) => s.id === ref.id);
    if (!line || (line.x1 === line.x2 && line.y1 === line.y2)) return null;
    const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: false, closedDoors: true });
    const prisms = [...modelPrisms(model, siteIds(doc)), ...impliedSlabs(doc, opts.wallHeightMm)];
    const frame: ViewFrame = {
      origin: { x: line.x1 * M_PER_UNIT, z: line.y1 * M_PER_UNIT },
      look: sectionLook(line),
      cut: true,
    };
    let profile: GroundProfile | null = null;
    if (terrain) {
      const span = spanOf(prisms, frame.origin, frame.look);
      const r = rightOf(frame.look);
      profile = groundProfile(ground, frame.origin, r, span.lo - GROUND_RUN, span.hi + GROUND_RUN);
    }
    return finish(project(prisms, frame), sectionTitle(line), doc, options, profile);
  }
  const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: false, closedDoors: true });
  const prisms = [...modelPrisms(model, boundaryIds(doc)), ...impliedSlabs(doc, opts.wallHeightMm)];
  const frame: ViewFrame = {
    origin: { x: model.centre.x, z: model.centre.z },
    look: elevationLook(doc, ref.side),
    cut: false,
    minV: 0,
  };
  let profile: GroundProfile | null = null;
  if (terrain) {
    // The ground along the face of the building seen (its outside walls, or else its nearest point).
    const span = spanOf(prisms, frame.origin, frame.look);
    const d = faceDepth(doc, frame.origin, frame.look) ?? span.near;
    const base = { x: frame.origin.x + frame.look.x * d, z: frame.origin.z + frame.look.z * d };
    profile = groundProfile(ground, base, rightOf(frame.look), span.lo - GROUND_RUN, span.hi + GROUND_RUN);
    // What is below the finished ground there is left out, not what is below the datum.
    delete frame.minV;
    frame.ground = profile.finished;
  }
  return finish(project(prisms, frame), ELEVATION_NAMES[ref.side], doc, options, profile);
}

/** Work each section or elevation out once, the first time it is asked for. */
export function sideCache(doc: PlanDoc, opts: DrawingOptions): (ref: DrawingRef) => SideDrawing | null {
  const cache = new Map<string, SideDrawing | null>();
  return (ref) => {
    const key = drawingKey(ref);
    if (!cache.has(key)) cache.set(key, sideDrawing(doc, ref, opts));
    return cache.get(key)!;
  };
}

export type { P2 };
export {
  drawingFromKey,
  drawingKey,
  drawingTitle,
  ELEVATION_NAMES,
  ELEVATION_SIDES,
  nextSectionLabel,
  sectionLines,
  sectionLook,
  sectionTitle,
  sideDrawingRefs,
} from './refs';
