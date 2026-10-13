/**
 * How dimensions look: their text size and how their lines end (a tick, an arrow or a dot). Kept with the
 * project, so a drawing set looks the same on another computer. Pure.
 */
import type { DimEnds, DimText, DrawingStyle, Point } from '../types';

export interface DimStyle {
  text: DimText;
  ends: DimEnds;
}

export const DEFAULT_DIM_STYLE: DimStyle = { text: 'medium', ends: 'tick' };

/** Text size against Medium (today's look). */
export const DIM_TEXT_SCALE: Record<DimText, number> = { small: 0.75, medium: 1, large: 1.4 };
/** The text's height on paper, mm (for printed drawings and the DXF's dimension style). */
export const DIM_TEXT_MM: Record<DimText, number> = { small: 2.5, medium: 3.5, large: 5 };

export const DIM_TEXT_LABELS: { id: DimText; label: string }[] = [
  { id: 'small', label: 'Small' },
  { id: 'medium', label: 'Medium' },
  { id: 'large', label: 'Large' },
];
export const DIM_END_LABELS: { id: DimEnds; label: string }[] = [
  { id: 'tick', label: 'Tick' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'dot', label: 'Dot' },
];

export const dimStyleOf = (doc: { drawing?: DrawingStyle }): DimStyle => ({
  text: doc.drawing?.dimText ?? DEFAULT_DIM_STYLE.text,
  ends: doc.drawing?.dimEnds ?? DEFAULT_DIM_STYLE.ends,
});

/** One piece of an end mark: a line, a filled outline or a filled dot. */
export type EndMark =
  | { kind: 'line'; a: Point; b: Point }
  | { kind: 'fill'; pts: Point[] }
  | { kind: 'dot'; c: Point; r: number };

/**
 * The mark at one end `p` of a dimension line running along `u` (a unit vector, start to end), with `n` its
 * normal. `inward` is +1 at the start (the line runs on along u) and -1 at the end. `size` is a tick's half
 * length; arrows and dots are sized to match.
 */
export function endMark(ends: DimEnds, p: Point, u: Point, n: Point, inward: 1 | -1, size: number): EndMark {
  if (ends === 'dot') return { kind: 'dot', c: p, r: size * 0.45 };
  if (ends === 'arrow') {
    const len = size * 1.75;
    const half = len * 0.3;
    const base = { x: p.x + u.x * len * inward, y: p.y + u.y * len * inward };
    return {
      kind: 'fill',
      pts: [p, { x: base.x + n.x * half, y: base.y + n.y * half }, { x: base.x - n.x * half, y: base.y - n.y * half }],
    };
  }
  // The slash leans the same way at both ends, as on a drawing board.
  const s = { x: (u.x - n.x) * size, y: (u.y - n.y) * size };
  return { kind: 'line', a: { x: p.x - s.x, y: p.y - s.y }, b: { x: p.x + s.x, y: p.y + s.y } };
}
