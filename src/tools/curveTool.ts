/**
 * The Curve tool: curved walls (or layout lines) drawn as arcs by their ends and a bend, by three
 * points, by their centre, or carrying on smoothly from the last piece; whole circles; ovals; and
 * freeform curves through clicked points. What it makes is arc walls (see `lib/curves.ts`).
 */
import { arcOf, bowForRadius, radiusOf, type WallLine } from '../lib/arc';
import {
  centreArc,
  circleSegs,
  endDirection,
  ovalInBox,
  segThrough,
  splineSegs,
  straight,
  tangentArc,
  trackSweep,
} from '../lib/curves';
import { axisDirection, type Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT } from '../lib/scale';
import type { PlannerState } from '../store/plannerStore';
import { centroid } from '../geometry';
import type { Point, Tool } from '../types';

interface Store {
  getState: () => PlannerState;
}

export const CURVE_TOOLS: Tool[] = ['curve'];

type CurveDraft = Extract<PlannerState['draft'], { type: 'curve' }>;

const same = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const tolOf = (s: PlannerState) => 10 * s.reach() * s.pxUnits();
const last = (d: CurveDraft) => d.points[d.points.length - 1];
const units = (mm: number) => mm / MM_PER_UNIT;

/**
 * The direction a wall or layout line runs in as it ends at p (or, starting at p, the way back
 * out of its start), so a tangent arc can carry on from it. Null when nothing ends there.
 */
export function directionInto(s: PlannerState, p: Point): Point | null {
  const near = 0.5;
  const items = s.visibleElements();
  for (let i = items.length - 1; i >= 0; i--) {
    const el = items[i];
    if (el.type !== 'wall' && el.type !== 'line') continue;
    if (same({ x: el.x2, y: el.y2 }, p, near)) return endDirection(el, true);
    if (same({ x: el.x1, y: el.y1 }, p, near)) {
      const d = endDirection(el, false);
      return { x: -d.x, y: -d.y };
    }
  }
  return null;
}

/** The pieces the draft would make if finished now, and any guide lines to show with them. */
export function curvePreview(d: CurveDraft): { pieces: WallLine[]; guides: [Point, Point][] } {
  const p = d.cursor;
  const [a, b] = d.points;
  const none = { pieces: [], guides: [] };
  if (!a) return none;
  switch (d.mode) {
    case 'arc':
      return { pieces: [b ? segThrough(a, p, b) : straight(a, p)], guides: [] };
    case 'arc3':
      return { pieces: [b ? segThrough(a, b, p) : straight(a, p)], guides: [] };
    case 'centre':
      if (!b) return { pieces: [], guides: [[a, p]] };
      return { pieces: [centreArc(a, b, d.sweep ?? 0)], guides: [[a, b]] };
    case 'tangent':
      return { pieces: [d.tangent ? tangentArc(a, d.tangent, p) : straight(a, p)], guides: [] };
    case 'circle':
      return { pieces: circleSegs(a, Math.hypot(p.x - a.x, p.y - a.y)), guides: [[a, p]] };
    case 'oval':
      return { pieces: Math.abs(p.x - a.x) > 0 && Math.abs(p.y - a.y) > 0 ? ovalInBox(a, p) : [], guides: [] };
    case 'freeform':
      return { pieces: splineSegs([...d.points, p]), guides: [] };
  }
}

/** Where the step in hand is drawn from, for snapping along the axes and locks. */
export function curveAnchor(d: CurveDraft): Point | null {
  // Bending an arc, or sweeping round a centre, follows the pointer freely.
  if ((d.mode === 'arc' || d.mode === 'centre') && d.points.length === 2) return null;
  return last(d);
}

/** Put the pieces in (as walls or lines, as the tool is set), one step. */
function place(store: Store, pieces: WallLine[], inside?: Point) {
  const s = store.getState();
  s.addCurve(pieces, inside);
  s.setWarning(null);
}

/** After a piece of a run of arcs: carry on from its end, unless the run came back to its start. */
function carryOn(store: Store, d: CurveDraft, end: Point, tangent?: Point | null) {
  const s = store.getState();
  const closed = d.chainStart && same(end, d.chainStart, tolOf(s)) && !same(d.points[0], d.chainStart, 0.01);
  s.setAxisLock(null);
  s.setDraft(
    closed
      ? null
      : { type: 'curve', mode: d.mode, points: [end], cursor: end, chainStart: d.chainStart, tangent: tangent ?? null },
  );
}

