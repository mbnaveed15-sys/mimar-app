import type { Units } from '../types';

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

/** Snapping grid for each unit system: 1 ft or 250 mm. */
export const GRID_MM: Record<Units, number> = { imperial: MM_PER_FOOT, metric: 250 };

export const UNIT_LABELS: Record<Units, string> = {
  imperial: 'Feet & inches',
  metric: 'Metric (m / mm)',
};

export const LENGTH_HINT: Record<Units, string> = {
  imperial: `e.g. 12' 6" or 12.5`,
  metric: 'e.g. 3.5 m or 3500 mm',
};

/** Format a length for display, e.g. 12' 6" or 3.50 m / 850 mm. */
export function formatLength(mm: number, units: Units): string {
  const sign = mm < 0 ? '-' : '';
  const abs = Math.abs(mm);
  if (units === 'metric') {
    return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(2)} m` : `${sign}${Math.round(abs)} mm`;
  }
  const totalInches = Math.round(abs / MM_PER_INCH);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  if (feet === 0) return `${sign}${inches}"`;
  return `${sign}${feet}' ${inches}"`;
}

const NUM = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const METRIC_RE = new RegExp(String.raw`^${NUM}\s*(mm|cm|m)$`);
const FEET_INCHES_RE = new RegExp(
  String.raw`^(?:${NUM}\s*(?:'|ft|feet|foot))?\s*-?\s*(?:${NUM}\s*(?:"|''|in|inch|inches)?)?$`,
);
const INCHES_ONLY_RE = new RegExp(String.raw`^${NUM}\s*(?:"|''|in|inch|inches)$`);
const PLAIN_RE = new RegExp(String.raw`^${NUM}$`);

/**
 * Parse a length typed by the user into millimetres, or null if it can't be read.
 * Accepts metric (3.5 m, 350 cm, 3500 mm) and imperial (12' 6", 12ft 6in, 12'6, 6", 12.5')
 * in either unit system. A bare number uses the current units: feet, or metres.
 */
export function parseLength(text: string, units: Units): number | null {
  const s = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let mm: number | null = null;

  const plain = PLAIN_RE.exec(s);
  const metric = METRIC_RE.exec(s);
  const inchesOnly = INCHES_ONLY_RE.exec(s);
  if (plain) {
    mm = Number(plain[1]) * (units === 'imperial' ? MM_PER_FOOT : 1000);
  } else if (metric) {
    const factor = { mm: 1, cm: 10, m: 1000 }[metric[2] as 'mm' | 'cm' | 'm'];
    mm = Number(metric[1]) * factor;
  } else if (inchesOnly) {
    mm = Number(inchesOnly[1]) * MM_PER_INCH;
  } else {
    const fi = FEET_INCHES_RE.exec(s);
    if (fi && fi[1] !== undefined) {
      mm = Number(fi[1]) * MM_PER_FOOT + (fi[2] !== undefined ? Number(fi[2]) * MM_PER_INCH : 0);
    }
  }
  return mm !== null && Number.isFinite(mm) ? mm : null;
}
