/**
 * What the plan and the quantities show of the ground: contour lines, where earth is cut and filled,
 * the daylight line between the two, and how much earth moves. Pure.
 */
import { pointInPolygon } from '../../geometry';
import type { PlanDoc, Point } from '../../types';
import { contourStepMm, groundOf, type Ground } from './ground';
import { contourLines, earthworks, meshArea } from './surface';

/** Every fifth contour line is heavier and labelled. */
export const MAJOR_EVERY = 5;
/** The cut and fill mesh is this fine (plan units: 0.5 m). */
const TINT_CELL = 50;
/** How far inside an area its edge is read (plan units: 0.5 mm). */
const NUDGE = 0.05;
/** Less than this (mm) is neither cut nor fill. */
const FLAT_MM = 1;

export interface ContourLine {
  zMm: number;
  major: boolean;
  lines: Point[][];
}

/** Contour lines of the natural ground at an interval, every fifth one heavier. */
export function groundContours(ground: Ground, intervalMm: number): ContourLine[] {
  if (!ground.shaped) return [];
  return contourLines(ground.natural, intervalMm).map((c) => ({
    ...c,
    major: Math.round(c.zMm / intervalMm) % MAJOR_EVERY === 0,
  }));
}

/**
 * The areas where the finished ground is set: the plot when it is levelled, and each levelled area
 * outside it (one inside the plot is already part of the plot's area).
 */
export function gradedAreas(ground: Ground): Point[][] {
  const areas: Point[][] = [];
  const plot = ground.levelled ? ground.plotOutline : null;
  if (plot) areas.push(plot);
  for (const pad of ground.pads) if (!plot || !pad.points.every((p) => pointInPolygon(p, plot))) areas.push(pad.points);
  return areas;
}

export interface CutFill {
  /** Triangles where earth is dug out (natural ground above finished). */
  cut: Point[][];
  /** Triangles where earth is brought in. */
  fill: Point[][];
  /** Where the finished ground meets the natural ground (the daylight line), as segments. */
  daylight: [Point, Point][];
}

/** Where earth is cut and filled, for tinting the plan. Empty when the ground isn't graded. */
export function cutFillMap(ground: Ground): CutFill {
  const out: CutFill = { cut: [], fill: [], daylight: [] };
  if (!ground.graded) return out;
  for (const area of gradedAreas(ground)) {
    // Points on the area's edge are read a hair inside it, where the finished level applies.
    const c = area.reduce((m, p) => ({ x: m.x + p.x / area.length, y: m.y + p.y / area.length }), { x: 0, y: 0 });
    const diff = (x: number, y: number) => {
      const len = Math.hypot(c.x - x, c.y - y) || 1;
      const ix = x + ((c.x - x) / len) * NUDGE;
      const iy = y + ((c.y - y) / len) * NUDGE;
      return ground.naturalAt(ix, iy) - ground.finishedAt(ix, iy);
    };
    const { points, z, triangles } = meshArea(area, [], TINT_CELL, diff);
    for (const tri of triangles) {
      const pts = tri.map((i) => points[i]);
      const d = tri.map((i) => z[i]);
      const mean = (d[0] + d[1] + d[2]) / 3;
      if (mean > FLAT_MM) out.cut.push(pts);
      else if (mean < -FLAT_MM) out.fill.push(pts);
      const seg = zeroCrossing(pts, d);
      if (seg) out.daylight.push(seg);
    }
  }
  return out;
}

/** Where a value that is linear over a triangle crosses zero, if it does (corners within FLAT_MM count as on it). */
function zeroCrossing(pts: Point[], d: number[]): [Point, Point] | null {
  const sign = d.map((v) => (v > FLAT_MM ? 1 : v < -FLAT_MM ? -1 : 0));
  const on = [0, 1, 2].filter((i) => sign[i] === 0);
  // Along an edge: drawn once, by the triangle on its cut side.
  if (on.length === 2) {
    const other = [0, 1, 2].find((i) => sign[i] !== 0)!;
    return sign[other] > 0 ? [pts[on[0]], pts[on[1]]] : null;
  }
  if (on.length === 3) return null;
  const ends: Point[] = on.map((i) => pts[i]);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    if (sign[i] * sign[j] < 0) {
      const t = d[i] / (d[i] - d[j]);
      ends.push({ x: pts[i].x + t * (pts[j].x - pts[i].x), y: pts[i].y + t * (pts[j].y - pts[i].y) });
    }
  }
  return ends.length === 2 ? [ends[0], ends[1]] : null;
}

/** Earth to dig out and bring in (m³) to reach the finished ground, and the area graded (m²). */
export function siteEarthworks(ground: Ground): { cutM3: number; fillM3: number; areaM2: number } {
  const total = { cutM3: 0, fillM3: 0, areaM2: 0 };
  if (!ground.graded) return total;
  const natural = (x: number, y: number) => ground.naturalAt(x, y);
  const finished = (x: number, y: number) => ground.finishedAt(x, y);
  for (const area of gradedAreas(ground)) {
    const e = earthworks(area, [], natural, finished);
    total.cutM3 += e.cutM3;
    total.fillM3 += e.fillM3;
    total.areaM2 += e.areaM2;
  }
  return total;
}

/** What the plan draws of the ground. */
export interface GroundOnPlan {
  contours: ContourLine[];
  cutFill: CutFill | null;
}

let lastPlan: { key: unknown[]; out: GroundOnPlan | null } | null = null;

/**
 * The ground as the ground-floor plan draws it, from the whole plan (hidden spot levels still shape
 * the ground): contour lines unless the ground levels layer is hidden, and the cut and fill tint
 * unless it is turned off. Null when there is nothing to draw.
 */
export function groundOnPlan(doc: PlanDoc, metric: boolean): GroundOnPlan | null {
  const ground = groundOf(doc);
  const hidden = !!doc.layers?.terrain?.hidden;
  const tint = doc.ground?.cutFill !== false;
  const step = contourStepMm(doc.ground, metric);
  // Worked out again only when the ground or how it is shown changes, not on every edit.
  const key = [ground, hidden, tint, step];
  if (lastPlan && lastPlan.key.every((x, i) => x === key[i])) return lastPlan.out;
  const contours = hidden ? [] : groundContours(ground, step);
  const cutFill = tint ? cutFillMap(ground) : null;
  const tinted = !!cutFill && (cutFill.cut.length > 0 || cutFill.fill.length > 0);
  const out = contours.length || tinted ? { contours, cutFill: tinted ? cutFill : null } : null;
  lastPlan = { key, out };
  return out;
}
