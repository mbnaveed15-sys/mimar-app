import { elementOutline, fromFurnitureLocal, planBounds, wallLength, wallParam } from '../geometry';
import { openingSymbol } from './openingKinds';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { labelPoint, roomAreaSqMm, wallFaces } from '../rooms';
import type { MarlaSqFt, Opening, PlanDoc, Point, Units, Wall } from '../types';
import { placeWallDimension, thicknessOf, wallExtensions, wallPolygon, wallsOf } from '../walls';
import { arcOf, directionAlong, isArc, paramAlong, pointAlong } from './arc';
import { MM_PER_UNIT } from './scale';
import { outlinePoints, plotSides, sideOutward } from './plot';
import { buildableArea, stairLayout } from './site';
import { formatArea, formatLength, formatMarla } from './units';
import { sectionLook } from './drawings/refs';
import { formatLevel } from './drawings/levels';
import type { SideDrawing } from './drawings/views';
import { groundOnPlan, type GroundOnPlan } from './terrain/groundView';

/** Layers, with AutoCAD colour numbers and line types, named the usual way (AIA style). */
const LAYERS = {
  'A-WALL': { color: 7, ltype: 'CONTINUOUS' },
  'A-DOOR': { color: 3, ltype: 'CONTINUOUS' },
  'A-GLAZ': { color: 4, ltype: 'CONTINUOUS' },
  'A-FURN': { color: 8, ltype: 'CONTINUOUS' },
  'A-FLOR-STRS': { color: 30, ltype: 'CONTINUOUS' },
  'A-AREA': { color: 6, ltype: 'CONTINUOUS' },
  'A-AREA-IDEN': { color: 6, ltype: 'CONTINUOUS' },
  'A-ANNO-DIMS': { color: 2, ltype: 'CONTINUOUS' },
  'S-COLS': { color: 1, ltype: 'CONTINUOUS' },
  'S-BEAM': { color: 1, ltype: 'DASHED' },
  'S-SLAB': { color: 1, ltype: 'DASHED' },
  'C-PROP': { color: 5, ltype: 'CONTINUOUS' },
  'C-PROP-SETB': { color: 5, ltype: 'DASHED' },
  'A-ANNO-LAYT': { color: 9, ltype: 'CONTINUOUS' },
  'A-FLOR-BLCK': { color: 8, ltype: 'CONTINUOUS' },
  'A-WALL-PROJ': { color: 7, ltype: 'DASHED' },
  'S-WALL-RETN': { color: 1, ltype: 'CONTINUOUS' },
  'A-ANNO-SECT': { color: 2, ltype: 'DASHED' },
  'A-SECT-CUT': { color: 7, ltype: 'CONTINUOUS' },
  'A-SECT-OUTL': { color: 7, ltype: 'CONTINUOUS' },
  'A-SECT-BYND': { color: 8, ltype: 'CONTINUOUS' },
  'A-SECT-GRND': { color: 32, ltype: 'CONTINUOUS' },
  'C-TOPO-SECT': { color: 32, ltype: 'DASHED' },
  'C-TOPO-MAJR': { color: 32, ltype: 'CONTINUOUS' },
  'C-TOPO-MINR': { color: 33, ltype: 'CONTINUOUS' },
  'C-TOPO-SPOT': { color: 2, ltype: 'CONTINUOUS' },
  'C-TOPO-GRAD': { color: 3, ltype: 'CONTINUOUS' },
  'C-CTXT-BLDG': { color: 8, ltype: 'CONTINUOUS' },
  'C-CTXT-ROAD': { color: 9, ltype: 'CONTINUOUS' },
  'A-ANNO-LEVL': { color: 2, ltype: 'CONTINUOUS' },
  'A-ANNO-TTLB': { color: 7, ltype: 'CONTINUOUS' },
} as const;
type Layer = keyof typeof LAYERS;