/** A point inside a closed outline of pieces, for its room: the middle of its points if that's inside. */
function insideOf(pieces: WallLine[]): Point {
  return centroid(pieces.flatMap((p) => [{ x: p.x1, y: p.y1 }]));
}

/** Finish a freeform curve: open through its points, or closed back to its first. */
function finishFreeform(store: Store, d: CurveDraft, closed: boolean) {
  const pieces = splineSegs(d.points, closed);
  if (pieces.length) place(store, pieces, closed ? insideOf(pieces) : undefined);
  store.getState().setDraft(null);
}

/** Pointer pressed with the Curve tool. */
export function curvePress(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft?.type === 'curve' ? s.draft : null;
  const p = inf.point;
  const tol = tolOf(s);
  if (!d) {
    const mode = s.site.curveMode;
    s.setDraft({
      type: 'curve',
      mode,
      points: [p],
      cursor: p,
      chainStart: p,
      tangent: mode === 'tangent' ? directionInto(s, p) : null,
    });
    return;
  }
  const [a, b] = d.points;
  switch (d.mode) {
    case 'arc':
      if (!b) {
        if (!same(p, a, 0.01)) s.setDraft({ ...d, points: [a, p], cursor: p });
        return;
      }
      place(store, [segThrough(a, d.cursor, b)]);
      return carryOn(store, d, b);
    case 'arc3':
      if (!b) {
        if (!same(p, a, 0.01)) s.setDraft({ ...d, points: [a, p], cursor: p });
        return;
      }
      if (same(p, a, 0.01) || same(p, b, 0.01)) return;
      place(store, [segThrough(a, b, p)]);
      return carryOn(store, d, p);
    case 'centre':
      if (!b) {
        if (!same(p, a, 0.01)) s.setDraft({ ...d, points: [a, p], cursor: p, sweep: 0 });
        return;
      }
      if (Math.abs(d.sweep ?? 0) < 1e-3) return;
      place(store, [centreArc(a, b, d.sweep ?? 0)]);
      s.setDraft(null);
      return;
    case 'tangent': {
      if (same(p, a, 0.01)) return;
      // After an undo the direction is found again from the piece that ends here.
      const t = d.tangent === undefined ? directionInto(s, a) : d.tangent;
      const piece = t ? tangentArc(a, t, p) : straight(a, p);
      place(store, [piece]);
      return carryOn(store, d, p, endDirection(piece, true));
    }
    case 'circle': {
      const r = Math.hypot(p.x - a.x, p.y - a.y);
      if (r < 1) return;
      place(store, circleSegs(a, r), a);
      s.setDraft(null);
      return;
    }
    case 'oval': {
      if (Math.abs(p.x - a.x) < 1 || Math.abs(p.y - a.y) < 1) return;
      place(store, ovalInBox(a, p), { x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 });
      s.setDraft(null);
      return;
    }
    case 'freeform': {
      if (d.points.length >= 3 && same(p, a, tol)) return finishFreeform(store, d, true);
      // Clicking the last point again (a double-click) finishes the curve where it is.
      if (same(p, last(d), 0.01)) {
        if (d.points.length >= 2) finishFreeform(store, d, false);
        return;
      }
      s.setDraft({ ...d, points: [...d.points, p], cursor: p });
      return;
    }
  }
}

/** Pointer moved with the Curve tool. */
export function curveHover(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'curve') return;
  const p = inf.point;
  if (d.mode === 'centre' && d.points.length === 2)
    s.setDraft({ ...d, cursor: p, sweep: trackSweep(d.sweep ?? 0, d.points[0], d.points[1], p) });
  else s.setDraft({ ...d, cursor: p });
}

/** Pointer released: a drag puts down a circle or oval, or the chord of an arc. */
export function curveRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (!dragged || d?.type !== 'curve' || d.points.length !== 1) return;
  if (d.mode === 'circle' || d.mode === 'oval' || d.mode === 'arc' || d.mode === 'centre')
    curvePress(store, { point: d.cursor, kind: 'free' });
}

