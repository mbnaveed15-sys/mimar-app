import { findElementNear } from '../geometry';
import { isArc } from '../lib/arc';
import { angleOf, dimLine, linearAngle, normDeg } from '../lib/dimLine';
import { radiusDimension, tieFor } from '../lib/dimensions';
import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type DimMode, type PlannerState } from '../store/plannerStore';
import type { Dimension, Point, Tool } from '../types';
import type { Store } from './controller';

export const DIM_TOOLS: Tool[] = ['dimension'];

type DimDraft = Extract<PlannerState['draft'], { type: 'dimension' }>;

const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;

/** The dimension the draft would place, with its line through `at`, or null while points are missing. */
export function draftDimension(mode: DimMode, d: DimDraft, at: Point): Omit<Dimension, 'id'> | null {
  const [p1, p2] = d.points;
  if (d.chain && p1) {
    // A chain carries on along the first dimension's direction, on its line.
    if (same(p1, at)) return null;
    return {
      type: 'dimension',
      x1: p1.x,
      y1: p1.y,
      x2: at.x,
      y2: at.y,
      lx: d.chain.l.x,
      ly: d.chain.l.y,
      angle: d.chain.angle,
      ...(d.ties[0] && { tie1: d.ties[0] }),
    };
  }
  if (!p1 || !p2) return null;
  const angle = mode === 'linear' ? linearAngle(p1, p2, at) : undefined;
  return {
    type: 'dimension',
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    lx: at.x,
    ly: at.y,
    ...(angle !== undefined && { angle }),
    ...(d.ties[0] && { tie1: d.ties[0] }),
    ...(d.ties[1] && { tie2: d.ties[1] }),
  };
}

/** What a dimension end at p follows: the item under it on the floor being drawn. */
const tieAt = (s: PlannerState, p: Point) => tieFor(s.visibleElements(), p);

/** Where the draft is measuring from (for snapping and the axis locks). */
export function dimAnchor(d: DimDraft): Point | null {
  return d.points.length === 1 ? d.points[0] : null;
}

export function dimHover(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'dimension') s.setDraft({ ...d, cursor: inf.point });
}

/** Add the dimension the draft shows with its line through `at`; a chain carries on from its end. */
function place(store: Store, d: DimDraft, at: Point, next?: Point) {
  const s = store.getState();
  const dim = draftDimension(s.site.dimMode, d, at);
  if (!dim) return;
  if (dimLine(dim).value * MM_PER_UNIT < 1) {
    s.setWarning('The two points are level along this direction: there is nothing to measure.');
    return;
  }
  // The last point of a chain may follow an item too.
  const end = d.chain ? { x: dim.x2, y: dim.y2 } : null;
  const tie2 = end ? tieAt(s, end) : dim.tie2;
  s.addDimension({ ...dim, ...(tie2 && { tie2 }) });
  s.setWarning(null);
  s.setAxisLock(null);
  if (!s.site.dimChain && !d.chain) {
    s.setDraft(null);
    return;
  }
  const last = { x: dim.x2, y: dim.y2 };
  const angle = dim.angle ?? normDeg(angleOf({ x: dim.x1, y: dim.y1 }, last));
  s.setDraft({
    type: 'dimension',
    points: [last],
    ties: [tie2],
    cursor: next ?? last,
    chain: d.chain ?? { angle, l: { x: dim.lx, y: dim.ly } },
  });
}

export function dimPress(store: Store, inf: Inference, raw: Point) {
  const s = store.getState();
  const d = s.draft;
  const p = inf.point;
  if (s.site.dimMode === 'radius') {
    // One click on a curved wall or line shows its radius there.
    const curves = s.pickableElements().filter((el) => (el.type === 'wall' || el.type === 'line') && isArc(el));
    const hit = findElementNear(curves, raw, s.hitTolerance());
    const dim = hit && radiusDimension(hit, raw);
    if (!dim) {
      s.setWarning('Click a curved wall or curved layout line to show its radius.');
      return;
    }
    s.addDimension(dim);
    s.setWarning(null);
    return;
  }
  if (d?.type !== 'dimension') {
    s.setDraft({ type: 'dimension', points: [p], ties: [tieAt(s, p)], cursor: p });
    return;
  }
  if (d.chain) {
    place(store, d, p);
    return;
  }
  if (d.points.length === 1) {
    if (same(d.points[0], p)) return;
    s.setAxisLock(null);
    s.setDraft({ ...d, points: [d.points[0], p], ties: [d.ties[0], tieAt(s, p)], cursor: p });
    return;
  }
  place(store, d, p);
}

