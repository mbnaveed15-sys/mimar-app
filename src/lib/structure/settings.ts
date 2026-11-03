/**
 * Generate structure's settings and its rules of thumb for sizes (Pakistani practice and the Building
 * Code of Pakistan's minimums). A preliminary layout for drawing and costing, to be checked by a
 * structural engineer. Pure.
 */
import { slabMm } from '../levels';
import type { FramePart, FrameSettings, FrameSystem, PlanDoc, SeismicZone } from '../../types';

export const IN = 25.4;
export const FT = 304.8;

export interface FrameRules {
  system: FrameSystem;
  maxSpanMm: number;
  slabSpanMm: number;
  wideOpeningMm: number;
  soilTsf: number;
  footingDepthMm: number;
  bearingMm: number;
  zone: SeismicZone;
  skip: FramePart[];
}

export const FRAME_DEFAULTS: FrameRules = {
  system: 'framed',
  maxSpanMm: 15 * FT,
  slabSpanMm: 16 * FT,
  wideOpeningMm: 8 * FT,
  soilTsf: 1.5,
  footingDepthMm: 4 * FT,
  bearingMm: 9 * IN,
  zone: '2B',
  skip: [],
};

export const SEISMIC_ZONES: SeismicZone[] = ['1', '2A', '2B', '3', '4'];

export const FRAME_PARTS: { id: FramePart; label: string; framedOnly?: boolean }[] = [
  { id: 'footings', label: 'Footings' },
  { id: 'tie', label: 'Tie beams', framedOnly: true },
  { id: 'plinth', label: 'Plinth beams' },
  { id: 'columns', label: 'Columns', framedOnly: true },
  { id: 'beams', label: 'Beams and bands' },
  { id: 'lintels', label: 'Lintels' },
  { id: 'slabs', label: 'Slabs' },
];

/** The plan's settings over the defaults. */
export const frameRules = (doc: Pick<PlanDoc, 'frame'>): FrameRules => ({
  ...FRAME_DEFAULTS,
  ...doc.frame?.settings,
  skip: doc.frame?.settings?.skip ?? [],
});

/** Only what differs from the defaults, for saving. */
export function settingsOf(rules: FrameRules): FrameSettings | undefined {
  const out: FrameSettings = {};
  for (const k of Object.keys(FRAME_DEFAULTS) as (keyof FrameRules)[]) {
    if (k === 'skip') continue;
    if (rules[k] !== FRAME_DEFAULTS[k]) (out as Record<string, unknown>)[k] = rules[k];
  }
  if (rules.skip.length) out.skip = [...rules.skip];
  return Object.keys(out).length ? out : undefined;
}

/** Whether this part is made with these settings. */
export function makes(rules: FrameRules, part: FramePart): boolean {
  if (rules.skip.includes(part)) return false;
  if (rules.system === 'bearing' && (part === 'columns' || part === 'tie')) return false;
  return true;
}

/** Load-bearing walls get a continuous lintel band in seismic zone 2B and up. */
export const lintelBand = (rules: FrameRules) =>
  rules.system === 'bearing' && (rules.zone === '2B' || rules.zone === '3' || rules.zone === '4');

/** Up to the next 3" (75 mm). */
export const up3 = (mm: number) => Math.ceil(mm / (3 * IN) - 1e-6) * 3 * IN;
/** Up to the next ½" (12.5 mm). */
const upHalf = (mm: number) => Math.ceil(mm / (IN / 2) - 1e-6) * (IN / 2);

/** Floor load used for sizes: dead and live load, about 150 lb a square foot a floor. */
export const FLOOR_LOAD_PSF = 150;

/**
 * A column's size, mm: across the wall (at least the wall's thickness) and along it, by the floors it
 * carries; made longer when its share of the floors needs more (area = load / (0.4 × 3,000 psi)).
 */
export function columnSize(storeys: number, wallMm: number, tributarySqFt: number): { across: number; along: number } {
  const [a, l] = storeys <= 2 ? [9, 12] : storeys === 3 ? [12, 12] : [12, 18];
  const across = Math.max(a * IN, up3(wallMm - 1));
  let along = Math.max(l * IN, across);
  const needIn2 = (tributarySqFt * storeys * FLOOR_LOAD_PSF) / 1200;
  while ((across / IN) * (along / IN) < needIn2 && along < 48 * IN) along += 3 * IN;
  return { across, along };
}

/** A floor or roof beam's depth below the slab, mm: span / 12 overall (18" at least), less the slab. */
export function beamDepth(spanMm: number, doc: Pick<PlanDoc, 'project'>): number {
  const overall = Math.max(18 * IN, up3(spanMm / 12));
  return Math.max(9 * IN, overall - slabMm(doc));
}

/** A lintel's depth, mm: 6" up to 4' of opening, 9" up to 8', span / 12 above that. */
export function lintelDepth(spanMm: number): number {
  if (spanMm <= 4 * FT + 1) return 6 * IN;
  if (spanMm <= 8 * FT + 1) return 9 * IN;
  return up3(spanMm / 12);
}

/** A pad footing's side and thickness, mm, for the load of the floors over it on this soil. */
export function padSize(tributarySqFt: number, storeys: number, soilTsf: number): { side: number; thick: number } {
  const loadLb = tributarySqFt * storeys * FLOOR_LOAD_PSF * 1.1;
  const areaSqFt = loadLb / (soilTsf * 2000);
  const side = Math.max(4 * FT, up3(Math.sqrt(areaSqFt) * FT));
  const thick = storeys <= 2 ? 15 * IN : storeys === 3 ? 18 * IN : 21 * IN;
  return { side, thick };
}

/** The slab a room needs (two-way: its perimeter / 180, 5" at least), mm. */
export function slabNeedMm(spanA: number, spanB: number): number {
  return Math.max(5 * IN, upHalf((2 * (spanA + spanB)) / 180));
}

/** A strip footing under a load-bearing wall: 3' wide, 12" thick. */
export const STRIP_MM = { width: 3 * FT, thick: 12 * IN };
/** A boundary wall's strip footing: 2' wide, 9" thick, 3' down. */
export const BOUNDARY_STRIP_MM = { width: 2 * FT, thick: 9 * IN, depth: 3 * FT };
