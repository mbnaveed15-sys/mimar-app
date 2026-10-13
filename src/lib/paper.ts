/**
 * Paper sizes for sheets and PDFs: ISO A and B, US architectural (ARCH) and US (ANSI) sizes, or a
 * custom size. Pure.
 */
import type { PaperSize } from '../types';

export type PaperGroup = 'ISO A' | 'ISO B' | 'US architectural' | 'US (ANSI)';

/** Each size in millimetres, landscape (the longer side across), and its group in the lists. */
export const PAPERS: Record<Exclude<PaperSize, 'custom'>, { w: number; h: number; group: PaperGroup }> = {
  A0: { w: 1189, h: 841, group: 'ISO A' },
  A1: { w: 841, h: 594, group: 'ISO A' },
  A2: { w: 594, h: 420, group: 'ISO A' },
  A3: { w: 420, h: 297, group: 'ISO A' },
  A4: { w: 297, h: 210, group: 'ISO A' },
  B1: { w: 1000, h: 707, group: 'ISO B' },
  B2: { w: 707, h: 500, group: 'ISO B' },
  B3: { w: 500, h: 353, group: 'ISO B' },
  B4: { w: 353, h: 250, group: 'ISO B' },
  'ARCH A': { w: 304.8, h: 228.6, group: 'US architectural' },
  'ARCH B': { w: 457.2, h: 304.8, group: 'US architectural' },
  'ARCH C': { w: 609.6, h: 457.2, group: 'US architectural' },
  'ARCH D': { w: 914.4, h: 609.6, group: 'US architectural' },
  'ARCH E1': { w: 1066.8, h: 762, group: 'US architectural' },
  'ARCH E': { w: 1219.2, h: 914.4, group: 'US architectural' },
  Letter: { w: 279.4, h: 215.9, group: 'US (ANSI)' },
  Legal: { w: 355.6, h: 215.9, group: 'US (ANSI)' },
  Tabloid: { w: 431.8, h: 279.4, group: 'US (ANSI)' },
  'ANSI C': { w: 558.8, h: 431.8, group: 'US (ANSI)' },
  'ANSI D': { w: 863.6, h: 558.8, group: 'US (ANSI)' },
  'ANSI E': { w: 1117.6, h: 863.6, group: 'US (ANSI)' },
};

export const PAPER_SIZES = Object.keys(PAPERS) as Exclude<PaperSize, 'custom'>[];
export const PAPER_GROUPS: PaperGroup[] = ['ISO A', 'ISO B', 'US architectural', 'US (ANSI)'];

/** A custom size's sides are kept between these, mm. */
export const MIN_PAPER_MM = 100;
export const MAX_PAPER_MM = 5000;

export const isPaperSize = (v: unknown): v is PaperSize => v === 'custom' || (typeof v === 'string' && v in PAPERS);

/** A custom side in mm, or null when it isn't one. */
export function paperSideOf(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= MIN_PAPER_MM && n <= MAX_PAPER_MM ? n : null;
}

/** How a sheet's paper is set: its size, turned upright or not, and a custom size's sides. */
export interface PaperSetting {
  paper: PaperSize;
  portrait?: boolean;
  customMm?: { w: number; h: number };
}

/** The default custom size: A3 landscape. */
export const DEFAULT_CUSTOM = { w: 420, h: 297 };

/** The paper's size in mm as it lies on the table: landscape unless turned upright (a custom size as typed). */
export function paperMm(s: PaperSetting): { w: number; h: number } {
  if (s.paper === 'custom') return { ...(s.customMm ?? DEFAULT_CUSTOM) };
  const p = PAPERS[s.paper];
  return s.portrait ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** The paper's name for lists and title blocks: "A3", "A1 portrait", "Custom 600 × 400 mm". */
export function paperName(s: PaperSetting): string {
  if (s.paper === 'custom') {
    const { w, h } = s.customMm ?? DEFAULT_CUSTOM;
    return `Custom ${w} × ${h} mm`;
  }
  return s.portrait ? `${s.paper} portrait` : s.paper;
}

/** What jsPDF needs for a page of this paper. */
export function pdfPage(s: PaperSetting): { format: [number, number]; orientation: 'landscape' | 'portrait' } {
  const { w, h } = paperMm(s);
  return { format: [w, h], orientation: w >= h ? 'landscape' : 'portrait' };
}
