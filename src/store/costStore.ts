import { createStore, useStore } from 'zustand';
import {
  readRates,
  readRatios,
  STARTER_RATES,
  STARTER_RATIOS,
  withRate,
  type Grade,
  type Rates,
  type Ratios,
} from '../lib/estimate';
import { browserStorage } from '../lib/storage';

const COST_KEY = 'mimar.cost';
const GRADES: Grade[] = ['grey', 'basic', 'standard', 'premium'];

export interface CostSettings {
  rates: Rates;
  ratios: Ratios;
  /** Finish grade for the quick area × rate check. */
  grade: Grade;
  /** Add the bill of quantities to PDFs. */
  pdfCost: boolean;
}

function load(): CostSettings {
  try {
    const raw = JSON.parse(browserStorage()?.getItem(COST_KEY) ?? 'null') as Partial<Record<string, unknown>> | null;
    return {
      rates: readRates(raw?.rates),
      ratios: readRatios(raw?.ratios),
      grade: GRADES.includes(raw?.grade as Grade) ? (raw!.grade as Grade) : 'standard',
      pdfCost: raw?.pdfCost === true,
    };
  } catch {
    return { rates: STARTER_RATES, ratios: STARTER_RATIOS, grade: 'standard', pdfCost: false };
  }
}

/** Your rates and assumptions for the cost estimate, kept on this computer (not in the plan). */
export const costStore = createStore<CostSettings>(load);

costStore.subscribe((s) => {
  try {
    browserStorage()?.setItem(COST_KEY, JSON.stringify(s));
  } catch {
    // Only a convenience.
  }
});

export const useCost = <T>(pick: (s: CostSettings) => T) => useStore(costStore, pick);

/** Keep typed values in the range storage accepts (so a reload never throws them away). */
const clampRate = (v: number) => (Number.isFinite(v) ? Math.min(1e8, Math.max(0, v)) : 0);

export const setRate = (key: string, value: number) =>
  costStore.setState((s) => ({ rates: withRate(s.rates, key, clampRate(value)) }));
export const setRatio = (key: keyof Ratios, value: number) =>
  costStore.setState((s) => ({ ratios: { ...s.ratios, [key]: Math.min(999, clampRate(value)) } }));
export const resetRates = () => costStore.setState({ rates: STARTER_RATES, ratios: STARTER_RATIOS });
