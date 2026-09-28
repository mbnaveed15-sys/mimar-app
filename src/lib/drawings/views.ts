/**
 * Sections and elevations of the plan: which there are, where each is seen from, and the drawing
 * itself (what is cut, the lines beyond, the ground and the level marks). Pure.
 */
import { buildModel, levelBaseM, M_PER_UNIT, type Model3D } from '../../three/model';
import { levelWallMm, slabMm } from '../levels';
import { outsideOutline } from '../outline';
import { sideOutward } from '../plot';
import { formatLevel } from './levels';
import { drawingKey, ELEVATION_NAMES, sectionLines, sectionLook, sectionTitle } from './refs';
import {
  GROUND_LEVEL,
  levelOf,
  type DrawingRef,
  type ElevationSide,
  type Id,
  type Opening,
  type PlanDoc,
  type Plot,
  type Units,
  type Wall,
} from '../../types';
import { project, rightOf, type P2, type Prism, type Projection, type V3, type ViewFrame } from './hiddenLines';

/** A level marked on a section or elevation: its height above natural ground (metres) and name. */
export interface LevelMark {
  v: number;
  name: string;
  /** The height as written on the drawing, e.g. +11'-6" or +3.350. */
  label: string;
}

/** A section or elevation, ready to draw. */
export interface SideDrawing extends Projection {
  title: string;
  /** The ground line: from u0 to u1 at height 0. */
  ground: { u0: number; u1: number };
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

/** Walls that make up the building (not boundary walls, parapets or retaining walls). */
const buildingWalls = (doc: PlanDoc, levelId: Id) =>
  doc.elements.filter((el): el is Wall => el.type === 'wall' && !el.kind && levelOf(el) === levelId);

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
    const ring = (y: number): V3[] => outline.map((p) => [p.x * M_PER_UNIT, y, p.y * M_PER_UNIT]);
    const below = doc.levels[i - 1];
    if (!below || !drawn(below.id)) out.push({ rings: [ring(base - slab)], extrude: [0, slab, 0] });
    if (!drawn(level.id)) {
      const top = base + levelWallMm(doc, level.id, wallHeightMm) / 1000;
      out.push({ rings: [ring(top)], extrude: [0, slab, 0] });
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
}

/**
 * Levels to mark: natural ground, each floor (the ground floor at the plinth), the top of the roof
 * slab over the highest floor with walls, and the top of the highest parapet.
 */
export function levelMarks(doc: PlanDoc, opts: DrawingOptions): LevelMark[] {
  const marks: LevelMark[] = [];
  const add = (v: number, name: string) => {
    const same = marks.find((m) => Math.abs(m.v - v) < 0.001);
    if (same) same.name = `${same.name} / ${name}`;
    else marks.push({ v, name, label: formatLevel(v * 1000, opts.units) });
  };
  add(0, 'Natural ground');
  const slab = slabMm(doc) / 1000;
  let roof: number | null = null;
  let parapet: number | null = null;
  for (const level of doc.levels) {
    const base = levelBaseM(doc, level.id, opts.wallHeightMm);
    const els = doc.elements.filter((el) => levelOf(el) === level.id);
    const walls = els.filter((el): el is Wall => el.type === 'wall');
    const built = walls.some((w) => !w.kind);
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

/** Boundary walls and the gates in them: left out of elevations, which show the building. */
function boundaryIds(doc: PlanDoc): Set<Id> {
  const walls = new Set(
    doc.elements.filter((el): el is Wall => el.type === 'wall' && el.kind === 'boundary').map((w) => w.id),
  );
  const ids = new Set(walls);
  for (const el of doc.elements)
    if ((el.type === 'door' || el.type === 'window') && walls.has((el as Opening).wallId)) ids.add(el.id);
  return ids;
}

function finish(p: Projection, title: string, doc: PlanDoc, opts: DrawingOptions): SideDrawing {
  const b = p.bounds;
  const margin = 1;
  return {
    ...p,
    title,
    ground: b ? { u0: b.minU - margin, u1: b.maxU + margin } : { u0: -1, u1: 1 },
    levels: levelMarks(doc, opts),
  };
}

/**
 * Draw a section or an elevation of the plan (the plan with hidden items already left out), or null
 * when the drawing no longer exists (its section line was deleted).
 */
export function sideDrawing(doc: PlanDoc, ref: DrawingRef, opts: DrawingOptions): SideDrawing | null {
  if (ref.kind === 'plan') return null;
  if (ref.kind === 'section') {
    const line = sectionLines(doc).find((s) => s.id === ref.id);
    if (!line || (line.x1 === line.x2 && line.y1 === line.y2)) return null;
    const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: false, closedDoors: true });
    const prisms = [...modelPrisms(model), ...impliedSlabs(doc, opts.wallHeightMm)];
    const frame: ViewFrame = {
      origin: { x: line.x1 * M_PER_UNIT, z: line.y1 * M_PER_UNIT },
      look: sectionLook(line),
      cut: true,
    };
    return finish(project(prisms, frame), sectionTitle(line), doc, opts);
  }
  const model = buildModel(doc, { wallHeightMm: opts.wallHeightMm, showFurniture: false, closedDoors: true });
  const prisms = [...modelPrisms(model, boundaryIds(doc)), ...impliedSlabs(doc, opts.wallHeightMm)];
  const frame: ViewFrame = {
    origin: { x: model.centre.x, z: model.centre.z },
    look: elevationLook(doc, ref.side),
    cut: false,
    minV: 0,
  };
  return finish(project(prisms, frame), ELEVATION_NAMES[ref.side], doc, opts);
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