export interface DxfOptions {
  units: Units;
  marlaSqFt: MarlaSqFt;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
  /**
   * The ground's contour lines (worked out from the whole plan, on the ground floor only; null for
   * none). Worked out from the plan given when missing.
   */
  ground?: GroundOnPlan | null;
}

/** Text height on paper-like scale: 150 mm reads well at 1:100. */
const TEXT_MM = 150;

/** Keep only the part of a polygon on one side of a line (Sutherland–Hodgman, one edge). */
function clip(poly: Point[], keep: (p: Point) => number): Point[] {
  const out: Point[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const da = keep(a);
    const db = keep(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  });
  return out;
}

/** A wall's outline, cut into pieces where doors and windows go through it. */
export function wallPieces(wall: Wall, walls: Wall[], openings: Opening[]): Point[][] {
  const poly = wallPolygon(wall, walls);
  const len = wallLength(wall);
  if (!len || !openings.length) return [poly];
  const ux = (wall.x2 - wall.x1) / len;
  const uy = (wall.y2 - wall.y1) / len;
  const along = (p: Point) => (p.x - wall.x1) * ux + (p.y - wall.y1) * uy;
  const gaps = openings
    .map((o) => {
      const mid = wallParam(wall, o) * len;
      return [mid - o.width / 2, mid + o.width / 2] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const pieces: Point[][] = [];
  let from = -Infinity;
  for (const [s0, s1] of [...gaps, [Infinity, Infinity] as const]) {
    const lo = from;
    let piece = poly;
    if (lo > -Infinity) piece = clip(piece, (p) => along(p) - lo);
    if (s0 < Infinity) piece = clip(piece, (p) => s0 - along(p));
    if (piece.length >= 3) pieces.push(piece);
    from = Math.max(from, s1);
  }
  return pieces;
}

/** A closed outline whose sides may be arcs: bulges[i] bends the side from points[i] to the next (DXF's bulge). */
export interface BulgedOutline {
  points: Point[];
  bulges: number[];
}

/**
 * A curved wall's outline, cut where doors and windows go through it, as outlines whose faces are
 * true arcs (bulges on the drawing, where y points up).
 */
export function arcWallOutlines(wall: Wall, walls: Wall[], openings: Opening[]): BulgedOutline[] {
  const arc = arcOf(wall);
  if (!arc) return [];
  const size = Math.abs(arc.sweep);
  const half = thicknessOf(wall) / 2;
  const ext = wallExtensions(wall, walls);
  const gaps = openings
    .map((o) => {
      const t = Math.max(0, Math.min(1, paramAlong(wall, o)));
      const h = Math.asin(Math.min(1, o.width / 2 / arc.r)) / size;
      return [t - h, t + h] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let from = 0;
  for (const [a, b] of gaps) {
    if (a > from + 1e-9) spans.push([from, a]);
    from = Math.max(from, b);
  }
  if (from < 1 - 1e-9) spans.push([from, 1]);
  /** A point on a face (side 1 = side A), at a fraction along. */
  const on = (t: number, side: number, reach = 0): Point => {
    const p = pointAlong(wall, t);
    const d = directionAlong(wall, t);
    return { x: p.x - d.y * half * side + d.x * reach, y: p.y + d.x * half * side + d.y * reach };
  };
  // Along the arc from start to end bends clockwise on the drawing when the sweep is positive (y down on the plan).
  const bend = (t0: number, t1: number) => -Math.sign(arc.sweep) * Math.tan((size * (t1 - t0)) / 4);
  return spans.map(([t0, t1]) => {
    const pts: Point[] = [];
    const bulges: number[] = [];
    const add = (p: Point, b = 0) => {
      pts.push(p);
      bulges.push(b);
    };
    const s0 = t0 === 0 ? ext.start : 0;
    const s1 = t1 === 1 ? ext.end : 0;
    if (s0) add(on(t0, 1, -s0));
    add(on(t0, 1), bend(t0, t1));
    add(on(t1, 1));
    if (s1) {
      add(on(t1, 1, s1));
      add(on(t1, -1, s1));
    }
    add(on(t1, -1), -bend(t0, t1));
    add(on(t0, -1));
    if (s0) add(on(t0, -1, -s0));
    return { points: pts, bulges };
  });
}

/** Common symbols in plain text, which every CAD program shows. */
const ASCII: Record<string, string> = { '·': '-', '²': '2', '′': "'", '″': '"', '×': 'x', '–': '-', '—': '-' };

/** Text safe for any AutoCAD: one line, and anything beyond plain ASCII written as \\U+XXXX. */
export function dxfText(value: string): string {
  return [...value.replace(/[\r\n]+/g, ' ')]
    .map((ch) => ASCII[ch] ?? ch)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      return code < 128 ? ch : `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
    })
    .join('');
}

class Dxf {
  private lines: string[] = [];
  constructor(private readonly scale: number) {}

  private pair(code: number, value: string | number) {
    this.lines.push(String(code), typeof value === 'number' ? String(Math.round(value * 1e4) / 1e4) : value);
  }
  /** Plan units to drawing millimetres, with y turned to point up. */
  private xy(p: Point, codeX = 10) {
    this.pair(codeX, p.x * this.scale);
    this.pair(codeX + 10, -p.y * this.scale);
    this.pair(codeX + 20, 0);
  }

  line(layer: Layer, a: Point, b: Point) {
    this.pair(0, 'LINE');
    this.pair(8, layer);
    this.xy(a);
    this.xy(b, 11);
  }

  poly(layer: Layer, pts: Point[], closed = true, bulges?: number[]) {
    if (pts.length < 2) return;
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    this.pair(70, closed ? 1 : 0);
    pts.forEach((p, i) => {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.xy(p);
      if (bulges?.[i]) this.pair(42, bulges[i]);
    });
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
  }

  /** A filled four-sided area (R12's SOLID), corners in order round it. */
  solid(layer: Layer, [a, b, c, d]: Point[]) {
    this.pair(0, 'SOLID');
    this.pair(8, layer);
    this.xy(a);
    this.xy(b, 11);
    // SOLID takes its third and fourth corners crosswise.
    this.xy(d, 12);
    this.xy(c, 13);
  }

  /** An arc round c from plan angle a0 (radians, y down) through `sweep`. */
  arc(layer: Layer, c: Point, r: number, a0: number, sweep: number) {
    // On the drawing y points up, so angles turn the other way; DXF arcs run anticlockwise.
    const [from, to] = sweep > 0 ? [-(a0 + sweep), -a0] : [-a0, -(a0 + sweep)];
    const deg = (a: number) => ((((a * 180) / Math.PI) % 360) + 360) % 360;
    this.pair(0, 'ARC');
    this.pair(8, layer);
    this.xy(c);
    this.pair(40, r * this.scale);
    this.pair(50, deg(from));
    this.pair(51, deg(to));
  }

  circle(layer: Layer, c: Point, r: number) {
    this.pair(0, 'CIRCLE');
    this.pair(8, layer);
    this.xy(c);
    this.pair(40, r * this.scale);
  }

  /** Text centred on p, turned by `degrees` (anticlockwise on the drawing). */
  text(layer: Layer, p: Point, value: string, degrees = 0, heightMm = TEXT_MM) {
    this.pair(0, 'TEXT');
    this.pair(8, layer);
    this.xy(p);
    this.pair(40, heightMm);
    this.pair(1, dxfText(value));
    if (degrees) this.pair(50, degrees);
    this.pair(72, 1); // centred
    this.pair(73, 2); // middle
    this.xy(p, 11);
  }

  build(extents: { min: Point; max: Point }): string {
    const out: string[] = [];
    const p = (code: number, value: string | number) => out.push(String(code), String(value));
    p(0, 'SECTION');
    p(2, 'HEADER');
    p(9, '$ACADVER');
    p(1, 'AC1009');
    p(9, '$INSUNITS');
    p(70, 4); // millimetres
    p(9, '$MEASUREMENT');
    p(70, 1); // metric
    p(9, '$EXTMIN');
    p(10, extents.min.x);
    p(20, extents.min.y);
    p(30, 0);
    p(9, '$EXTMAX');
    p(10, extents.max.x);
    p(20, extents.max.y);
    p(30, 0);
    p(9, '$LTSCALE');
    p(40, 20);
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'TABLES');
    p(0, 'TABLE');
    p(2, 'LTYPE');
    p(70, 2);
    p(0, 'LTYPE');
    p(2, 'CONTINUOUS');
    p(70, 0);
    p(3, 'Solid line');
    p(72, 65);
    p(73, 0);
    p(40, 0);
    p(0, 'LTYPE');
    p(2, 'DASHED');
    p(70, 0);
    p(3, '__ __ __ __');
    p(72, 65);
    p(73, 2);
    p(40, 18.75);
    p(49, 12.5);
    p(49, -6.25);
    p(0, 'ENDTAB');
    p(0, 'TABLE');
    p(2, 'LAYER');
    p(70, Object.keys(LAYERS).length);
    for (const [name, { color, ltype }] of Object.entries(LAYERS)) {
      p(0, 'LAYER');
      p(2, name);
      p(70, 0);
      p(62, color);
      p(6, ltype);
    }
    p(0, 'ENDTAB');
    p(0, 'ENDSEC');
    p(0, 'SECTION');
    p(2, 'ENTITIES');
    // One at a time: spreading a big drawing's lines into push() overflows the call stack.
    for (const line of this.lines) out.push(line);
    p(0, 'ENDSEC');
    p(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
}

/** The floor plan as an AutoCAD DXF (R12, millimetres), one layer per kind of thing. */
export function planToDxf(doc: PlanDoc, opts: DxfOptions): string {
  const dxf = new Dxf(MM_PER_UNIT);
  const walls = wallsOf(doc.elements);
  // Shapes only drawn on a wall's face don't cut it (and aren't built), so they're left out.
  const openings = doc.elements.filter((el): el is Opening => (el.type === 'door' || el.type === 'window') && !el.flat);

  for (const el of doc.elements)
    if (el.type === 'plot') {
      dxf.poly('C-PROP', outlinePoints(el));
      dxf.poly('C-PROP-SETB', buildableArea(el));
      // ROAD beside each road side, 5' outside it.
      plotSides(el).forEach((side, i) => {
        if (side.kind !== 'road') return;
        const a = el.points[i];
        const b = el.points[(i + 1) % el.points.length];
        const o = sideOutward(el, i);
        const off = 1524 / MM_PER_UNIT;
        dxf.text('C-PROP', { x: (a.x + b.x) / 2 + o.x * off, y: (a.y + b.y) / 2 + o.y * off }, 'ROAD');
      });
    }

  for (const wall of walls) {
    // A basement's retaining walls are RCC: on the structure layers.
    const layer = wall.kind === 'retaining' ? 'S-WALL-RETN' : 'A-WALL';
    const own = openings.filter((o) => o.wallId === wall.id);
    // A curved wall's faces are true arcs.
    if (isArc(wall))
      for (const piece of arcWallOutlines(wall, walls, own)) dxf.poly(layer, piece.points, true, piece.bulges);
    else for (const piece of wallPieces(wall, walls, own)) dxf.poly(layer, piece);
  }

  // Niches and projections: their outline on the face they're on.
  for (const o of doc.elements) {
    if (o.type !== 'window' || !o.flat || !o.depthMm) continue;
    const host = walls.find((w) => w.id === o.wallId);
    const face = o.face ?? 1;
    const y = face * ((host ? thicknessOf(host) : 23) / 2);
    const y2 = y + (face * o.depthMm) / MM_PER_UNIT;
    const a = (o.angle * Math.PI) / 180;
    const at = (x: number, yy: number): Point => ({
      x: o.x + x * Math.cos(a) - yy * Math.sin(a),
      y: o.y + x * Math.sin(a) + yy * Math.cos(a),
    });
    const w = o.width / 2;
    dxf.poly('A-WALL-PROJ', [at(-w, y), at(-w, y2), at(w, y2), at(w, y)], false);
  }

  for (const o of openings) {
    const host = walls.find((w) => w.id === o.wallId);
    const t = (host ? thicknessOf(host) : 23) / 2;
    const a = (o.angle * Math.PI) / 180;
    const hx = o.flipHinge ? -1 : 1;
    const sy = o.flipSide ? -1 : 1;
    // Same frame as the plan symbol: along the wall, then across it.
    const at = (x: number, y: number): Point => ({
      x: o.x + x * hx * Math.cos(a) - y * sy * Math.sin(a),
      y: o.y + x * hx * Math.sin(a) + y * sy * Math.cos(a),
    });
    const w = o.width;
    const layer: Layer = o.type === 'door' ? 'A-DOOR' : 'A-GLAZ';
    for (const x of [-w / 2, w / 2]) dxf.line(layer, at(x, -t), at(x, t));
    // The same symbol as the plan: leaves, swings, sliding panels, frames and glass.
    for (const path of openingSymbol(o, t)) {
      const pts = path.points.map(([x, y]) => at(x, y));
      if (pts.length === 2 && !path.closed) dxf.line(layer, pts[0], pts[1]);
      else dxf.poly(layer, pts, !!path.closed);
    }
  }

  for (const el of doc.elements) {
    switch (el.type) {
      case 'furniture':
        if (!opts.showFurniture) break;
        dxf.poly('A-FURN', elementOutline(el));
        dxf.text(
          'A-FURN',
          { x: el.x, y: el.y },
          el.label ?? (el.kind ? FURNITURE_CATALOG[el.kind].name : 'Item'),
          -(el.rotation ?? 0),
          TEXT_MM * 0.6,
        );
        break;
      case 'column':
        if (el.shape === 'round') dxf.circle('S-COLS', { x: el.x, y: el.y }, el.w / 2);
        else dxf.poly('S-COLS', elementOutline(el));
        break;
      case 'beam': {
        const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1;
        const nx = (-(el.y2 - el.y1) / len) * (el.width / 2);
        const ny = ((el.x2 - el.x1) / len) * (el.width / 2);
        dxf.poly('S-BEAM', [
          { x: el.x1 + nx, y: el.y1 + ny },
          { x: el.x2 + nx, y: el.y2 + ny },
          { x: el.x2 - nx, y: el.y2 - ny },
          { x: el.x1 - nx, y: el.y1 - ny },
        ]);
        break;
      }
      case 'slab':
        dxf.poly('S-SLAB', el.points);
        for (const h of el.holes ?? []) dxf.poly('S-SLAB', h);
        break;
      case 'block':
        // Flat shapes are drafting aids, not built: only blocks with a height go out.
        if (el.heightMm > 0) dxf.poly('A-FLOR-BLCK', el.points);
        break;
      case 'line':
        dxf.line('A-ANNO-LAYT', { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
        break;
      case 'section': {
        // The cut line, with its letter past each end on the side it looks to.
        dxf.line('A-ANNO-SECT', { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 });
        const look = sectionLook(el);
        const off = 600 / MM_PER_UNIT;
        for (const p of [
          { x: el.x1, y: el.y1 },
          { x: el.x2, y: el.y2 },
        ]) {
          dxf.line('A-ANNO-SECT', p, { x: p.x + look.x * off, y: p.y + look.z * off });
          dxf.text('A-ANNO-SECT', { x: p.x + look.x * off * 1.6, y: p.y + look.z * off * 1.6 }, el.label, 0, 300);
        }
        break;
      }
      case 'stair': {
        const layout = stairLayout(el);
        const world = (p: Point) => fromFurnitureLocal(el, p);
        for (const part of layout.parts)
          dxf.poly(
            'A-FLOR-STRS',
            [
              { x: part.x, y: part.y },
              { x: part.x + part.w, y: part.y },
              { x: part.x + part.w, y: part.y + part.h },
              { x: part.x, y: part.y + part.h },
            ].map(world),
          );
        dxf.poly('A-FLOR-STRS', layout.path.map(world), false);
        const start = world(layout.path[0]);
        dxf.text('A-FLOR-STRS', start, el.shape === 'ramp' ? 'RAMP 1:12' : 'UP', 0, TEXT_MM * 0.6);
        break;
      }
    }
  }

  drawGround(dxf, doc, opts);

  for (const r of doc.rooms) {
    dxf.poly('A-AREA', r.points);
    if (!opts.showRoomLabels) continue;
    const c = labelPoint(r.points);
    const area = roomAreaSqMm(r);
    dxf.text('A-AREA-IDEN', { x: c.x, y: c.y - (TEXT_MM * 0.9) / MM_PER_UNIT }, r.name);
    dxf.text(
      'A-AREA-IDEN',
      { x: c.x, y: c.y + (TEXT_MM * 0.9) / MM_PER_UNIT },
      `${formatArea(area, opts.units)} · ${formatMarla(area, opts.marlaSqFt)}`,
      0,
      TEXT_MM * 0.7,
    );
  }

  if (opts.showDimensions) {
    const faces = wallFaces(walls);
    const bounds = planBounds(walls, []);
    const centre = bounds ? { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 } : { x: 0, y: 0 };
    const off = 600 / MM_PER_UNIT; // dimension line 600 mm off the wall face
    const tick = 100 / MM_PER_UNIT;
    for (const w of walls) {
      const { side, exterior } = placeWallDimension(w, faces, centre);
      if (!exterior) continue;
      const len = wallLength(w);
      if (!len) continue;
      const arc = arcOf(w);
      if (arc) {
        // Round the curve, its length along it at the middle.
        const d = thicknessOf(w) / 2 + off;
        const r = arc.r - Math.sign(w.bow ?? 0) * side * d;
        dxf.arc('A-ANNO-DIMS', { x: arc.cx, y: arc.cy }, r, arc.a0, arc.sweep);
        const u = directionAlong(w, 0.5);
        const m = pointAlong(w, 0.5);
        const n = { x: u.y * side, y: -u.x * side };
        let angle = (-Math.atan2(u.y, u.x) * 180) / Math.PI;
        if (angle > 90 || angle <= -90) angle += 180;
        const at = { x: m.x + n.x * (d + tick * 1.5), y: m.y + n.y * (d + tick * 1.5) };
        dxf.text('A-ANNO-DIMS', at, formatLength(len * MM_PER_UNIT, opts.units), angle, TEXT_MM * 0.8);
        continue;
      }
      const ux = (w.x2 - w.x1) / len;
      const uy = (w.y2 - w.y1) / len;
      const nx = uy * side;
      const ny = -ux * side;
      const d = thicknessOf(w) / 2 + off;
      const a = { x: w.x1 + nx * d, y: w.y1 + ny * d };
      const b = { x: w.x2 + nx * d, y: w.y2 + ny * d };
      dxf.line('A-ANNO-DIMS', a, b);
      for (const [p, q] of [
        [{ x: w.x1, y: w.y1 }, a],
        [{ x: w.x2, y: w.y2 }, b],
      ]) {
        dxf.line(
          'A-ANNO-DIMS',
          { x: p.x + nx * (thicknessOf(w) / 2 + tick), y: p.y + ny * (thicknessOf(w) / 2 + tick) },
          { x: q.x + nx * tick, y: q.y + ny * tick },
        );
        dxf.line(
          'A-ANNO-DIMS',
          { x: q.x - (ux + nx) * tick, y: q.y - (uy + ny) * tick },
          { x: q.x + (ux + nx) * tick, y: q.y + (uy + ny) * tick },
        );
      }
      // Text reads along the line, never upside down (angles on the drawing, where y is up).
      let angle = (-Math.atan2(uy, ux) * 180) / Math.PI;
      if (angle > 90 || angle <= -90) angle += 180;
      const mid = { x: (a.x + b.x) / 2 + nx * tick * 1.5, y: (a.y + b.y) / 2 + ny * tick * 1.5 };
      dxf.text('A-ANNO-DIMS', mid, formatLength(len * MM_PER_UNIT, opts.units), angle, TEXT_MM * 0.8);
    }
  }

  const b = planBounds(doc.elements, doc.masks) ?? { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  return dxf.build({
    min: { x: b.minX * MM_PER_UNIT, y: -b.maxY * MM_PER_UNIT },
    max: { x: b.maxX * MM_PER_UNIT, y: -b.minY * MM_PER_UNIT },
  });
}

/** A line's middle point along its length (for its label). */
function midPoint(pts: Point[]): Point {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let left = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (left <= lens[i] && lens[i] > 0) {
      const t = left / lens[i];
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    left -= lens[i];
  }
  return pts[0];
}

/**
 * The site: contour lines worked out from the ground (heavier ones labelled), spot levels and drawn
 * contours, levelled areas with their finished level, and the neighbouring buildings and roads.
 * These items belong to the ground floor, so they only come with its plan.
 */
function drawGround(dxf: Dxf, doc: PlanDoc, opts: DxfOptions) {
  const ground = opts.ground !== undefined ? opts.ground : groundOnPlan(doc, opts.units === 'metric');
  for (const c of ground?.contours ?? [])
    for (const line of c.lines) {
      if (line.length < 2) continue;
      const closed = line.length > 2 && line[0].x === line[line.length - 1].x && line[0].y === line[line.length - 1].y;
      const pts = closed ? line.slice(0, -1) : line;
      dxf.poly(c.major ? 'C-TOPO-MAJR' : 'C-TOPO-MINR', pts, closed);
      if (c.major) dxf.text('C-TOPO-MAJR', midPoint(line), formatLevel(c.zMm, opts.units), 0, TEXT_MM * 0.6);
    }
  const arm = 100 / MM_PER_UNIT;
  for (const el of doc.elements)
    switch (el.type) {
      case 'level':
        dxf.line('C-TOPO-SPOT', { x: el.x - arm, y: el.y - arm }, { x: el.x + arm, y: el.y + arm });
        dxf.line('C-TOPO-SPOT', { x: el.x - arm, y: el.y + arm }, { x: el.x + arm, y: el.y - arm });
        dxf.text(
          'C-TOPO-SPOT',
          { x: el.x + arm * 5, y: el.y - arm * 1.5 },
          `${el.approx ? '~' : ''}${formatLevel(el.zMm, opts.units)}`,
          0,
          TEXT_MM * 0.6,
        );
        break;
      case 'contour': {
        if (el.points.length < 2) break;
        const last = el.points[el.points.length - 1];
        const closed = el.points.length > 2 && last.x === el.points[0].x && last.y === el.points[0].y;
        dxf.poly('C-TOPO-SPOT', closed ? el.points.slice(0, -1) : el.points, closed);
        dxf.text('C-TOPO-SPOT', midPoint(el.points), formatLevel(el.zMm, opts.units), 0, TEXT_MM * 0.6);
        break;
      }
      case 'pad':
        if (el.points.length < 3) break;
        dxf.poly('C-TOPO-GRAD', el.points);
        dxf.text('C-TOPO-GRAD', labelPoint(el.points), `FGL ${formatLevel(el.zMm, opts.units)}`, 0, TEXT_MM * 0.8);
        break;
      case 'context':
        if (el.kind === 'building') {
          if (el.points.length >= 3) dxf.poly('C-CTXT-BLDG', el.points);
          if (el.name && el.points.length >= 3) dxf.text('C-CTXT-BLDG', labelPoint(el.points), el.name);
        } else if (el.points.length >= 2) {
          dxf.poly('C-CTXT-ROAD', el.points, false);
          if (el.name) dxf.text('C-CTXT-ROAD', midPoint(el.points), el.name);
        }
        break;
    }
}

/** Space between drawings laid side by side in a DXF, in millimetres. */
const DRAWING_GAP_MM = 4000;

/**
 * Sections and elevations as an AutoCAD DXF (R12, millimetres, true size), laid side by side:
 * what is cut filled solid, the lines beyond, outlines, the ground, the level marks and each
 * drawing's name underneath.
 */
export function sideDrawingsToDxf(drawings: SideDrawing[]): string {
  // Drawing millimetres, with y given downward as the writer expects of a plan.
  const dxf = new Dxf(1);
  const P = (x: number, v: number): Point => ({ x, y: -v });
  let x0 = 0;
  let minV = 0;
  let maxV = 0;
  for (const d of drawings) {
    const b = d.bounds ?? { minU: -1, maxU: 1, minV: 0, maxV: 1 };
    const left = Math.min(b.minU, d.ground.u0);
    const at = (u: number, v: number) => P(x0 + (u - left) * 1000, v * 1000);
    for (const poly of d.cut) {
      for (const ring of poly)
        dxf.poly(
          'A-SECT-CUT',
          ring.map(([u, v]) => at(u, v)),
        );
      // Fill rectangles (most of a cut); other shapes keep just their outline.
      if (poly.length === 1 && poly[0].length === 4)
        dxf.solid(
          'A-SECT-CUT',
          poly[0].map(([u, v]) => at(u, v)),
        );
    }
    for (const l of d.lines) dxf.line(l.heavy ? 'A-SECT-OUTL' : 'A-SECT-BYND', at(...l.a), at(...l.b));
    // The ground: the finished ground solid, and the natural ground dashed where it differs.
    if (d.profile?.finished.length)
      dxf.poly(
        'A-SECT-GRND',
        d.profile.finished.map(([u, v]) => at(u, v)),
        false,
      );
    else dxf.line('A-SECT-GRND', at(d.ground.u0, 0), at(d.ground.u1, 0));
    for (const run of d.profile?.natural ?? [])
      dxf.poly(
        'C-TOPO-SECT',
        run.map(([u, v]) => at(u, v)),
        false,
      );
    const right = Math.max(b.maxU, d.ground.u1);
    for (const m of d.levels) {
      const p = at(right + 0.4, m.v);
      dxf.line('A-ANNO-LEVL', at(right, m.v), at(right + 1.2, m.v));
      dxf.text('A-ANNO-LEVL', { x: p.x + 1800, y: p.y - 150 }, `${m.label} ${m.name}`, 0, 150);
    }
    const groundVs = d.profile ? [...d.profile.finished, ...d.profile.natural.flat()].map((p) => p[1]) : [];
    const bottom = Math.min(b.minV, 0, ...groundVs) - 0.9;
    dxf.text('A-ANNO-TTLB', at((left + right) / 2, bottom), d.title.toUpperCase(), 0, 300);
    minV = Math.min(minV, bottom);
    maxV = Math.max(maxV, b.maxV, ...groundVs);
    x0 += (right + 3.5 - left) * 1000 + DRAWING_GAP_MM;
  }
  return dxf.build({ min: { x: 0, y: minV * 1000 }, max: { x: Math.max(x0, 1000), y: maxV * 1000 } });
}
