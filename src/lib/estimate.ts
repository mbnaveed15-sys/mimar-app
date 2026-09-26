/**
 * A bill of quantities and cost estimate from the measured quantities: each item is quantity ×
 * rate. The starter rates are rough Rawalpindi/Islamabad figures (September 2026) in rupees, to be
 * replaced with a contractor's; everything here is indicative.
 */
import type { FloorKind, FloorQuantities } from './quantities';

export type CostUnit = 'cft' | 'sqft' | 'kg' | 'no';

/** Rates in rupees per unit (per cft, sqft, kg or each). */
export interface Rates {
  excavation: number;
  pcc: number;
  brickwork: number;
  rcc: number;
  steel: number;
  plaster: number;
  paintInside: number;
  paintOutside: number;
  door: number;
  window: number;
  /** Per sqft of covered area. */
  electrical: number;
  plumbing: number;
  flooring: Record<Exclude<FloorKind, 'none'>, number>;
  /** Covered area × rate, for a quick check (per sqft of covered area). */
  area: Record<Grade, number>;
}

/** How much steel and mortar go in, and the foundation sizes assumed. */
export interface Ratios {
  bricksPerCft: number;
  /** Steel, kg per cft of concrete. */
  steelSlab: number;
  steelBeam: number;
  steelColumn: number;
  steelStair: number;
  /** Foundation trench under the walls: width and depth, and the concrete (PCC) bed's thickness, ft. */
  footingWidthFt: number;
  footingDepthFt: number;
  pccFt: number;
}

export type Grade = 'grey' | 'basic' | 'standard' | 'premium';

export const GRADE_NAMES: Record<Grade, string> = {
  grey: 'Grey structure',
  basic: 'Complete, basic finish',
  standard: 'Complete, standard finish',
  premium: 'Complete, premium finish',
};

export const FLOOR_NAMES: Record<Exclude<FloorKind, 'none'>, string> = {
  tiles: 'Tiles',
  marble: 'Marble or terrazzo',
  granite: 'Granite',
  wood: 'Wooden floor',
  stone: 'Stone or pavers',
  concrete: 'Concrete floor',
  other: 'Other floor finish',
};

/** Starter rates: rough Rawalpindi/Islamabad figures for September 2026. Replace with your contractor's. */
export const STARTER_RATES: Rates = {
  excavation: 30,
  pcc: 480,
  brickwork: 420,
  rcc: 720,
  steel: 300,
  plaster: 55,
  paintInside: 60,
  paintOutside: 75,
  door: 45000,
  window: 1500,
  electrical: 380,
  plumbing: 450,
  flooring: { tiles: 380, marble: 480, granite: 850, wood: 750, stone: 300, concrete: 120, other: 300 },
  area: { grey: 3900, basic: 5800, standard: 7200, premium: 9800 },
};

export const STARTER_RATIOS: Ratios = {
  bricksPerCft: 13.5,
  steelSlab: 2.3,
  steelBeam: 4.3,
  steelColumn: 5.1,
  steelStair: 2.8,
  footingWidthFt: 3,
  footingDepthFt: 4,
  pccFt: 0.5,
};

export interface CostLine {
  id: string;
  label: string;
  qty: number;
  unit: CostUnit;
  /** Which rate it uses (a key of Rates, or flooring.<kind>). */
  rateKey: string;
  rate: number;
  amount: number;
  /** Worked out from assumptions rather than measured. */
  estimated?: boolean;
}

export interface Materials {
  bricks: number;
  cementBags: number;
  sandCft: number;
  crushCft: number;
  steelKg: number;
}

export interface Estimate {
  lines: CostLine[];
  total: number;
  materials: Materials;
}

/** A rate by its key ("brickwork", "flooring.tiles", "area.standard"). */
export function rateOf(rates: Rates, key: string): number {
  const [a, b] = key.split('.');
  const v = b ? (rates[a as 'flooring' | 'area'] as Record<string, number>)[b] : rates[a as keyof Rates];
  return typeof v === 'number' ? v : 0;
}

