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
  type DrawingStyle,
  type PaperSize,
  type PlanDoc,
  type SavedCamera,
  type Sheet,
  type SheetItem,
  type SheetScale,
} from '../../types';
import { groundAt } from './hiddenLines';
import { paperMm, paperName, type PaperSetting } from '../paper';
import { hatchSegments } from '../hatch';
import { DIM_TEXT_MM, dimStyleOf, endMark, type DimStyle } from '../dimStyle';
import { formatLength } from '../units';
import { drawingKey, drawingTitle, savedView, sideDrawingRefs, type SideDrawing } from './views';

/** The usual scales, offered in the scale lists; any other whole number can be typed. */
export const SHEET_SCALES: SheetScale[] = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];
/** The scales suggested sheets are tried at, most detailed first. */
const FIT_SCALES: SheetScale[] = [50, 100, 200];
export const MIN_SHEET_SCALE = 1;
export const MAX_SHEET_SCALE = 10000;
/** A typed scale (the n of 1:n), or null when it isn't one. */
export function sheetScaleOf(n: unknown): SheetScale | null {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= MIN_SHEET_SCALE && v <= MAX_SHEET_SCALE ? v : null;
}

export type XY = [number, number];

/** One thing to draw on a sheet, in paper millimetres. Text sits on its baseline at y. */
export type Prim =
  | { t: 'line'; a: XY; b: XY; w: number; dash?: number[] }
  | { t: 'fill'; rings: XY[][] }
  | { t: 'tri'; pts: [XY, XY, XY] }
  | { t: 'rect'; x: number; y: number; w: number; h: number; lw: number }
  | { t: 'circle'; x: number; y: number; r: number; lw: number }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      size: number;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      /** Turned anticlockwise, degrees (90 reads up the page). */
      angle?: number;
    }
  /** A coloured 3D picture of the building (rendered when the sheet is shown or printed), filling the box. */
  | { t: 'picture'; x: number; y: number; w: number; h: number; camera?: SavedCamera }
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
export const PEN = { thin: 0.18, heavy: 0.5, cut: 0.35, ground: 0.6, frame: 0.5, fine: 0.13, natural: 0.25 } as const;

/** The natural ground's dashes, where the finished ground differs from it (paper mm). */
export const NATURAL_DASH = [2, 1];

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

/**
 * The floor and the part of it a plan drawing shows: a whole floor (with room round it for its
 * dimensions, `pad` paper mm), or a saved 2D view's own area. Null for other drawings, or an empty floor.
 */
export function planOf(doc: PlanDoc, ref: DrawingRef): { levelId: string; area: Bounds; pad: number } | null {
  if (ref.kind === 'plan') {
    const area = planArea(doc, ref.levelId);
    return area ? { levelId: ref.levelId, area, pad: PLAN_PAD } : null;
  }
  if (ref.kind === 'view') {
    const v = savedView(doc, ref.id);
    if (v?.kind !== 'plan' || !doc.levels.some((l) => l.id === v.levelId)) return null;
    return { levelId: v.levelId, area: v.area, pad: 0 };
  }
  return null;
}

/** Whether a drawing is a coloured 3D picture (the building's, or a saved 3D view's). */
export const isPicture = (ref: DrawingRef) => (ref.kind === 'view3d' || ref.kind === 'view') && ref.style === 'picture';

/** The line drawing a 3D drawing takes the room of: a picture is as big as its lines would be. */
export const linesOf = (ref: DrawingRef): DrawingRef =>
  ref.kind === 'view3d' ? { kind: 'view3d', style: 'iso' } : ref.kind === 'view' ? { kind: 'view', id: ref.id } : ref;

/** A drawing's size on paper at 1:scale (without its caption), or null when it can't be drawn. */
function drawingSize(src: SheetSource, ref: DrawingRef, scale: number): { w: number; h: number } | null {
  const plan = planOf(src.doc, ref);
  if (plan) {
    const a = plan.area;
    return {
      w: ((a.maxX - a.minX) * MM_PER_UNIT) / scale + 2 * plan.pad,
      h: ((a.maxY - a.minY) * MM_PER_UNIT) / scale + 2 * plan.pad,
    };
  }
  if (ref.kind === 'plan') return null;
  // A 3D picture takes the isometric's room.
  const iso = ref.kind === 'view3d' || ref.kind === 'view';
  const d = src.side(linesOf(ref));
  if (!d || (iso && !d.bounds)) return null;
  const e = sideExtent(d);
  const room = dimRoom(d, src.doc.drawing);
  return {
    w: ((e.maxU - e.minU) * 1000) / scale + (d.iso ? 0 : LEVEL_ROOM) + room.left,
    h: ((e.maxV - e.minV) * 1000) / scale + room.below,
  };
}

