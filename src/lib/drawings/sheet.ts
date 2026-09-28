/**
 * Drawing sheets: what goes where on the paper, as simple drawing instructions in paper
 * millimetres (y down), which the Drawings view draws on screen and the PDF export prints. Pure.
 */
import { planBounds } from '../../geometry';
import { MM_PER_UNIT } from '../scale';
import {
  levelOf,
  type Bounds,
  type DrawingRef,
  type PaperSize,
  type PlanDoc,
  type Sheet,
  type SheetItem,
  type SheetScale,
} from '../../types';
import { drawingKey, drawingTitle, sideDrawingRefs, type SideDrawing } from './views';

/** Landscape paper sizes in millimetres. */
export const SHEET_PAPER: Record<PaperSize, { w: number; h: number }> = {
  A4: { w: 297, h: 210 },
  A3: { w: 420, h: 297 },
  A1: { w: 841, h: 594 },
};

export const SHEET_SCALES: SheetScale[] = [50, 100, 200];

export type XY = [number, number];

/** One thing to draw on a sheet, in paper millimetres. Text sits on its baseline at y. */
export type Prim =
  | { t: 'line'; a: XY; b: XY; w: number; dash?: number[] }
  | { t: 'fill'; rings: XY[][] }
  | { t: 'tri'; pts: [XY, XY, XY] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; lw: number }
  | { t: 'circle'; x: number; y: number; r: number; lw: number }
  | { t: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; align?: 'left' | 'center' | 'right' }
  /** A floor plan, drawn by the plan renderer: `area` (plan units) fills the box. */
  | { t: 'plan'; levelId: string; x: number; y: number; w: number; h: number; area: Bounds; scale: number };

const MARGIN = 10;
const TITLE_BLOCK = 18;
/** Space between the frame and the drawings, and between drawings. */
const GAP = 8;
/** Below each drawing: its name and scale. */
const CAPTION = 11;
/** Room to the right of a section or elevation for its level marks. */
const LEVEL_ROOM = 36;
/** Room round a plan for its dimension lines and labels, on paper. */
const PLAN_PAD = 12;

/** Line weights on paper, in millimetres. */
export const PEN = { thin: 0.18, heavy: 0.5, cut: 0.35, ground: 0.6, frame: 0.5, fine: 0.13 } as const;

/** What a sheet needs to know about the plan's drawings. */
export interface SheetSource {
  doc: PlanDoc;
  /** A section or elevation, worked out on demand (null when it no longer exists). */
  side: (ref: DrawingRef) => SideDrawing | null;
  projectName: string;
  version: string;
  date: string;
}

/** The part of the plan a floor's plan shows (null for an empty floor). */
export function planArea(doc: PlanDoc, levelId: string): Bounds | null {
  // Section lines from every floor are drawn on each plan, so they count too.
  const els = doc.elements.filter((el) => levelOf(el) === levelId || el.type === 'section');
  if (
    !els.some((el) => el.type !== 'section' && levelOf(el) === levelId) &&
    !doc.rooms.some((r) => levelOf(r) === levelId)
  )
    return null;
  return planBounds(els, doc.masks);
}

/** A drawing's size on paper at 1:scale (without its caption), or null when it can't be drawn. */
function drawingSize(src: SheetSource, ref: DrawingRef, scale: number): { w: number; h: number } | null {
  if (ref.kind === 'plan') {
    const a = planArea(src.doc, ref.levelId);
    if (!a) return null;
    return {
      w: ((a.maxX - a.minX) * MM_PER_UNIT) / scale + 2 * PLAN_PAD,
      h: ((a.maxY - a.minY) * MM_PER_UNIT) / scale + 2 * PLAN_PAD,
    };
  }
  const d = src.side(ref);
  if (!d) return null;
  const e = sideExtent(d);
  return { w: ((e.maxU - e.minU) * 1000) / scale + LEVEL_ROOM, h: ((e.maxV - e.minV) * 1000) / scale };
}

function sideExtent(d: SideDrawing) {
  const b = d.bounds ?? { minU: -1, maxU: 1, minV: 0, maxV: 1 };
  const vs = d.levels.map((l) => l.v);
  return {
    minU: Math.min(b.minU, d.ground.u0),
    maxU: Math.max(b.maxU, d.ground.u1),
    minV: Math.min(b.minV, ...vs, 0) - 0.3,
    maxV: Math.max(b.maxV, ...vs) + 0.3,
  };
}