/** Enter (or a right-click): a freeform curve ends where it is; an arc being bent goes in as it is. */
export function curveEnter(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'curve') return false;
  if (d.mode === 'freeform' && d.points.length >= 2) {
    finishFreeform(store, d, false);
    return true;
  }
  if (d.mode === 'arc' && d.points.length === 2) {
    place(store, [segThrough(d.points[0], d.cursor, d.points[1])]);
    s.setDraft(null);
    return true;
  }
  s.setDraft(null);
  return true;
}

/** The point a typed length (or @x,y, or len<angle) reaches from `from`, along the rubber band. */
function typedPoint(s: PlannerState, d: CurveDraft, from: Point, m: Measure): Point | null {
  if (m.kind === 'vector') return { x: from.x + units(m.dx), y: from.y - units(m.dy) };
  if (m.kind !== 'length') return null;
  const lock = s.axisLock === 'x' || s.axisLock === 'y' ? axisDirection(s.axisLock) : s.shiftLock;
  const dir = lock ?? { x: d.cursor.x - from.x, y: d.cursor.y - from.y };
  const l = Math.hypot(dir.x, dir.y);
  const u = l > 1e-9 ? { x: dir.x / l, y: dir.y / l } : { x: 1, y: 0 };
  return { x: from.x + u.x * units(m.mm), y: from.y + u.y * units(m.mm) };
}

/** A typed value for the Curve tool. Returns an error message, or null when it was used. */
export function curveMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  const d = s.draft?.type === 'curve' ? s.draft : null;
  const mode = d?.mode ?? s.site.curveMode;
  if (!d) {
    if (mode === 'circle') return 'Click the centre of the circle, then type its radius.';
    if (mode === 'oval') return `Click a corner of the oval's box, then type its width and depth (e.g. 12',8').`;
    return 'Click where the curve starts first.';
  }
  const [a, b] = d.points;
  switch (d.mode) {
    case 'circle': {
      if (m.kind !== 'length') return `Type the circle's radius, e.g. 6' or 1.8m.`;
      place(store, circleSegs(a, units(m.mm)), a);
      s.setDraft(null);
      return null;
    }
    case 'oval': {
      const [w, h] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
      if (!w || !h) return `Type the oval's width and depth, e.g. 12',8'.`;
      const sx = d.cursor.x < a.x ? -1 : 1;
      const sy = d.cursor.y < a.y ? -1 : 1;
      const q = { x: a.x + sx * units(w), y: a.y + sy * units(h) };
      place(store, ovalInBox(a, q), { x: (a.x + q.x) / 2, y: (a.y + q.y) / 2 });
      s.setDraft(null);
      return null;
    }
    case 'centre': {
      if (!b) {
        if (m.kind !== 'length') return 'Type the radius, or click where the arc starts.';
        const to = typedPoint(s, d, a, m);
        if (to) s.setDraft({ ...d, points: [a, to], cursor: to, sweep: 0 });
        return null;
      }
      if (m.kind !== 'angle' || !m.deg) return 'Type the angle the arc turns through, e.g. 90 or -120.';
      // Counter-clockwise positive, as for Rotate (the plan's y points down).
      const sweep = (-m.deg * Math.PI) / 180;
      if (Math.abs(sweep) >= Math.PI * 2) return 'Type an angle under 360°; use the Circle option for a whole circle.';
      place(store, [centreArc(a, b, sweep)]);
      s.setDraft(null);
      return null;
    }
    case 'arc': {
      if (b) {
        // Bending: the radius, on the side the pointer has bent it to.
        const chord = Math.hypot(b.x - a.x, b.y - a.y);
        if (m.kind !== 'length' || units(m.mm) < chord / 2 - 1e-6)
          return `Type the arc's radius: at least half the distance between its ends.`;
        const bent = segThrough(a, d.cursor, b);
        place(store, [{ ...bent, bow: bowForRadius({ ...bent, bow: bent.bow || 1 }, units(m.mm)) }]);
        carryOn(store, d, b);
        return null;
      }
      const to = typedPoint(s, d, a, m);
      if (!to) return `Type how far apart the arc's ends are (or @x,y, or length<angle).`;
      s.setDraft({ ...d, points: [a, to], cursor: to });
      return null;
    }
    default: {
      const to = typedPoint(s, d, last(d), m);
      if (!to) return 'Type a length (or @x,y, or length<angle).';
      curvePress(store, { point: to, kind: 'free' });
      return null;
    }
  }
}

