import type { PlanDoc } from '../types';
import {
  estimate,
  estimateCsv,
  GRADE_NAMES,
  inLakh,
  qtyText,
  rupees,
  type Estimate,
  type Grade,
  type Rates,
  type Ratios,
} from './estimate';
import { quantities, type FloorQuantities } from './quantities';

export interface CostReport {
  /** "All floors" or the floor's name. */
  scope: string;
  q: FloorQuantities;
  est: Estimate;
  /** Covered area × a rate per square foot, as a quick check on the itemised total. */
  quick: { areaSqft: number; grade: Grade; rate: number; amount: number };
}

/** The bill of quantities for the whole building (floor "all") or one floor. */
export function costReport(
  doc: PlanDoc,
  wallHeightMm: number,
  floor: string,
  settings: { rates: Rates; ratios: Ratios; grade: Grade },
): CostReport {
  const all = quantities(doc, wallHeightMm);
  const one = floor === 'all' ? undefined : all.floors.find((f) => f.levelId === floor);
  const q = one ?? all.total;
  const areaSqft = q.coveredSqft;
  const rate = settings.rates.area[settings.grade];
  return {
    scope: one ? one.name : 'All floors',
    q,
    est: estimate(q, settings.rates, settings.ratios),
    quick: { areaSqft, grade: settings.grade, rate, amount: areaSqft * rate },
  };
}

const UNIT_TEXT = { cft: 'cft', sqft: 'sqft', kg: 'kg', no: 'no.' } as const;

/** The materials, one line each. */
export function materialLines(est: Estimate): string[] {
  const m = est.materials;
  return [
    `Bricks: ${qtyText(Math.round(m.bricks))}`,
    `Cement: ${qtyText(Math.ceil(m.cementBags))} bags (50 kg)`,
    `Sand: ${qtyText(m.sandCft)} cft`,
    `Crush (aggregate): ${qtyText(m.crushCft)} cft`,
    `Steel: ${qtyText(m.steelKg)} kg`,
  ];
}

export const COST_NOTE =
  'Indicative only: quantities are measured from the drawing (foundations, stairs and steel are estimated), and the starter rates are rough Rawalpindi/Islamabad figures for September 2026. Check with your contractor.';

/** The cost page for the PDF. */
export function costPdf(r: CostReport) {
  const words = inLakh(r.est.total);
  return {
    heading: `${r.scope}. Quantities in cubic feet (cft), square feet (sqft), kilograms and numbers.`,
    rows: r.est.lines.map((l) => ({
      label: `${l.label}${l.estimated ? ' (estimated)' : ''}`,
      qty: `${qtyText(l.qty)} ${UNIT_TEXT[l.unit]}`,
      rate: qtyText(l.rate),
      amount: qtyText(Math.round(l.amount)),
    })),
    total: `${rupees(r.est.total)}${words ? ` (${words})` : ''}`,
    materials: materialLines(r.est),
    quick: `Quick check: ${qtyText(r.quick.areaSqft)} sqft covered area × Rs ${qtyText(r.quick.rate)} per sqft (${GRADE_NAMES[r.quick.grade].toLowerCase()}) = ${rupees(r.quick.amount)}`,
    footer: COST_NOTE,
  };
}

/** The report as a CSV file's text. */
export const costCsv = (title: string, r: CostReport) => estimateCsv(`${title} – ${r.scope}`, r.est, r.quick);