/** Room for the dimension strings, paper mm: two strings up the left side, two under the drawing. */
const DIM_STEP = 7;
function dimRoom(d: SideDrawing, style?: DrawingStyle): { left: number; below: number } {
  if (style?.sideDims === false || !d.dims || d.iso) return { left: 0, below: 0 };
  const strings = (stops: number[]) => (stops.length > 2 ? 2 : stops.length === 2 ? 1 : 0);
  return { left: strings(d.dims.heights) * DIM_STEP, below: strings(d.dims.across) * DIM_STEP };
}

/** A string of dimensions along a line on paper, from stop to stop, with the plan's text size and ends. */
function dimString(prims: Prim[], stops: XY[], labels: string[], normal: XY, style: DimStyle, textMm: number) {
  if (stops.length < 2) return;
  const a = stops[0];
  const b = stops[stops.length - 1];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 1e-6) return;
  const u = { x: (b[0] - a[0]) / len, y: (b[1] - a[1]) / len };
  const n = { x: normal[0], y: normal[1] };
  prims.push({ t: 'line', a, b, w: PEN.fine });
  stops.forEach((p, i) => {
    // A short extension line through each stop, and its end mark.
    prims.push({
      t: 'line',
      a: [p[0] - n.x * 1.5, p[1] - n.y * 1.5],
      b: [p[0] + n.x * 1.2, p[1] + n.y * 1.2],
      w: PEN.fine,
    });
    const inward = i === stops.length - 1 ? -1 : 1;
    const mark = endMark(style.ends, { x: p[0], y: p[1] }, u, n, inward, 0.8);
    if (mark.kind === 'line') prims.push({ t: 'line', a: [mark.a.x, mark.a.y], b: [mark.b.x, mark.b.y], w: PEN.cut });
    else if (mark.kind === 'dot') prims.push({ t: 'fill', rings: [circleRing(mark.c, mark.r)] });
    else prims.push({ t: 'fill', rings: [mark.pts.map((q): XY => [q.x, q.y])] });
  });
  // Each length beside its piece, upright or reading up the page, where it fits.
  const angle = Math.abs(u.x) >= Math.abs(u.y) ? 0 : 90;
  for (let i = 0; i + 1 < stops.length; i++) {
    const p = stops[i];
    const q = stops[i + 1];
    const piece = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (piece < labels[i].length * textMm * 0.45) continue;
    const mid: XY = [(p[0] + q[0]) / 2 + n.x * 0.8, (p[1] + q[1]) / 2 + n.y * 0.8];
    prims.push({ t: 'text', x: mid[0], y: mid[1], text: labels[i], size: textMm, align: 'center', angle });
  }
}

const circleRing = (c: { x: number; y: number }, r: number): XY[] =>
  Array.from({ length: 12 }, (_, i): XY => [
    c.x + r * Math.cos((i * Math.PI) / 6),
    c.y + r * Math.sin((i * Math.PI) / 6),
  ]);

function sideExtent(d: SideDrawing) {
  const b = d.bounds ?? { minU: -1, maxU: 1, minV: 0, maxV: 1 };
  if (d.iso) return { minU: b.minU - 0.3, maxU: b.maxU + 0.3, minV: b.minV - 0.3, maxV: b.maxV + 0.3 };
  const vs = d.levels.map((l) => l.v);
  if (d.profile) for (const p of [...d.profile.finished, ...d.profile.natural.flat()]) vs.push(p[1]);
  return {
    minU: Math.min(b.minU, d.ground.u0),
    maxU: Math.max(b.maxU, d.ground.u1),
    minV: Math.min(b.minV, ...vs, 0) - 0.3,
    maxV: Math.max(b.maxV, ...vs) + 0.3,
  };
}

