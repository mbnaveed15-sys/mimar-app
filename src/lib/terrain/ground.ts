/**
 * The ground: the natural surface from the spot levels and contour lines, and the finished ground
 * (the plot levelled, and any levelled areas), in plan units across and mm up. Pure.
 */
import { pointInPolygon } from '../../geometry';
import { outlinePoints } from '../plot';
import {
  GROUND_LEVEL,
  levelOf,
  type Contour,
  type GroundSettings,
  type Pad,
  type PlanDoc,
  type PlanElement,
  type Plot,
  type Point,
  type SpotLevel,
} from '../../types';
import { buildSurface, type GroundPoint, type Surface } from './surface';

/** Contour lines are read as points this far apart (plan units: 1 m). */
const CONTOUR_STEP = 100;
/** A satellite level this close to a surveyed one (plan units: 10 m) gives way to it. */
const SURVEY_WINS = 1000;

/** The contour interval on the plan when none is set: 1' or 0.5 m. */
export const contourStepMm = (ground: GroundSettings | undefined, metric: boolean) =>
  ground?.contourMm ?? (metric ? 500 : 304.8);

/** The heights the natural ground is worked out from: spot levels, and points along contour lines. */
export function groundPoints(elements: PlanElement[]): GroundPoint[] {
  const surveyed: GroundPoint[] = [];
  const approx: GroundPoint[] = [];
  for (const el of elements) {
    if (el.type === 'level') (el.approx ? approx : surveyed).push({ x: el.x, y: el.y, z: el.zMm });
    if (el.type === 'contour')
      for (let i = 0; i < el.points.length; i++) {
        const a = el.points[i];
        surveyed.push({ x: a.x, y: a.y, z: el.zMm });
        const b = el.points[i + 1];
        if (!b) continue;
        const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / CONTOUR_STEP);
        for (let k = 1; k <= n; k++) {
          const t = k / (n + 1);
          surveyed.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: el.zMm });
        }
      }
  }
  if (!approx.length) return surveyed;
  // Satellite levels fill in only where there is no survey.
  const near = (p: GroundPoint) =>
    surveyed.some((q) => Math.abs(q.x - p.x) < SURVEY_WINS && Math.hypot(q.x - p.x, q.y - p.y) < SURVEY_WINS);
  return [...surveyed, ...approx.filter((p) => !near(p))];
}

/** The natural ground and the finished ground of a plan. */
export interface Ground {
  natural: Surface;
  /** Whether the natural ground has any levels at all (without them it is flat at ±0). */
  shaped: boolean;
  /** The plot the ground is levelled in (the first on the ground floor), if any. */
  plot: Plot | null;
  /** Its outline (with any cut corner). */
  plotOutline: Point[] | null;
  /** Levelled areas, last drawn first (it wins where they overlap). */
  pads: Pad[];
  /** The plot is levelled (rather than left as it is), and to what height (mm). */
  levelled: boolean;
  levelMm: number;
  /** Natural ground height (mm) at a plan point. */
  naturalAt(x: number, y: number): number;
  /** Finished ground height (mm) at a plan point: a levelled area, the levelled plot, or the natural ground. */
  finishedAt(x: number, y: number): number;
  /** The finished ground differs from the natural ground somewhere (there is earth to cut or fill). */
  graded: boolean;
}

/** The items the ground is worked out from, to tell when it must be worked out again. */
const inputsOf = (doc: PlanDoc): unknown[] => [
  doc.ground,
  ...doc.elements.filter(
    (el) =>
      el.type === 'level' ||
      el.type === 'contour' ||
      el.type === 'pad' ||
      (el.type === 'plot' && levelOf(el) === GROUND_LEVEL),
  ),
];

let last: { inputs: unknown[]; ground: Ground } | null = null;

/** The plan's ground (worked out again only when a level, contour, levelled area, plot or setting changes). */
export function groundOf(doc: PlanDoc): Ground {
  const inputs = inputsOf(doc);
  if (last && last.inputs.length === inputs.length && last.inputs.every((x, i) => x === inputs[i])) return last.ground;
  const ground = makeGround(doc);
  last = { inputs, ground };
  return ground;
}

function makeGround(doc: PlanDoc): Ground {
  const natural = buildSurface(groundPoints(doc.elements));
  const plot = doc.elements.find((el): el is Plot => el.type === 'plot' && levelOf(el) === GROUND_LEVEL) ?? null;
  const plotOutline = plot ? outlinePoints(plot) : null;
  const pads = doc.elements.filter((el): el is Pad => el.type === 'pad').reverse();
  const levelled = doc.ground?.grade !== 'natural';
  const levelMm = doc.ground?.levelMm ?? 0;
  const naturalAt = (x: number, y: number) => natural.heightAt(x, y);
  const finishedAt = (x: number, y: number) => {
    const p = { x, y };
    for (const pad of pads) if (pointInPolygon(p, pad.points)) return pad.zMm;
    if (levelled && plotOutline && pointInPolygon(p, plotOutline)) return levelMm;
    return natural.heightAt(x, y);
  };
  // Levelled at the natural ground's own height everywhere (no levels, levelled at ±0): nothing to move.
  const graded = pads.length > 0 || (!!plotOutline && levelled && (!natural.empty || levelMm !== 0));
  return {
    natural,
    shaped: !natural.empty,
    plot,
    plotOutline,
    pads,
    levelled,
    levelMm,
    naturalAt,
    finishedAt,
    graded,
  };
}

/** Round a height to a builder's step: 3" (76.2 mm) in feet and inches, 50 mm in metric. */
export const roundLevel = (mm: number, metric: boolean) => {
  const step = metric ? 50 : 76.2;
  return Math.round(mm / step) * step;
};

/** Spot levels and contour lines (the survey), for counting and clearing. */
export const surveyItems = (doc: PlanDoc) =>
  doc.elements.filter((el): el is SpotLevel | Contour => el.type === 'level' || el.type === 'contour');
