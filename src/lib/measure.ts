import type { Units } from '../types';
import { parseLength } from './units';

/** A value typed into the Measurements box. Lengths are in millimetres. */
export type Measure =
  | { kind: 'length'; mm: number }
  | { kind: 'pair'; a: number; b: number }
  | { kind: 'angle'; deg: number }
  | { kind: 'copies'; n: number; spread: boolean }
  | { kind: 'factor'; factor: number };

/** What the active tool expects to be typed. */
export type MeasureKind = 'length' | 'pair' | 'angle' | 'move' | 'scale' | 'none';

const COPIES_RE = /^(?:(\d+)\s*[x*]|[x*]\s*(\d+))$/i;
const SPREAD_RE = /^\/\s*(\d+)$/;
const ANGLE_RE = /^(-?\d+(?:\.\d+)?|-?\.\d+)\s*°?$/;

/** A length that may start with a minus sign (to draw the other way). */
function signedLength(text: string, units: Units): number | null {
  const t = text.trim();
  const negative = t.startsWith('-');
  const mm = parseLength(negative ? t.slice(1) : t, units);
  return mm === null ? null : negative ? -mm : mm;
}

/**
 * Read what was typed into the Measurements box, e.g. `12'6`, `3.8m`, `12',10'`, `90`, `3x` or `/3`.
 * Returns null when the text doesn't fit what the tool expects.
 */
export function parseMeasure(text: string, units: Units, expect: MeasureKind): Measure | null {
  const t = text.trim();
  if (!t) return null;

  if (expect === 'none') return null;
  if (expect === 'scale') {
    // A bare number (optionally with x) is a factor; a length with units sets the reference length.
    const f = /^(\d+(?:\.\d+)?|\.\d+)\s*x?$/i.exec(t);
    if (f) return Number(f[1]) > 0 ? { kind: 'factor', factor: Number(f[1]) } : null;
  }
  if (expect === 'angle') {
    const m = ANGLE_RE.exec(t);
    return m ? { kind: 'angle', deg: Number(m[1]) } : null;
  }
  if (expect === 'move') {
    const copies = COPIES_RE.exec(t);
    if (copies) {
      const n = Number(copies[1] ?? copies[2]);
      return n >= 1 && n <= 100 ? { kind: 'copies', n, spread: false } : null;
    }
    const spread = SPREAD_RE.exec(t);
    if (spread) {
      const n = Number(spread[1]);
      return n >= 1 && n <= 100 ? { kind: 'copies', n, spread: true } : null;
    }
  }
  if (expect === 'pair') {
    const parts = t.split(/[,;]/);
    if (parts.length === 2) {
      const a = signedLength(parts[0], units);
      const b = signedLength(parts[1], units);
      return a !== null && b !== null && a !== 0 && b !== 0 ? { kind: 'pair', a, b } : null;
    }
  }
  const mm = signedLength(t, units);
  return mm !== null && mm !== 0 ? { kind: 'length', mm } : null;
}

/**
 * Whether a key press goes to the Measurements box. Typing starts with a digit, point, minus or slash;
 * once started, letters (units such as m, mm, ft and the x of 3x) and spaces continue it, so they
 * don't switch tools.
 */
export function isMeasureKey(key: string, typed: string): boolean {
  if (key.length !== 1) return false;
  if (!typed) return /[0-9./-]/.test(key);
  return /[0-9.,;'"/xX*°a-zA-Z -]/.test(key);
}