/** What the Curve tool takes typed just now. */
export function curveMeasureKind(s: PlannerState): 'length' | 'pair' | 'angle' {
  const d = s.draft?.type === 'curve' ? s.draft : null;
  const mode = d?.mode ?? s.site.curveMode;
  if (mode === 'oval') return 'pair';
  if (mode === 'centre' && d?.points.length === 2) return 'angle';
  return 'length';
}

/** What the Measurements box shows for the Curve tool. */
export function curveReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft?.type === 'curve' ? s.draft : null;
  const mode = d?.mode ?? s.site.curveMode;
  const fmt = (v: number) => formatLength(v * MM_PER_UNIT, s.units);
  const dist = (p: Point, q: Point) => Math.hypot(q.x - p.x, q.y - p.y);
  if (mode === 'circle') return { label: 'Radius', value: d ? fmt(dist(d.points[0], d.cursor)) : '' };
  if (mode === 'oval')
    return {
      label: 'Width, depth',
      value: d ? `${fmt(Math.abs(d.cursor.x - d.points[0].x))}, ${fmt(Math.abs(d.cursor.y - d.points[0].y))}` : '',
    };
  if (mode === 'centre') {
    if (d?.points.length === 2) return { label: 'Angle', value: `${Math.round((-(d.sweep ?? 0) * 180) / Math.PI)}°` };
    return { label: 'Radius', value: d ? fmt(dist(d.points[0], d.cursor)) : '' };
  }
  if (d && (mode === 'arc' || mode === 'arc3') && d.points.length === 2) {
    const piece = curvePreview(d).pieces[0];
    const r = piece && radiusOf(piece);
    return { label: 'Radius', value: r ? fmt(r) : '' };
  }
  if (d && mode === 'tangent' && d.tangent) {
    const piece = curvePreview(d).pieces[0];
    const arc = piece && arcOf(piece);
    return { label: 'Radius', value: arc ? fmt(arc.r) : '' };
  }
  return { label: 'Length', value: d ? fmt(dist(last(d), d.cursor)) : '' };
}

/** What the Curve tool wants next. */
export function curveHint(s: PlannerState): string {
  const d = s.draft?.type === 'curve' ? s.draft : null;
  const mode = d?.mode ?? s.site.curveMode;
  const n = d?.points.length ?? 0;
  const what = s.site.curveMake === 'line' ? 'line' : s.site.curveMake === 'path' ? 'path' : 'wall';
  switch (mode) {
    case 'arc':
      if (!d) return `Click where the curved ${what} starts (or drag to its end).`;
      return n === 1
        ? `Click where it ends (or type the distance), then bend it.`
        : 'Move the pointer to bend it and click, or type its radius and press Enter. Esc stops.';
    case 'arc3':
      if (!d) return `Click where the curved ${what} starts.`;
      return n === 1
        ? 'Click a point the curve passes through.'
        : 'Click where it ends. Each arc carries on from the last; Esc stops.';
    case 'centre':
      if (!d) return 'Click the centre of the arc.';
      return n === 1
        ? 'Click where the arc starts, or type its radius.'
        : 'Move round and click where it ends, or type the angle (e.g. 90, or -90 the other way).';
    case 'tangent':
      if (!d)
        return `Click the end of a ${what} to carry on smoothly from it (or anywhere to start with a straight piece).`;
      return d.tangent
        ? 'Click where the arc ends: it carries on smoothly from the last piece. Esc stops.'
        : 'Click the end of the first, straight piece (or type its length); arcs carry on from it.';
    case 'circle':
      return d
        ? 'Click to set the radius, or type it and press Enter.'
        : 'Click the centre of the circle (or drag out its radius).';
    case 'oval':
      return d
        ? `Click the opposite corner of the oval's box, or type width and depth (e.g. 12',8').`
        : `Click a corner of the box the oval fits in (or drag it out).`;
    case 'freeform':
      if (!d) return 'Click points the curve passes through.';
      return n >= 3
        ? 'Click more points; Enter or a double-click finishes, clicking the first point closes it.'
        : 'Click the next point the curve passes through.';
  }
}