/** The drawing area of a sheet: inside the frame, above the title block. */
function drawingArea(paper: PaperSize) {
  const p = SHEET_PAPER[paper];
  return { x: MARGIN + GAP, y: MARGIN + GAP, w: p.w - 2 * (MARGIN + GAP), h: p.h - 2 * MARGIN - TITLE_BLOCK - 2 * GAP };
}

interface Placed {
  item: SheetItem;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rows of drawings, left to right, each row centred; null when they don't fit the paper. */
function pack(src: SheetSource, items: SheetItem[], paper: PaperSize): { placed: Placed[]; fits: boolean } {
  const area = drawingArea(paper);
  const boxes = items
    .map((item) => ({ item, size: drawingSize(src, item.drawing, item.scale) }))
    .filter((b): b is { item: SheetItem; size: { w: number; h: number } } => b.size !== null);
  const rows: { items: typeof boxes; w: number; h: number }[] = [];
  for (const b of boxes) {
    const row = rows[rows.length - 1];
    const h = b.size.h + CAPTION;
    if (row && row.w + GAP + b.size.w <= area.w) {
      row.items.push(b);
      row.w += GAP + b.size.w;
      row.h = Math.max(row.h, h);
    } else rows.push({ items: [b], w: b.size.w, h });
  }
  const total = rows.reduce((sum, r) => sum + r.h, 0) + GAP * Math.max(0, rows.length - 1);
  const fits = total <= area.h + 0.01 && rows.every((r) => r.w <= area.w + 0.01);
  const placed: Placed[] = [];
  let y = area.y + Math.max(0, (area.h - total) / 2);
  for (const r of rows) {
    let x = area.x + Math.max(0, (area.w - r.w) / 2);
    for (const b of r.items) {
      // Drawings in a row share a bottom line, like drawings on a board.
      placed.push({ item: b.item, x, y: y + r.h - CAPTION - b.size.h, w: b.size.w, h: b.size.h });
      x += b.size.w + GAP;
    }
    y += r.h + GAP;
  }
  return { placed, fits };
}

export interface SheetLayout {
  paper: { w: number; h: number };
  prims: Prim[];
  /** The drawings don't all fit: a smaller scale or bigger paper is needed. */
  overflow: boolean;
}

/** Lay out a sheet: frame, drawings with their names and scales, and the title block. */
export function layoutSheet(src: SheetSource, sheet: Sheet, index: number, count: number): SheetLayout {
  const paper = SHEET_PAPER[sheet.paper];
  const prims: Prim[] = [];
  const { placed, fits } = pack(src, sheet.items, sheet.paper);
  for (const p of placed) {
    const ref = p.item.drawing;
    if (ref.kind === 'plan') {
      const a = planArea(src.doc, ref.levelId)!;
      const pad = (PLAN_PAD * p.item.scale) / MM_PER_UNIT;
      prims.push({
        t: 'plan',
        levelId: ref.levelId,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        area: { minX: a.minX - pad, minY: a.minY - pad, maxX: a.maxX + pad, maxY: a.maxY + pad },
        scale: p.item.scale,
      });
    } else {
      const d = src.side(ref);
      if (d) prims.push(...sidePrims(d, p.item.scale, p.x, p.y));
    }
    caption(prims, drawingTitle(src.doc, ref) ?? '', p.item.scale, p.x, p.y + p.h, p.w);
  }
  if (placed.some((p) => p.item.drawing.kind === 'plan')) {
    const area = drawingArea(sheet.paper);
    prims.push(...northArrowPrims(area.x + area.w - 6, area.y + 8, src.doc.northDeg ?? 0));
  }
  prims.push(...frame(src, sheet, index, count));
  return { paper, prims, overflow: !fits };
}

/** A drawing's name, underlined, and its scale, centred under it. */
function caption(prims: Prim[], title: string, scale: number, x: number, bottom: number, w: number) {
  const cx = x + w / 2;
  const y = bottom + 5.5;
  const text = title.toUpperCase();
  prims.push({ t: 'text', x: cx, y, text, size: 3.5, bold: true, align: 'center' });
  const half = Math.min(w / 2, text.length * 1.25);
  prims.push({ t: 'line', a: [cx - half, y + 1.2], b: [cx + half, y + 1.2], w: PEN.thin });
  prims.push({ t: 'text', x: cx, y: y + 5, text: `Scale 1:${scale}`, size: 2.5, align: 'center' });
}

/** A section or elevation at 1:scale with its top-left corner at (x, y). */
export function sidePrims(d: SideDrawing, scale: number, x: number, y: number): Prim[] {
  const e = sideExtent(d);
  const k = 1000 / scale;
  const X = (u: number) => x + (u - e.minU) * k;
  const Y = (v: number) => y + (e.maxV - v) * k;
  const prims: Prim[] = [];
  for (const l of d.lines)
    prims.push({ t: 'line', a: [X(l.a[0]), Y(l.a[1])], b: [X(l.b[0]), Y(l.b[1])], w: l.heavy ? PEN.heavy : PEN.thin });
  for (const poly of d.cut) {
    const rings = poly.map((r) => r.map((p): XY => [X(p[0]), Y(p[1])]));
    prims.push({ t: 'fill', rings });
    for (const r of rings) r.forEach((p, i) => prims.push({ t: 'line', a: p, b: r[(i + 1) % r.length], w: PEN.cut }));
  }
  // The ground line, with earth hatching under it (not under a basement that is cut).
  const g0 = X(d.ground.u0);
  const g1 = X(d.ground.u1);
  const gy = Y(0);
  prims.push({ t: 'line', a: [g0, gy], b: [g1, gy], w: PEN.ground });
  const below = d.cut
    .filter((poly) => poly[0]?.some((p) => p[1] < -0.01))
    .map((poly) => [Math.min(...poly[0].map((p) => X(p[0]))), Math.max(...poly[0].map((p) => X(p[0])))]);
  for (let hx = g0 + 1; hx + 2 < g1; hx += 2.5)
    if (!below.some(([lo, hi]) => hx + 2 > lo && hx < hi))
      prims.push({ t: 'line', a: [hx + 2, gy + 0.4], b: [hx, gy + 2.4], w: PEN.fine });
  // Level marks to the right: a leader from the drawing, a marker, the height and the name.
  const right = X(e.maxU) + 3;
  let lastY = Infinity;
  for (const m of [...d.levels].sort((a, b) => a.v - b.v)) {
    const ly = Y(m.v);
    prims.push({ t: 'line', a: [X(e.maxU) - 1, ly], b: [right + 4, ly], w: PEN.fine, dash: [1, 0.8] });
    prims.push({
      t: 'tri',
      pts: [
        [right + 2, ly],
        [right + 0.6, ly - 1.8],
        [right + 3.4, ly - 1.8],
      ],
    });
    // Keep marks that are close together from writing over each other.
    const ty = Math.min(ly - 0.6, lastY - 3);
    prims.push({ t: 'text', x: right + 5, y: ty, text: m.label, size: 2.4, bold: true });
    prims.push({ t: 'text', x: right + 5 + m.label.length * 1.5 + 1.5, y: ty, text: m.name, size: 2.1 });
    lastY = ty;
  }
  return prims;
}

/** A north arrow centred at (cx, cy), pointing `deg` clockwise from up the page. */
function northArrowPrims(cx: number, cy: number, deg: number): Prim[] {
  const r = 6;
  const a = (deg * Math.PI) / 180;
  const at = (x: number, y: number): XY => [
    cx + x * Math.cos(a) - y * Math.sin(a),
    cy + x * Math.sin(a) + y * Math.cos(a),
  ];
  const n = at(0, -r - 3);
  return [
    { t: 'circle', x: cx, y: cy, r, lw: 0.3 },
    { t: 'tri', pts: [at(0, -r), at(-2.2, r * 0.55), at(0, r * 0.2)] },
    { t: 'line', a: at(0, -r), b: at(2.2, r * 0.55), w: 0.3 },
    { t: 'line', a: at(2.2, r * 0.55), b: at(0, r * 0.2), w: 0.3 },
    { t: 'text', x: n[0], y: n[1] + 1.2, text: 'N', size: 3.2, bold: true, align: 'center' },
  ];
}

/** The frame round the sheet and its title block along the bottom. */
function frame(src: SheetSource, sheet: Sheet, index: number, count: number): Prim[] {
  const p = SHEET_PAPER[sheet.paper];
  const x0 = MARGIN;
  const x1 = p.w - MARGIN;
  const top = p.h - MARGIN - TITLE_BLOCK;
  const bottom = p.h - MARGIN;
  const scales = [...new Set(sheet.items.map((i) => i.scale))];
  const cols: { label: string; value: string; share: number; big?: boolean }[] = [
    { label: 'Project', value: src.projectName, share: 3, big: true },
    { label: 'Drawing', value: sheet.name, share: 3, big: true },
    {
      label: 'Scale',
      value: scales.length === 1 ? `1:${scales[0]} on ${sheet.paper}` : `As shown, ${sheet.paper}`,
      share: 1.4,
    },
    { label: 'Date', value: src.date, share: 1.4 },
    { label: 'Sheet', value: `${index + 1} of ${count}`, share: 1 },
  ];
  const prims: Prim[] = [
    { t: 'rect', x: x0, y: MARGIN, w: x1 - x0, h: p.h - 2 * MARGIN, lw: PEN.frame },
    { t: 'line', a: [x0, top], b: [x1, top], w: PEN.frame },
  ];
  const total = cols.reduce((s, c) => s + c.share, 0);
  let x = x0;
  cols.forEach((c, i) => {
    const w = ((x1 - x0) * c.share) / total;
    if (i > 0) prims.push({ t: 'line', a: [x, top], b: [x, bottom], w: PEN.thin });
    prims.push({ t: 'text', x: x + 3, y: top + 5, text: c.label.toUpperCase(), size: 2.2 });
    const size = c.big ? 4.2 : 3.4;
    // Long names are cut short rather than running into the next box.
    const room = Math.floor((w - 6) / (size * 0.52));
    const value = c.value.length > room ? `${c.value.slice(0, Math.max(1, room - 1))}…` : c.value;
    prims.push({ t: 'text', x: x + 3, y: top + 12.5, text: value, size, bold: c.big });
    x += w;
  });
  prims.push({
    t: 'text',
    x: x1 - 2,
    y: bottom - 1.5,
    text: `Drawn with Mimar ${src.version}`,
    size: 1.8,
    align: 'right',
  });
  return prims;
}

/** Try the scales from most detailed to least, then bigger paper, until the drawings fit. */
function fitting(src: SheetSource, refs: DrawingRef[]): { paper: PaperSize; scale: SheetScale } {
  for (const paper of ['A3', 'A1'] as PaperSize[])
    for (const scale of SHEET_SCALES)
      if (
        pack(
          src,
          refs.map((drawing) => ({ drawing, scale })),
          paper,
        ).fits
      )
        return { paper, scale };
  return { paper: 'A1', scale: 200 };
}

/**
 * The sheets suggested for a plan: a sheet per floor plan, one for the sections and one for the
 * elevations, each on A3 at the most detailed scale that fits (A1 when even 1:200 doesn't).
 */
export function suggestedSheets(src: SheetSource): Sheet[] {
  const { doc } = src;
  const sheets: Sheet[] = [];
  const add = (name: string, refs: DrawingRef[]) => {
    if (!refs.length) return;
    const { paper, scale } = fitting(src, refs);
    sheets.push({
      id: `suggested-${sheets.length + 1}`,
      name,
      paper,
      items: refs.map((drawing) => ({ drawing, scale })),
    });
  };
  for (const level of doc.levels)
    if (planArea(doc, level.id)) add(`${level.name} plan`, [{ kind: 'plan', levelId: level.id }]);
  const sides = sideDrawingRefs(doc).filter((ref) => src.side(ref)?.bounds);
  add(
    'Sections',
    sides.filter((r) => r.kind === 'section'),
  );
  add(
    'Elevations',
    sides.filter((r) => r.kind === 'elevation'),
  );
  return sheets;
}

/** The plan's sheets: its own, or the suggested set when it has none of its own yet. */
export function sheetsOf(src: SheetSource): Sheet[] {
  return src.doc.sheets ?? suggestedSheets(src);
}

export { drawingKey };
