import { elementOutline, fromFurnitureLocal, planBounds, wallLength, wallParam } from '../geometry';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { labelPoint, roomAreaSqMm, wallFaces } from '../rooms';
import type { MarlaSqFt, Opening, PlanDoc, Point, Units, Wall } from '../types';
import { placeWallDimension, thicknessOf, wallPolygon, wallsOf } from '../walls';
import { MM_PER_UNIT } from './scale';
import { buildableArea, stairLayout } from './site';
import { formatArea, formatLength, formatMarla } from './units';

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
} as const;
type Layer = keyof typeof LAYERS;

export interface DxfOptions {
  units: Units;
  marlaSqFt: MarlaSqFt;
  showDimensions: boolean;
  showFurniture: boolean;
  showRoomLabels: boolean;
}

/** Text height on paper-like scale: 150 mm reads well at 1:100. */
const TEXT_MM = 150;
const ARC_STEPS = 16;

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

  poly(layer: Layer, pts: Point[], closed = true) {
    if (pts.length < 2) return;
    this.pair(0, 'POLYLINE');
    this.pair(8, layer);
    this.pair(66, 1);
    this.pair(10, 0);
    this.pair(20, 0);
    this.pair(30, 0);
    this.pair(70, closed ? 1 : 0);
    for (const p of pts) {
      this.pair(0, 'VERTEX');
      this.pair(8, layer);
      this.xy(p);
    }
    this.pair(0, 'SEQEND');
    this.pair(8, layer);
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
    out.push(...this.lines);
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
      dxf.poly('C-PROP', el.points);
      dxf.poly('C-PROP-SETB', buildableArea(el));
    }

  for (const wall of walls)
    for (const piece of wallPieces(
      wall,
      walls,
      openings.filter((o) => o.wallId === wall.id),
    ))
      dxf.poly('A-WALL', piece);

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
    if (o.type === 'window' && o.open) continue;
    if (o.type === 'window') {
      dxf.line('A-GLAZ', at(-w / 2, -t / 3), at(w / 2, -t / 3));
      dxf.line('A-GLAZ', at(-w / 2, t / 3), at(w / 2, t / 3));
      continue;
    }
    /** A swing arc about a hinge, from the open leaf round to the closed position. */
    const swing = (hingeX: number, r: number, dir: 1 | -1) => {
      const pts: Point[] = [];
      for (let i = 0; i <= ARC_STEPS; i++) {
        const th = (i / ARC_STEPS) * (Math.PI / 2);
        pts.push(at(hingeX + dir * r * Math.sin(th), -r * Math.cos(th)));
      }
      dxf.line('A-DOOR', at(hingeX, 0), at(hingeX, -r));
      dxf.poly('A-DOOR', pts, false);
    };
    if (o.gate) {
      swing(-w / 2, w / 2, 1);
      swing(w / 2, w / 2, -1);
    } else swing(-w / 2, w, 1);
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