/** A press dragged from the first point to the second sets both; a click goes on point by point. */
export function dimRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (!dragged || d?.type !== 'dimension' || d.chain || d.points.length !== 1) return;
  if (same(d.points[0], d.cursor)) return;
  s.setDraft({ ...d, points: [d.points[0], d.cursor], ties: [d.ties[0], tieAt(s, d.cursor)] });
}

/**
 * A typed length: with one point down, the second point that far along the pointer's direction; with
 * both down, how far off them the dimension line goes (on the pointer's side); in a chain, the next
 * point that far along the chain.
 */
export function dimMeasure(store: Store, m: Measure, dir: Point | null): string | null {
  const s = store.getState();
  const d = s.draft;
  if (s.site.dimMode === 'radius') return 'A radius dimension takes one click on a curved wall or line.';
  if (d?.type !== 'dimension') return 'Click the first point to measure from, then type the distance.';
  if (m.kind !== 'length' && m.kind !== 'vector') return "Type a length, e.g. 12'6 or 3.8m.";
  const units = (mm: number) => mm / MM_PER_UNIT;
  const from = d.points[d.points.length - 1];
  if (d.chain || d.points.length === 1) {
    let to: Point;
    if (m.kind === 'vector') to = { x: from.x + units(m.dx), y: from.y - units(m.dy) };
    else {
      let u = dir && Math.hypot(dir.x, dir.y) > 1e-9 ? dir : { x: 1, y: 0 };
      if (d.chain) {
        // Along the chain, the way the pointer is.
        const a = (d.chain.angle * Math.PI) / 180;
        const along = { x: Math.cos(a), y: Math.sin(a) };
        const sign = (d.cursor.x - from.x) * along.x + (d.cursor.y - from.y) * along.y < 0 ? -1 : 1;
        u = { x: along.x * sign, y: along.y * sign };
      }
      const len = Math.hypot(u.x, u.y);
      to = { x: from.x + (u.x / len) * units(m.mm), y: from.y + (u.y / len) * units(m.mm) };
    }
    if (d.chain) place(store, d, to);
    else s.setDraft({ ...d, points: [d.points[0], to], ties: [d.ties[0], tieAt(s, to)], cursor: to });
    return null;
  }
  if (m.kind !== 'length') return 'Type how far from the points the dimension line goes.';
  // Both points down: the line goes that far off them, on the side the pointer is.
  const shown = draftDimension(s.site.dimMode, d, d.cursor);
  if (!shown) return null;
  const { n, p1 } = dimLine(shown);
  const side = (d.cursor.x - p1.x) * n.x + (d.cursor.y - p1.y) * n.y < 0 ? -1 : 1;
  const off = units(m.mm) * side;
  // Measured from the further-out of the two points, so the line clears both.
  const base = [d.points[0], d.points[1]].reduce((best, q) =>
    ((q.x - best.x) * n.x + (q.y - best.y) * n.y) * side > 0 ? q : best,
  );
  place(store, d, { x: base.x + n.x * off, y: base.y + n.y * off });
  return null;
}

export function dimReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  if (d?.type !== 'dimension') return { label: 'Dimension', value: '' };
  if (d.points.length === 1 && !d.chain) {
    const p = d.points[0];
    return {
      label: 'Distance',
      value: formatLength(Math.hypot(d.cursor.x - p.x, d.cursor.y - p.y) * MM_PER_UNIT, s.units),
    };
  }
  const dim = draftDimension(s.site.dimMode, d, d.cursor);
  return { label: 'Dimension', value: dim ? formatLength(dimLine(dim).value * MM_PER_UNIT, s.units) : '' };
}

export function dimHint(s: PlannerState): string {
  const d = s.draft;
  if (s.site.dimMode === 'radius') return 'Click a curved wall or curved layout line to show its radius.';
  if (d?.type !== 'dimension')
    return 'Click the first point to measure from (it snaps to ends, corners and faces, and follows them).';
  if (d.chain) return 'Click the next point to carry the chain on (or type a distance). Esc ends the chain.';
  if (d.points.length === 1) return 'Click the second point, or type the distance and press Enter.';
  return s.site.dimMode === 'linear'
    ? 'Move up or down for a horizontal dimension, sideways for a vertical one; click to place it, or type how far off.'
    : 'Move the pointer to where the dimension line goes and click, or type how far off.';
}
