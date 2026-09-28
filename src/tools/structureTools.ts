import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { formatLength, MM_PER_FOOT } from '../lib/units';
import { plotRect, stairLayout } from '../lib/site';
import { detectRoom } from '../rooms';
import { levelWallMm, slabMm } from '../lib/levels';
import { riseIn12 } from '../lib/roof/roof';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Point, Tool } from '../types';
import {
  GROUND_TOOLS,
  groundHint,
  groundHover,
  groundMeasure,
  groundPress,
  groundReadout,
  groundRelease,
} from './groundTools';

/** The bits of a zustand store these tools need. */
interface Store {
  getState: () => PlannerState;
}

export const STRUCTURE_TOOLS: Tool[] = ['column', 'beam', 'slab', 'roof', 'plot', 'stairs', 'section', ...GROUND_TOOLS];

/** Default wall half-thickness (4½"), how far a slab reaches past a room's inner faces to the wall centres. */
const SLAB_OVERHANG = (4.5 * 25.4) / MM_PER_UNIT;

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

function area(pts: Point[]): number {
  return (
    Math.abs(
      pts.reduce((sum, p, i) => sum + p.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * p.y, 0),
    ) / 2
  );
}

/** Shift every edge of a polygon sideways by d (one side or the other) and re-join the corners. */
function shiftEdges(pts: Point[], d: number): Point[] {
  const n = pts.length;
  const normal = (a: Point, b: Point) => {
    const e = sub(b, a);
    const l = Math.hypot(e.x, e.y) || 1;
    return { x: (e.y / l) * d, y: (-e.x / l) * d };
  };
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    // Intersect the two shifted edge lines.
    const a1 = { x: prev.x + n1.x, y: prev.y + n1.y };
    const r = sub(p, prev);
    const a2 = { x: p.x + n2.x, y: p.y + n2.y };
    const q = sub(next, p);
    const denom = r.x * q.y - r.y * q.x;
    if (Math.abs(denom) < 1e-9) return a2;
    const t = ((a2.x - a1.x) * q.y - (a2.y - a1.y) * q.x) / denom;
    return { x: a1.x + r.x * t, y: a1.y + r.y * t };
  });
}

/** Grow a simple polygon outward by d, with mitred corners. */
export function offsetPolygon(pts: Point[], d: number): Point[] {
  const out = shiftEdges(pts, d);
  return area(out) >= area(pts) ? out : shiftEdges(pts, -d);
}

const rectPoints = (a: Point, b: Point): Point[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];

