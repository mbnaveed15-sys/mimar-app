/**
 * Which sections and elevations a plan has, their names and keys, and which way each section looks.
 * Light (no geometry), so the store and the plan can use it without loading the drawing code.
 */
import type { DrawingRef, ElevationSide, PlanDoc, SectionLine } from '../../types';

export const ELEVATION_SIDES: ElevationSide[] = ['front', 'back', 'left', 'right'];

export const ELEVATION_NAMES: Record<ElevationSide, string> = {
  front: 'Front elevation',
  back: 'Back elevation',
  left: 'Left side elevation',
  right: 'Right side elevation',
};

/** A stable key for a drawing, e.g. "section:abc", "elevation:front" or "plan:ground". */
export function drawingKey(ref: DrawingRef): string {
  if (ref.kind === 'plan') return `plan:${ref.levelId}`;
  if (ref.kind === 'section') return `section:${ref.id}`;
  return `elevation:${ref.side}`;
}

export function drawingFromKey(key: string): DrawingRef | null {
  const [kind, rest] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'plan' && rest) return { kind: 'plan', levelId: rest };
  if (kind === 'section' && rest) return { kind: 'section', id: rest };
  if (kind === 'elevation' && ELEVATION_SIDES.includes(rest as ElevationSide))
    return { kind: 'elevation', side: rest as ElevationSide };
  return null;
}

export const sectionLines = (doc: Pick<PlanDoc, 'elements'>): SectionLine[] =>
  doc.elements.filter((el): el is SectionLine => el.type === 'section');

export const sectionTitle = (line: Pick<SectionLine, 'label'>) => `Section ${line.label}–${line.label}`;

/** The next free letter for a new section line: A, B, … Z, then AA, AB, … */
export function nextSectionLabel(doc: Pick<PlanDoc, 'elements'>): string {
  const used = new Set(sectionLines(doc).map((s) => s.label));
  for (let i = 0; ; i++) {
    const label =
      i < 26
        ? String.fromCharCode(65 + i)
        : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
    if (!used.has(label)) return label;
  }
}

/** The way a section line looks, in plan (and scene x/z) terms: to its right, or its left when flipped. */
export function sectionLook(line: Pick<SectionLine, 'x1' | 'y1' | 'x2' | 'y2' | 'flip'>): { x: number; z: number } {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1;
  // With y pointing down the page, (-dy, dx) is the right-hand side going from start to end.
  const s = line.flip ? -1 : 1;
  return { x: (-dy / len) * s, z: (dx / len) * s };
}

/** Every section and elevation the plan has, in order: sections by letter, then the four elevations. */
export function sideDrawingRefs(doc: Pick<PlanDoc, 'elements'>): DrawingRef[] {
  const sections = sectionLines(doc)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((s): DrawingRef => ({ kind: 'section', id: s.id }));
  return [...sections, ...ELEVATION_SIDES.map((side): DrawingRef => ({ kind: 'elevation', side }))];
}

/** A drawing's name, for lists and title blocks (null when it no longer exists). */
export function drawingTitle(doc: PlanDoc, ref: DrawingRef): string | null {
  if (ref.kind === 'plan') {
    const level = doc.levels.find((l) => l.id === ref.levelId);
    return level ? `${level.name} plan` : null;
  }
  if (ref.kind === 'section') {
    const line = sectionLines(doc).find((s) => s.id === ref.id);
    return line ? sectionTitle(line) : null;
  }
  return ELEVATION_NAMES[ref.side];
}