/** The drawing area of a sheet: inside the frame, above the title block. */
function drawingArea(paper: PaperSetting) {
  const p = paperMm(paper);
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
function pack(src: SheetSource, items: SheetItem[], paper: PaperSetting): { placed: Placed[]; fits: boolean } {
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
  const paper = paperMm(sheet);
  const prims: Prim[] = [];
  const { placed: packed, fits } = pack(src, sheet.items, sheet);
  // Each drawing where the sheet places it, moved by its own offset.
  const placed = packed.map((p) =>
    p.item.offsetMm ? { ...p, x: p.x + p.item.offsetMm.x, y: p.y + p.item.offsetMm.y } : p,
  );
  for (const p of placed) {
    const ref = p.item.drawing;
    const plan = planOf(src.doc, ref);
    if (plan) {
      const a = plan.area;
      const pad = (plan.pad * p.item.scale) / MM_PER_UNIT;
      prims.push({
        t: 'plan',
        levelId: plan.levelId,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        area: { minX: a.minX - pad, minY: a.minY - pad, maxX: a.maxX + pad, maxY: a.maxY + pad },
        scale: p.item.scale,
      });
    } else if (isPicture(ref)) {
      const v = ref.kind === 'view' ? savedView(src.doc, ref.id) : null;
      prims.push({ t: 'picture', x: p.x, y: p.y, w: p.w, h: p.h, ...(v?.kind === '3d' && { camera: v.camera }) });
    } else {
      const d = src.side(ref);
      if (d) prims.push(...sidePrims(d, p.item.scale, p.x, p.y, src.doc.drawing));
    }
    const notToScale = ref.kind === 'view3d' || (ref.kind === 'view' && !plan);
    caption(prims, drawingTitle(src.doc, ref) ?? '', notToScale ? null : p.item.scale, p.x, p.y + p.h, p.w);
  }
  if (placed.some((p) => planOf(src.doc, p.item.drawing))) {
    const area = drawingArea(sheet);
    prims.push(...northArrowPrims(area.x + area.w - 6, area.y + 8, src.doc.northDeg ?? 0));
  }
  prims.push(...frame(src, sheet, index, count));
  return { paper, prims, overflow: !fits };
}

/** A drawing's name, underlined, and its scale, centred under it. */
function caption(prims: Prim[], title: string, scale: number | null, x: number, bottom: number, w: number) {
  const cx = x + w / 2;
  const y = bottom + 5.5;
  const text = title.toUpperCase();
  prims.push({ t: 'text', x: cx, y, text, size: 3.5, bold: true, align: 'center' });
  const half = Math.min(w / 2, text.length * 1.25);
  prims.push({ t: 'line', a: [cx - half, y + 1.2], b: [cx + half, y + 1.2], w: PEN.thin });
  prims.push({
    t: 'text',
    x: cx,
    y: y + 5,
    text: scale ? `Scale 1:${scale}` : 'Not to scale',
    size: 2.5,
    align: 'center',
  });
}

/** A section or elevation at 1:scale with its top-left corner at (x, y), in the plan's drawing style. */
export function sidePrims(d: SideDrawing, scale: number, x0: number, y: number, style?: DrawingStyle): Prim[] {
  const e = sideExtent(d);
  const room = dimRoom(d, style);
  const x = x0 + room.left;
  const k = 1000 / scale;
  const X = (u: number) => x + (u - e.minU) * k;
  const Y = (v: number) => y + (e.maxV - v) * k;
  const prims: Prim[] = [];
  for (const l of d.lines)
    prims.push({ t: 'line', a: [X(l.a[0]), Y(l.a[1])], b: [X(l.b[0]), Y(l.b[1])], w: l.heavy ? PEN.heavy : PEN.thin });
  d.cut.forEach((poly, j) => {
    const rings = poly.map((r) => r.map((p): XY => [X(p[0]), Y(p[1])]));
    // Hatched by what it is made of (glass is its outline only), or solid black.
    const hatch = style?.solidCuts ? null : (d.cutHatch?.[j] ?? null);
    if (hatch) for (const [a, b] of hatchSegments(hatch, rings, 1)) prims.push({ t: 'line', a, b, w: PEN.fine });
    else prims.push({ t: 'fill', rings });
    for (const r of rings) r.forEach((p, i) => prims.push({ t: 'line', a: p, b: r[(i + 1) % r.length], w: PEN.cut }));
  });
  if (d.iso) return prims;
  // The ground line (or the finished ground, and the natural ground dashed where they differ), with
  // earth hatching under it (not under a basement that is cut).
  const g0 = X(d.ground.u0);
  const g1 = X(d.ground.u1);
  const profile = d.profile?.finished.length ? d.profile.finished : null;
  const gyAt = (px: number) => (profile ? Y(groundAt(profile, e.minU + (px - x) / k)) : Y(0));
  if (profile)
    profile.forEach((p, i) => {
      const q = profile[i + 1];
      if (q) prims.push({ t: 'line', a: [X(p[0]), Y(p[1])], b: [X(q[0]), Y(q[1])], w: PEN.ground });
    });
  else prims.push({ t: 'line', a: [g0, Y(0)], b: [g1, Y(0)], w: PEN.ground });
  for (const run of d.profile?.natural ?? [])
    run.forEach((p, i) => {
      const q = run[i + 1];
      if (q)
        prims.push({ t: 'line', a: [X(p[0]), Y(p[1])], b: [X(q[0]), Y(q[1])], w: PEN.natural, dash: NATURAL_DASH });
    });
  const below = d.cut
    .filter((poly) => poly[0]?.some((p) => p[1] < -0.01))
    .map((poly) => [Math.min(...poly[0].map((p) => X(p[0]))), Math.max(...poly[0].map((p) => X(p[0])))]);
  for (let hx = g0 + 1; hx + 2 < g1; hx += 2.5)
    if (!below.some(([lo, hi]) => hx + 2 > lo && hx < hi)) {
      const gy = gyAt(hx + 1);
      prims.push({ t: 'line', a: [hx + 2, gy + 0.4], b: [hx, gy + 2.4], w: PEN.fine });
    }
  // Dimension strings: heights up the left side, and across under the drawing (each piece, then the whole).
  if (d.dims && (room.left || room.below)) {
    const look = dimStyleOf({ drawing: style });
    const textMm = DIM_TEXT_MM[look.text];
    const len = (m: number) => formatLength(m * 1000, d.dims!.units);
    const labels = (stops: number[]) => stops.slice(1).map((s, i) => len(s - stops[i]));
    const hs = d.dims.heights;
    if (hs.length >= 2) {
      const lx = X(e.minU) - 3;
      dimString(prims, hs.map((v): XY => [lx, Y(v)]).reverse(), labels(hs).reverse(), [-1, 0], look, textMm);
      if (hs.length > 2) {
        const ends = [hs[0], hs[hs.length - 1]];
        dimString(prims, ends.map((v): XY => [lx - DIM_STEP, Y(v)]).reverse(), labels(ends), [-1, 0], look, textMm);
      }
    }
    const xs = d.dims.across;
    if (xs.length >= 2) {
      const by = Math.max(Y(e.minV), Y(0) + 2.4) + 4;
      dimString(
        prims,
        xs.map((u): XY => [X(u), by]),
        labels(xs),
        [0, -1],
        look,
        textMm,
      );
      if (xs.length > 2) {
        const ends = [xs[0], xs[xs.length - 1]];
        dimString(
          prims,
          ends.map((u): XY => [X(u), by + DIM_STEP]),
          labels(ends),
          [0, -1],
          look,
          textMm,
        );
      }
    }
  }
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
  const p = paperMm(sheet);
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
      value: scales.length === 1 ? `1:${scales[0]} on ${paperName(sheet)}` : `As shown, ${paperName(sheet)}`,
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
    text: `Drawn with MIMAR ${src.version}`,
    size: 1.8,
    align: 'right',
  });
  return prims;
}

/** Try the scales from most detailed to least, then bigger paper, until the drawings fit. */
function fitting(src: SheetSource, refs: DrawingRef[]): { paper: PaperSize; scale: SheetScale } {
  for (const paper of ['A3', 'A2', 'A1'] as PaperSize[])
    for (const scale of FIT_SCALES)
      if (
        pack(
          src,
          refs.map((drawing) => ({ drawing, scale })),
          { paper },
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
  // The building in 3D: an isometric in lines and a coloured picture, when there is something to see.
  if (src.side({ kind: 'view3d', style: 'iso' })?.bounds)
    add('3D views', [
      { kind: 'view3d', style: 'iso' },
      { kind: 'view3d', style: 'picture' },
    ]);
  return sheets;
}

/** The plan's sheets: its own, or the suggested set when it has none of its own yet. */
export function sheetsOf(src: SheetSource): Sheet[] {
  return src.doc.sheets ?? suggestedSheets(src);
}

export { drawingKey };