export function structurePress(store: Store, inf: Inference) {
  if (GROUND_TOOLS.includes(store.getState().tool)) return groundPress(store, inf);
  const s = store.getState();
  const d = s.draft;
  const p = inf.point;
  switch (s.tool) {
    case 'column':
      s.addColumn(p);
      return;
    case 'beam':
      if (d?.type !== 'beam') return s.setDraft({ type: 'beam', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      s.addBeam({ x: d.x1, y: d.y1 }, p);
      // Beams chain like walls, until Esc.
      return s.setDraft({ type: 'beam', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    case 'slab':
      if (d?.type !== 'slab') return s.setDraft({ type: 'slab', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (Math.abs(p.x - d.x1) > 1 && Math.abs(p.y - d.y1) > 1) s.addSlab(rectPoints({ x: d.x1, y: d.y1 }, p));
      return s.setDraft(null);
    case 'plot': {
      // A preset size: one click places the plot, this corner at the back left.
      const size = s.site.plotSize;
      if (size && d?.type !== 'plot' && d?.type !== 'plotPoly') {
        const u = (feet: number) => (feet * MM_PER_FOOT) / MM_PER_UNIT;
        s.addPlot(plotRect(p, { x: p.x + u(size.w), y: p.y + u(size.d) }));
        return;
      }
      if (s.site.plotShape === 'any' || d?.type === 'plotPoly') return plotCorner(store, p, true);
      if (d?.type !== 'plot') return s.setDraft({ type: 'plot', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (Math.abs(p.x - d.x1) > 1 && Math.abs(p.y - d.y1) > 1) s.addPlot(plotRect({ x: d.x1, y: d.y1 }, p));
      return s.setDraft(null);
    }
    case 'stairs':
      s.addStair(p);
      return;
    case 'roof':
      return roofCorner(store, p, true);
    case 'section':
      if (d?.type !== 'section')
        return s.setDraft({ type: 'section', x1: p.x, y1: p.y, x2: p.x, y2: p.y, placed: false, flip: false });
      if (!d.placed) {
        if (Math.hypot(p.x - d.x1, p.y - d.y1) <= 1) return;
        return s.setDraft({ ...d, x2: p.x, y2: p.y, placed: true });
      }
      s.addSection({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }, d.flip);
      return s.setDraft(null);
  }
}

/** Whether a point is on the left of a section line going from its start to its end (it then looks left). */
function onLeft(d: { x1: number; y1: number; x2: number; y2: number }, p: Point): boolean {
  // With y pointing down the page, (-dy, dx) points to the right-hand side.
  return -(d.y2 - d.y1) * (p.x - d.x1) + (d.x2 - d.x1) * (p.y - d.y1) < 0;
}

export function structureHover(store: Store, inf: Inference) {
  if (GROUND_TOOLS.includes(store.getState().tool)) return groundHover(store, inf);
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'beam' || d?.type === 'slab' || d?.type === 'plot')
    s.setDraft({ ...d, x2: inf.point.x, y2: inf.point.y });
  if (d?.type === 'plotPoly' || d?.type === 'roof') s.setDraft({ ...d, cursor: inf.point });
  if (d?.type === 'section') {
    if (!d.placed) s.setDraft({ ...d, x2: inf.point.x, y2: inf.point.y });
    else if (onLeft(d, inf.point) !== d.flip) s.setDraft({ ...d, flip: !d.flip });
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Whether a side from the last corner to p would cross one of the sides drawn so far. */
function sideCrosses(points: Point[], p: Point): boolean {
  const last = points[points.length - 1];
  for (let i = 0; i + 2 < points.length; i++) {
    // Sides only touching end to end (the new side closing on the first corner) don't count.
    if (segmentsCross(points[i], points[i + 1], last, p)) return true;
  }
  return false;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cr = (o: Point, p: Point, q: Point) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const d1 = cr(a, b, c);
  const d2 = cr(a, b, d);
  const d3 = cr(c, d, a);
  const d4 = cr(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * A corner of a plot drawn corner by corner. Clicking the first corner again (with three or more
 * placed) finishes it; `snapClose` lets a click near the first corner count.
 */
function plotCorner(store: Store, p: Point, snapClose: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'plotPoly') {
    s.setWarning(null);
    return s.setDraft({ type: 'plotPoly', points: [p], cursor: p });
  }
  const first = d.points[0];
  const tol = snapClose ? 10 * s.reach() * s.pxUnits() : 1;
  if (d.points.length >= 3 && dist(p, first) <= tol) {
    finishPlotPoly(store);
    return;
  }
  if (dist(p, d.points[d.points.length - 1]) < 1) return;
  if (sideCrosses(d.points, p)) {
    s.setWarning('That side would cross another side of the plot: put the corner somewhere else.');
    return;
  }
  s.setWarning(null);
  s.setDraft({ ...d, points: [...d.points, p], cursor: p });
}

/** Enter (or clicking the first corner): close the plot being drawn corner by corner. */
export function finishPlotPoly(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'plotPoly') return false;
  if (d.points.length < 3) {
    s.setWarning('A plot needs at least three corners.');
    return true;
  }
  // The side drawn first is along the road.
  if (s.addPlot(d.points, 0)) s.setDraft(null);
  return true;
}

/**
 * A corner of a roof drawn round the walls. Clicking the first corner again (with three or more placed)
 * finishes it; `snapClose` lets a click near the first corner count.
 */
function roofCorner(store: Store, p: Point, snapClose: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'roof') {
    s.setWarning(null);
    return s.setDraft({ type: 'roof', points: [p], cursor: p });
  }
  const tol = snapClose ? 10 * s.reach() * s.pxUnits() : 1;
  if (d.points.length >= 3 && dist(p, d.points[0]) <= tol) {
    finishRoof(store);
    return;
  }
  if (dist(p, d.points[d.points.length - 1]) < 1) return;
  if (sideCrosses(d.points, p)) {
    s.setWarning('That side would cross another side of the roof: put the corner somewhere else.');
    return;
  }
  s.setWarning(null);
  s.setDraft({ ...d, points: [...d.points, p], cursor: p });
}

/** Enter (or clicking the first corner): put the roof on over the outline drawn. */
export function finishRoof(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'roof') return false;
  if (d.points.length < 3) {
    s.setWarning('A roof needs at least three corners.');
    return true;
  }
  if (s.addRoof(d.points)) s.setDraft(null);
  return true;
}

/**
 * A slab drawn by dragging is a rectangle. A click (no drag) inside walls makes a slab over that
 * area, reaching to the wall centres; a click elsewhere starts a rectangle for a second click.
 */
export function structureRelease(store: Store, dragged: boolean) {
  if (GROUND_TOOLS.includes(store.getState().tool)) return groundRelease(store, dragged);
  const s = store.getState();
  const d = s.draft;
  // Drawing corner by corner, a drag from the first corner still makes a rectangle.
  if (s.tool === 'plot' && d?.type === 'plotPoly' && dragged && d.points.length === 1) {
    const [a] = d.points;
    if (Math.abs(d.cursor.x - a.x) > 1 && Math.abs(d.cursor.y - a.y) > 1) s.addPlot(plotRect(a, d.cursor));
    return s.setDraft(null);
  }
  // A roof dragged out from its first corner is a rectangle.
  if (s.tool === 'roof' && d?.type === 'roof' && dragged && d.points.length === 1) {
    const [a] = d.points;
    if (Math.abs(d.cursor.x - a.x) > 1 && Math.abs(d.cursor.y - a.y) > 1 && s.addRoof(rectPoints(a, d.cursor)))
      s.setDraft(null);
    return;
  }
  // A section line dragged out: its ends are down, and the next click picks the side it looks to.
  if (s.tool === 'section' && d?.type === 'section' && !d.placed && dragged) {
    if (Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 1) s.setDraft({ ...d, placed: true });
    return;
  }
  if (s.tool === 'plot' && d?.type === 'plot' && dragged) {
    if (Math.abs(d.x2 - d.x1) > 1 && Math.abs(d.y2 - d.y1) > 1)
      s.addPlot(plotRect({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }));
    return s.setDraft(null);
  }
  if (s.tool !== 'slab' || d?.type !== 'slab' || (d.x1 !== d.x2 && !dragged)) return;
  if (dragged) {
    s.addSlab(rectPoints({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 }));
    return s.setDraft(null);
  }
  const area = detectRoom(s.levelElements(), { x: d.x1, y: d.y1 });
  if (area) {
    s.addSlab(offsetPolygon(area, SLAB_OVERHANG));
    s.setDraft(null);
  }
}

export function structureMeasure(store: Store, m: Measure): string | null {
  if (GROUND_TOOLS.includes(store.getState().tool)) return groundMeasure(store, m);
  const s = store.getState();
  const d = s.draft;
  const units = (mm: number) => mm / MM_PER_UNIT;
  if (s.tool === 'beam') {
    if (d?.type !== 'beam' || m.kind !== 'length') return 'Click where the beam starts, then type its length.';
    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const L = Math.hypot(dx, dy) || 1;
    const k = units(m.mm) / L;
    const end = L > 1e-6 ? { x: d.x1 + dx * k, y: d.y1 + dy * k } : { x: d.x1 + units(m.mm), y: d.y1 };
    s.addBeam({ x: d.x1, y: d.y1 }, end);
    s.setDraft({ type: 'beam', x1: end.x, y1: end.y, x2: end.x, y2: end.y });
    return null;
  }
  if (s.tool === 'slab') {
    if (d?.type !== 'slab') return 'Click the first corner, then type width and depth.';
    const [a, b] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
    if (!a || !b) return `Type width and depth, e.g. 20',30'.`;
    const sx = d.x2 < d.x1 ? -1 : 1;
    const sy = d.y2 < d.y1 ? -1 : 1;
    s.addSlab(rectPoints({ x: d.x1, y: d.y1 }, { x: d.x1 + sx * units(a), y: d.y1 + sy * units(b) }));
    s.setDraft(null);
    return null;
  }
  if (s.tool === 'roof') {
    if (d?.type !== 'roof') return 'Click the first corner round the walls, then type the length of each side.';
    const next = typedCorner(s, d, m);
    if (typeof next === 'string') return next;
    const before = s.draft;
    roofCorner(store, next, false);
    if (store.getState().draft === before) return store.getState().warnings[0] ?? 'That corner can’t be used.';
    return null;
  }
  if (s.tool === 'plot' && (d?.type === 'plotPoly' || (s.site.plotShape === 'any' && !s.site.plotSize))) {
    if (d?.type !== 'plotPoly') return 'Click the first corner of the plot, then type the length of each side.';
    const last = d.points[d.points.length - 1];
    let next: Point | null = null;
    if (m.kind === 'vector') next = { x: last.x + units(m.dx), y: last.y - units(m.dy) };
    else if (m.kind === 'length') {
      const lock = s.axisLock === 'x' ? { x: 1, y: 0 } : s.axisLock === 'y' ? { x: 0, y: 1 } : s.shiftLock;
      const v = lock ?? { x: d.cursor.x - last.x, y: d.cursor.y - last.y };
      const l = Math.hypot(v.x, v.y);
      if (l < 1e-9) return 'Point the way the side goes first, then type its length.';
      next = { x: last.x + (v.x / l) * units(m.mm), y: last.y + (v.y / l) * units(m.mm) };
    }
    if (!next) return `Type the length of the side, e.g. 30', or @x,y.`;
    const before = s.draft;
    plotCorner(store, next, false);
    const after = store.getState().draft;
    // A corner that would make the sides cross isn't placed: say why.
    if (after === before) return store.getState().warnings[0] ?? 'That corner can’t be used.';
    return null;
  }
  if (s.tool === 'plot') {
    if (d?.type !== 'plot') return `Click one corner of the plot, then type its width and depth, e.g. 25',45'.`;
    const [a, b] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
    if (!a || !b) return `Type width and depth, e.g. 25',45'.`;
    const sx = d.x2 < d.x1 ? -1 : 1;
    const sy = d.y2 < d.y1 ? -1 : 1;
    s.addPlot(plotRect({ x: d.x1, y: d.y1 }, { x: d.x1 + sx * units(a), y: d.y1 + sy * units(b) }));
    s.setDraft(null);
    return null;
  }
  if (s.tool === 'stairs') return 'Stairs are placed by clicking; set their shape and width on the right.';
  if (s.tool === 'section') return 'Click the two ends of the section line, then click the side it looks to.';
  return 'Columns are placed by clicking; set their size on the right.';
}

/** The next corner from a typed side: a length the way the pointer (or a lock) goes, or @x,y. An error otherwise. */
function typedCorner(s: PlannerState, d: { points: Point[]; cursor: Point }, m: Measure): Point | string {
  const units = (mm: number) => mm / MM_PER_UNIT;
  const last = d.points[d.points.length - 1];
  if (m.kind === 'vector') return { x: last.x + units(m.dx), y: last.y - units(m.dy) };
  if (m.kind !== 'length') return `Type the length of the side, e.g. 30', or @x,y.`;
  const lock = s.axisLock === 'x' ? { x: 1, y: 0 } : s.axisLock === 'y' ? { x: 0, y: 1 } : s.shiftLock;
  const v = lock ?? { x: d.cursor.x - last.x, y: d.cursor.y - last.y };
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return 'Point the way the side goes first, then type its length.';
  return { x: last.x + (v.x / l) * units(m.mm), y: last.y + (v.y / l) * units(m.mm) };
}

export function structureReadout(s: PlannerState): { label: string; value: string } {
  if (GROUND_TOOLS.includes(s.tool)) return groundReadout(s);
  const d = s.draft;
  const len = (u: number) => formatLength(u * MM_PER_UNIT, s.units);
  if (s.tool === 'beam')
    return { label: 'Length', value: d?.type === 'beam' ? len(Math.hypot(d.x2 - d.x1, d.y2 - d.y1)) : '' };
  if (s.tool === 'section')
    return { label: 'Length', value: d?.type === 'section' ? len(Math.hypot(d.x2 - d.x1, d.y2 - d.y1)) : '' };
  if (s.tool === 'stairs') {
    const { site } = s;
    if (site.stairShape === 'ramp') return { label: 'Ramp', value: `1 in 12` };
    const riseMm =
      site.climb === 'plinth' ? s.doc.plinthMm : levelWallMm(s.doc, s.activeLevel, s.wallHeightMm) + slabMm(s.doc);
    const l = stairLayout({
      shape: site.stairShape,
      width: site.stairWidthMm / MM_PER_UNIT,
      riseMm,
      treadMm: site.treadMm,
    });
    return { label: 'Risers', value: `${l.risers} × ${formatLength(l.riserMm, s.units)}` };
  }
  if (s.tool === 'roof' && d?.type !== 'roof') {
    const pitch = s.site.roofPitchDeg;
    return {
      label: 'Pitch',
      value:
        s.site.roofShape === 'flat' ? 'Flat' : `${Math.round(pitch * 10) / 10}° (${riseIn12(pitch).toFixed(1)} in 12)`,
    };
  }
  if (d?.type === 'plotPoly' || d?.type === 'roof') {
    const last = d.points[d.points.length - 1];
    return { label: 'Length', value: len(Math.hypot(d.cursor.x - last.x, d.cursor.y - last.y)) };
  }
  if (s.tool === 'slab' || s.tool === 'plot')
    return {
      label: 'Size',
      value:
        d?.type === 'slab' || d?.type === 'plot' ? `${len(Math.abs(d.x2 - d.x1))}, ${len(Math.abs(d.y2 - d.y1))}` : '',
    };
  return { label: '', value: '' };
}

export function structureHint(s: PlannerState): string {
  if (GROUND_TOOLS.includes(s.tool)) return groundHint(s);
  const d = s.draft;
  switch (s.tool) {
    case 'column':
      return 'Click to place a column. It snaps to wall corners and midpoints; set its size on the right.';
    case 'beam':
      return d?.type === 'beam'
        ? 'Click the other end (or type a length). Beams chain until Esc.'
        : 'Click where the beam starts, e.g. on a column. Beams show dashed: they are above the floor plan cut.';
    case 'slab':
      return d?.type === 'slab'
        ? `Click the opposite corner, or type width, depth (e.g. 20',30').`
        : 'Click inside walls to cover that area with a slab, or drag a rectangle.';
    case 'plot':
      if (d?.type === 'plotPoly')
        return d.points.length < 3
          ? 'Click the next corner, or type the side’s length. The first side you draw is along the road.'
          : 'Click the next corner, or click the first corner (or press Enter) to finish. Ctrl+Z takes back a corner.';
      if (s.site.plotShape === 'any' && !s.site.plotSize)
        return 'Click the plot’s corners one by one, starting with the two ends of its road side. A drag makes a rectangle.';
      return d?.type === 'plot'
        ? `Click the opposite corner, or type width, depth (e.g. 25',45'). The bottom edge faces the road.`
        : s.site.plotSize
          ? `Click where the plot's back-left corner goes (${s.site.plotSize.w}' × ${s.site.plotSize.d}'; the road is along the bottom).`
          : 'Click or drag the plot, or pick a size on the right. Setbacks and a boundary wall are added for you.';
    case 'roof':
      if (d?.type === 'roof')
        return d.points.length < 3
          ? 'Click the next corner round the walls, or type the side’s length.'
          : 'Click the next corner, or click the first corner (or press Enter) to put the roof on. Ctrl+Z takes back a corner.';
      return 'Click the corners round the outside of the walls (a drag makes a rectangle); the eaves reach past them by the overhang. Or use Roof over the house on the right.';
    case 'stairs':
      return 'Click to place a stair. Pick straight, L, U or a ramp on the right; risers are worked out for you.';
    case 'section':
      if (d?.type === 'section' && d.placed)
        return 'Click on the side the section looks to (the arrows show which way).';
      return d?.type === 'section'
        ? 'Click the other end of the section line, across the building.'
        : 'Click one end of a section line, then the other, across the building. Its drawing is in the Drawings view.';
    default:
      return '';
  }
}