/** The rates with one changed. */
export function withRate(rates: Rates, key: string, value: number): Rates {
  const [a, b] = key.split('.');
  if (b) return { ...rates, [a]: { ...(rates[a as 'flooring' | 'area'] as Record<string, number>), [b]: value } };
  return { ...rates, [a]: value };
}

const CEMENT_BAG_CFT = 1.25;

/** Price the quantities, item by item, and add up the materials they need. */
export function estimate(q: FloorQuantities, rates: Rates, ratios: Ratios): Estimate {
  const lines: CostLine[] = [];
  const add = (id: string, label: string, qty: number, unit: CostUnit, rateKey: string, estimated = false) => {
    if (!(qty > 0.005)) return;
    const rate = rateOf(rates, rateKey);
    lines.push({ id, label, qty, unit, rateKey, rate, amount: qty * rate, ...(estimated && { estimated }) });
  };
  const trench = q.foundationRft * ratios.footingWidthFt;
  const excavation = trench * ratios.footingDepthFt;
  const pcc = trench * ratios.pccFt;
  const rccStructural = q.slabCft + q.slabEstimateCft + q.beamCft + q.columnCft + q.stairCft;
  const steelKg =
    (q.slabCft + q.slabEstimateCft) * ratios.steelSlab +
    q.beamCft * ratios.steelBeam +
    q.columnCft * ratios.steelColumn +
    q.stairCft * ratios.steelStair;
  const brick = q.brickworkCft + q.boundaryCft;

  add('excavation', 'Excavation for foundations', excavation, 'cft', 'excavation', true);
  add('pcc', 'Plain concrete (PCC 1:4:8) under foundations', pcc, 'cft', 'pcc', true);
  add('brickwork', 'Brickwork in 1:6 (walls and plinth)', q.brickworkCft, 'cft', 'brickwork');
  add('boundary', 'Brickwork in 1:6 (boundary and parapet walls)', q.boundaryCft, 'cft', 'brickwork');
  add('slab', 'RCC 1:2:4 slabs', q.slabCft, 'cft', 'rcc');
  add(
    'slabEstimate',
    'RCC 1:2:4 roof slabs (none drawn: 6" over the covered area)',
    q.slabEstimateCft,
    'cft',
    'rcc',
    true,
  );
  add('beam', 'RCC 1:2:4 beams', q.beamCft, 'cft', 'rcc');
  add('column', 'RCC 1:2:4 columns', q.columnCft, 'cft', 'rcc');
  add('stair', 'RCC 1:2:4 stairs', q.stairCft, 'cft', 'rcc', true);
  add('block', 'Concrete blocks and raised shapes', q.blockCft, 'cft', 'rcc');
  add('steel', 'Steel reinforcement (Grade 60)', steelKg, 'kg', 'steel', true);
  add('plaster', 'Cement plaster 1:4, ½" (both faces)', q.insideFaceSqft + q.outsideFaceSqft, 'sqft', 'plaster');
  add('paintInside', 'Paint inside (emulsion)', q.insideFaceSqft, 'sqft', 'paintInside');
  add('paintOutside', 'Paint outside (weather coat)', q.outsideFaceSqft, 'sqft', 'paintOutside');
  for (const kind of Object.keys(FLOOR_NAMES) as (keyof typeof FLOOR_NAMES)[])
    add(`floor-${kind}`, FLOOR_NAMES[kind], q.flooring[kind] ?? 0, 'sqft', `flooring.${kind}`);
  add('floor-none', 'Floors with no finish chosen', q.flooring.none ?? 0, 'sqft', 'flooring.other');
  add('doors', 'Doors (frame, shutter and fittings)', q.doors, 'no', 'door');
  add('windows', 'Windows (aluminium and glass)', q.windowSqft, 'sqft', 'window');
  add('electrical', 'Electrical wiring and fittings (per sqft covered)', q.coveredSqft, 'sqft', 'electrical', true);
  add('plumbing', 'Plumbing and sanitary fittings (per sqft covered)', q.coveredSqft, 'sqft', 'plumbing', true);

  // Materials: dry volumes of mortar and concrete (the usual 1.27 and 1.54 factors) split by the mix.
  const mortar = brick * 0.3;
  const rccDry = (rccStructural + q.blockCft) * 1.54;
  const pccDry = pcc * 1.54;
  const plasterDry = (q.insideFaceSqft + q.outsideFaceSqft) * (0.5 / 12) * 1.27;
  const cementCft = mortar / 7 + rccDry / 7 + pccDry / 13 + plasterDry / 5;
  return {
    lines,
    total: lines.reduce((s, l) => s + l.amount, 0),
    materials: {
      bricks: brick * ratios.bricksPerCft,
      cementBags: cementCft / CEMENT_BAG_CFT,
      sandCft: (mortar * 6) / 7 + (rccDry * 2) / 7 + (pccDry * 4) / 13 + (plasterDry * 4) / 5,
      crushCft: (rccDry * 4) / 7 + (pccDry * 8) / 13,
      steelKg,
    },
  };
}

