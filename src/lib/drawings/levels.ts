import { MM_PER_INCH } from '../units';
import type { Units } from '../../types';

/** A height above natural ground as architects write it on a drawing: +11'-6" or +3.350 (metres). */
export function formatLevel(mm: number, units: Units): string {
  const rounded = units === 'metric' ? Math.round(mm) : Math.round(mm / MM_PER_INCH);
  const sign = rounded === 0 ? '±' : rounded > 0 ? '+' : '-';
  if (units === 'metric') return `${sign}${(Math.abs(rounded) / 1000).toFixed(3)}`;
  const inches = Math.abs(rounded);
  return `${sign}${Math.floor(inches / 12)}'-${inches % 12}"`;
}
