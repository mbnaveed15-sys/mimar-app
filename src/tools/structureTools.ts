import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { formatLength } from '../lib/units';
import { plotRect, stairLayout } from '../lib/site';
import { detectRoom } from '../rooms';
import { SLAB_MM } from '../three/model';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Point, Tool } from '../types';

/** The bits of a zustand store these tools need. */
interface Store {
  getState: () => PlannerState;
}

export const STRUCTURE_TOOLS: Tool[] = ['column', 'beam', 'slab', 'plot', 'stairs'];

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
    case 'plot':
      if (d?.type !== 'plot') return s.setDraft({ type: 'plot', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      if (Math.abs(p.x - d.x1) > 1 && Math.abs(p.y - d.y1) > 1) s.addPlot(plotRect({ x: d.x1, y: d.y1 }, p));
      return s.setDraft(null);
    case 'stairs':
      s.addStair(p);
      return;
  }
}

export function structureHover(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'beam' || d?.type === 'slab' || d?.type === 'plot')
    s.setDraft({ ...d, x2: inf.point.x, y2: inf.point.y });
}

/**
 * A slab drawn by dragging is a rectangle. A click (no drag) inside walls makes a slab over that
 * area, reaching to the wall centres; a click elsewhere starts a rectangle for a second click.
 */
export function structureRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
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
  return 'Columns are placed by clicking; set their size on the right.';
}

export function structureReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  const len = (u: number) => formatLength(u * MM_PER_UNIT, s.units);
  if (s.tool === 'beam')
    return { label: 'Length', value: d?.type === 'beam' ? len(Math.hypot(d.x2 - d.x1, d.y2 - d.y1)) : '' };
  if (s.tool === 'stairs') {
    const { site } = s;
    if (site.stairShape === 'ramp') return { label: 'Ramp', value: `1 in 12` };
    const riseMm = site.climb === 'plinth' ? s.doc.plinthMm : s.wallHeightMm + SLAB_MM;
    const l = stairLayout({
      shape: site.stairShape,
      width: site.stairWidthMm / MM_PER_UNIT,
      riseMm,
      treadMm: site.treadMm,
    });
    return { label: 'Risers', value: `${l.risers} × ${formatLength(l.riserMm, s.units)}` };
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
      return d?.type === 'plot'
        ? `Click the opposite corner, or type width, depth (e.g. 25',45'). The bottom edge faces the road.`
        : 'Click or drag the plot. Setbacks and a boundary wall are added from the options on the right.';
    case 'stairs':
      return 'Click to place a stair. Pick straight, L, U or a ramp on the right; risers are worked out for you.';
    default:
      return '';
  }
}