/** Rates and ratios from storage, keeping only sensible numbers (the starter values otherwise). */
export function readRates(raw: unknown): Rates {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 ? v : fallback;
  const group = <K extends string>(v: unknown, fallback: Record<K, number>): Record<K, number> => {
    const g = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(fallback).map(([k, d]) => [k, num(g[k], d as number)])) as Record<
      K,
      number
    >;
  };
  const out = { ...STARTER_RATES } as Record<string, unknown>;
  for (const [k, d] of Object.entries(STARTER_RATES)) out[k] = typeof d === 'number' ? num(r[k], d) : group(r[k], d);
  return out as unknown as Rates;
}

export function readRatios(raw: unknown): Ratios {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out = { ...STARTER_RATIOS };
  for (const k of Object.keys(out) as (keyof Ratios)[]) {
    const v = r[k];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000) out[k] = v;
  }
  return out;
}

/** The table as CSV (opens in Excel): items, then the materials, then the quick check. */
export function estimateCsv(
  title: string,
  est: Estimate,
  quick: { areaSqft: number; grade: Grade; rate: number },
): string {
  const cell = (v: string | number) => {
    const s = typeof v === 'number' ? String(Math.round(v * 100) / 100) : v;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const row = (...v: (string | number)[]) => v.map(cell).join(',');
  const m = est.materials;
  return [
    row(title),
    row('Indicative only: measured from the drawing; rates to be checked with your contractor.'),
    '',
    row('Item', 'Quantity', 'Unit', 'Rate (Rs)', 'Amount (Rs)', 'Note'),
    ...est.lines.map((l) => row(l.label, l.qty, l.unit, l.rate, l.amount, l.estimated ? 'estimated' : '')),
    row('Total', '', '', '', est.total, ''),
    '',
    row('Materials', 'Quantity', 'Unit'),
    row('Bricks', Math.round(m.bricks), 'no'),
    row('Cement', Math.ceil(m.cementBags), 'bags (50 kg)'),
    row('Sand', m.sandCft, 'cft'),
    row('Crush (aggregate)', m.crushCft, 'cft'),
    row('Steel', m.steelKg, 'kg'),
    '',
    row('Quick check', 'Covered area (sqft)', 'Rate (Rs/sqft)', 'Amount (Rs)'),
    row(GRADE_NAMES[quick.grade], quick.areaSqft, quick.rate, quick.areaSqft * quick.rate),
  ].join('\r\n');
}

const grouping = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** Rupees with lakh and crore grouping: 1,23,45,678. */
export const rupees = (n: number) => `Rs ${grouping.format(Math.round(n))}`;

/** A large sum in words: "1.23 crore", "45.6 lakh". */
export function inLakh(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1)} lakh`;
  return '';
}

/** A quantity to show: whole numbers from 100 up, one decimal below. */
export const qtyText = (n: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: n >= 100 ? 0 : 1 }).format(n);
