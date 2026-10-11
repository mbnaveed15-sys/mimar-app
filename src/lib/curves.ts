/**
 * Curves built from circular arcs, the way they are set out on site: arcs by three points, by
 * their centre or carrying on from a line; circles; four-centred ovals; and smooth freeform curves
 * fitted with pairs of arcs (biarcs). Each comes out as a row of pieces with a bow (see `arc.ts`),
 * so walls and layout lines made from them work everywhere a curved wall does. Also the exact
 * crossings of lines and circles that Fillet, Chamfer, Extend and Join use on curves. Pure.
 */
import type { Point } from '../types';
import { arcOf, bowThrough, isArc, type WallLine } from './arc';

/** The ways the Curve tool draws. */
export type CurveMode = 'arc' | 'arc3' | 'centre' | 'tangent' | 'circle' | 'oval' | 'freeform';

export const CURVE_MODES: { id: CurveMode; label: string }[] = [
  { id: 'arc', label: 'Arc: ends, then bend' },
  { id: 'arc3', label: 'Arc: 3 points' },
  { id: 'centre', label: 'Arc: centre, start, end' },
  { id: 'tangent', label: 'Tangent arc' },
  { id: 'circle', label: 'Circle' },
  { id: 'oval', label: 'Oval' },
  { id: 'freeform', label: 'Freeform curve' },
];

const TAU = Math.PI * 2;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Point, b: Point) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a: Point, k: number) => ({ x: a.x * k, y: a.y * k });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const len = (a: Point) => Math.hypot(a.x, a.y);
const unit = (a: Point) => {
  const l = len(a);
  return l > 1e-12 ? mul(a, 1 / l) : { x: 1, y: 0 };
};
const polar = (c: Point, r: number, a: number) => ({ x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });

/** A straight piece from a to b. */
export const straight = (a: Point, b: Point): WallLine => ({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });

/** The piece from a to b that bends through m (straight when m is on the line). */
export function segThrough(a: Point, m: Point, b: Point): WallLine {
  const w = straight(a, b);
  const bow = bowThrough(w, m);
  return Math.abs(bow) > 0.05 ? { ...w, bow } : w;
}

/** The arc from a that leaves in direction t (a unit vector) and ends at b. */
export function tangentArc(a: Point, t: Point, b: Point): WallLine {
  const v = sub(b, a);
  const c = len(v);
  if (c < 1e-9) return straight(a, b);
  // The chord turns phi from the tangent; the arc sweeps twice that, bulging away from the turn.
  const phi = Math.atan2(cross(t, v), dot(t, v));
  // Nearly straight back: the arc would be a near full circle; keep it to a half circle at most.
  const limited = Math.max(-Math.PI * 0.999, Math.min(Math.PI * 0.999, phi));
  const bow = -(c / 2) * Math.tan(limited / 2);
  return Math.abs(bow) > 0.05 ? { ...straight(a, b), bow } : straight(a, b);
}

/** The unit direction a piece runs in at its end (atEnd) or start, along the way it runs. */
export function endDirection(w: WallLine, atEnd: boolean): Point {
  const arc = arcOf(w);
  if (!arc) return unit(sub({ x: w.x2, y: w.y2 }, { x: w.x1, y: w.y1 }));
  const a = arc.a0 + (atEnd ? arc.sweep : 0);
  const s = Math.sign(arc.sweep);
  return { x: -Math.sin(a) * s, y: Math.cos(a) * s };
}

/**
 * The swept angle from a (round centre c) to the pointer p, carried on from the last one so the arc
 * follows the pointer round past a half circle (short of a whole one).
 */
export function trackSweep(prev: number, c: Point, a: Point, p: Point): number {
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  const raw = Math.atan2(p.y - c.y, p.x - c.x) - a0;
  let best = raw;
  for (const k of [-2, -1, 0, 1, 2]) {
    const v = raw + k * TAU;
    if (Math.abs(v - prev) < Math.abs(best - prev)) best = v;
  }
  const max = TAU - 0.02;
  return Math.max(-max, Math.min(max, best));
}

/** The arc round centre c from a, sweeping `sweep` radians (positive turns from +x towards +y). */
export function centreArc(c: Point, a: Point, sweep: number): WallLine {
  const r = len(sub(a, c));
  const a0 = Math.atan2(a.y - c.y, a.x - c.x);
  return segThrough(a, polar(c, r, a0 + sweep / 2), polar(c, r, a0 + sweep));
}

/** A whole circle: two half circles, from the right round and back. */
export function circleSegs(c: Point, r: number): WallLine[] {
  const a = { x: c.x + r, y: c.y };
  const b = { x: c.x - r, y: c.y };
  return [segThrough(a, { x: c.x, y: c.y - r }, b), segThrough(b, { x: c.x, y: c.y + r }, a)];
}

/**
 * A four-centred oval with half-widths A (along x) and B (along y), turned by `rotation` radians
 * about its centre: arcs of a small radius at the ends of the long axis and a large one at the
 * ends of the short axis, meeting smoothly. The small radius is picked to keep closest to the
 * true ellipse.
 */
export function ovalSegs(c: Point, A: number, B: number, rotation = 0): WallLine[] {
  if (Math.abs(A - B) < 1e-6 * Math.max(A, B)) return turn(circleSegs({ x: 0, y: 0 }, A), c, rotation);
  // Work with the long axis along x, then turn a quarter if B was the long one.
  const swap = B > A;
  const [a, b] = swap ? [B, A] : [A, B];
  const r2Of = (r1: number) => ((a - r1) ** 2 + b * b - r1 * r1) / (2 * (b - r1));
  const deviation = (r1: number) => {
    const r2 = r2Of(r1);
    let worst = 0;
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (Math.PI / 2);
      const e = { x: a * Math.cos(t), y: b * Math.sin(t) };
      // Distance from the ellipse point to the oval: to whichever arc covers its direction.
      const c1 = { x: a - r1, y: 0 };
      const c2 = { x: 0, y: b - r2 };
      const d1 = Math.abs(len(sub(e, c1)) - r1);
      const d2 = Math.abs(len(sub(e, c2)) - r2);
      worst = Math.max(worst, Math.min(d1, d2));
    }
    return worst;
  };
  let r1 = (b * b) / a;
  let best = Infinity;
  for (let i = 1; i < 60; i++) {
    const cand = (b * i) / 60;
    if (cand >= b || cand <= 0) continue;
    if (r2Of(cand) < b) continue;
    const dev = deviation(cand);
    if (dev < best) {
      best = dev;
      r1 = cand;
    }
  }
  const r2 = r2Of(r1);
  const c1 = { x: a - r1, y: 0 };
  const c2 = { x: 0, y: b - r2 };
  // The tangent point between the end arc (round c1) and the side arc (round c2): on the line c2→c1.
  const u = unit(sub(c1, c2));
  const t = add(c2, mul(u, r2));
  const pts = {
    t1: t,
    t2: { x: -t.x, y: t.y },
    t3: { x: -t.x, y: -t.y },
    t4: { x: t.x, y: -t.y },
  };
  const segs = [
    segThrough(pts.t4, { x: a, y: 0 }, pts.t1),
    segThrough(pts.t1, { x: 0, y: b }, pts.t2),
    segThrough(pts.t2, { x: -a, y: 0 }, pts.t3),
    segThrough(pts.t3, { x: 0, y: -b }, pts.t4),
  ];
  return turn(segs, c, rotation + (swap ? Math.PI / 2 : 0));
}

/** The oval that fills the box with corners p and q. */
export function ovalInBox(p: Point, q: Point): WallLine[] {
  const c = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  return ovalSegs(c, Math.abs(q.x - p.x) / 2, Math.abs(q.y - p.y) / 2);
}

/** Pieces turned by `rotation` radians about the origin and moved to c. */
function turn(segs: WallLine[], c: Point, rotation: number): WallLine[] {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const at = (x: number, y: number) => ({ x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos });
  return segs.map((s) => {
    const a = at(s.x1, s.y1);
    const b = at(s.x2, s.y2);
    // Turning keeps which side each piece bows to.
    return { ...s, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  });
}

/**
 * A smooth curve through the points, as pairs of arcs between each two (a biarc), with the
 * direction at each point taken from its neighbours. Closed, it runs back round to the first point.
 */
export function splineSegs(points: Point[], closed = false): WallLine[] {
  const pts = points.filter((p, i) => i === 0 || len(sub(p, points[i - 1])) > 1e-6);
  if (closed && pts.length > 2 && len(sub(pts[0], pts[pts.length - 1])) < 1e-6) pts.pop();
  const n = pts.length;
  if (n < 2) return [];
  if (n === 2 && !closed) return [straight(pts[0], pts[1])];
  const tangents = pts.map((p, i) => {
    if (closed) return unit(sub(pts[(i + 1) % n], pts[(i - 1 + n) % n]));
    if (i > 0 && i < n - 1) {
      // Catmull-Rom style, weighted so short spans don't overshoot.
      const a = sub(p, pts[i - 1]);
      const b = sub(pts[i + 1], p);
      return unit(add(mul(unit(a), len(b)), mul(unit(b), len(a))));
    }
    // An end: the direction that makes the first (or last) span a single arc through its neighbour.
    if (n === 2) return unit(sub(pts[1], pts[0]));
    const [e, m, f] = i === 0 ? [pts[0], pts[1], pts[2]] : [pts[n - 1], pts[n - 2], pts[n - 3]];
    const arc = arcOf(segThrough(e, m, f));
    const along = unit(sub(m, e));
    if (!arc) return i === 0 ? along : mul(along, -1);
    const radial = unit(sub(e, { x: arc.cx, y: arc.cy }));
    let t = { x: -radial.y, y: radial.x };
    if (dot(t, along) < 0) t = mul(t, -1);
    return i === 0 ? t : mul(t, -1);
  });
  const out: WallLine[] = [];
  const spans = closed ? n : n - 1;
  for (let i = 0; i < spans; i++) out.push(...biarc(pts[i], tangents[i], pts[(i + 1) % n], tangents[(i + 1) % n]));
  return out;
}

/** Two arcs from p0 (leaving along t0) to p1 (arriving along t1), meeting smoothly half-way. */
export function biarc(p0: Point, t0: Point, p1: Point, t1: Point): WallLine[] {
  const v = sub(p1, p0);
  const t = add(t0, t1);
  const a = 2 * (1 - dot(t0, t1));
  const vt = dot(v, t);
  const vv = dot(v, v);
  let d: number;
  if (a < 1e-9) {
    // The ends point the same way: equal arcs, or straight when they line up.
    const vt0 = dot(v, t0);
    if (Math.abs(cross(t0, unit(v))) < 1e-9 || Math.abs(vt0) < 1e-9) return [straight(p0, p1)];
    d = vv / (4 * vt0);
  } else d = (-vt + Math.sqrt(vt * vt + a * vv)) / a;
  if (!(d > 0) || !Number.isFinite(d)) return [straight(p0, p1)];
  const q0 = add(p0, mul(t0, d));
  const q1 = sub(p1, mul(t1, d));
  const m = mul(add(q0, q1), 0.5);
  const first = tangentArc(p0, t0, m);
  // The second arc, worked out backwards from p1 and turned round.
  const back = tangentArc(p1, mul(t1, -1), m);
  const second: WallLine = {
    x1: back.x2,
    y1: back.y2,
    x2: back.x1,
    y2: back.y1,
    ...(back.bow !== undefined && { bow: -back.bow }),
  };
  return [first, second];
}

/** A rectangle from corner a to corner b with its corners rounded to radius r (square when r is 0). */
export function roundedRect(a: Point, b: Point, r: number): WallLine[] {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  if (rr < 0.05) {
    const c = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ];
    return c.map((p, i) => straight(p, c[(i + 1) % 4]));
  }
  const corner = (cx: number, cy: number, from: Point, to: Point) =>
    segThrough(from, polar({ x: cx, y: cy }, rr, Math.atan2(from.y + to.y - 2 * cy, from.x + to.x - 2 * cx)), to);
  const out: WallLine[] = [];
  const side = (p: Point, q: Point) => {
    if (len(sub(q, p)) > 0.05) out.push(straight(p, q));
  };
  side({ x: x0 + rr, y: y0 }, { x: x1 - rr, y: y0 });
  out.push(corner(x1 - rr, y0 + rr, { x: x1 - rr, y: y0 }, { x: x1, y: y0 + rr }));
  side({ x: x1, y: y0 + rr }, { x: x1, y: y1 - rr });
  out.push(corner(x1 - rr, y1 - rr, { x: x1, y: y1 - rr }, { x: x1 - rr, y: y1 }));
  side({ x: x1 - rr, y: y1 }, { x: x0 + rr, y: y1 });
  out.push(corner(x0 + rr, y1 - rr, { x: x0 + rr, y: y1 }, { x: x0, y: y1 - rr }));
  side({ x: x0, y: y1 - rr }, { x: x0, y: y0 + rr });
  out.push(corner(x0 + rr, y0 + rr, { x: x0, y: y0 + rr }, { x: x0 + rr, y: y0 }));
  return out;
}

// ---- Lines and circles: the exact geometry under Fillet, Chamfer, Extend and Join ----

/** The whole line or circle a piece lies on. */
export type Carrier = { kind: 'line'; p: Point; d: Point } | { kind: 'circle'; c: Point; r: number };

export function carrierOf(w: WallLine): Carrier {
  const arc = arcOf(w);
  if (arc) return { kind: 'circle', c: { x: arc.cx, y: arc.cy }, r: arc.r };
  return { kind: 'line', p: { x: w.x1, y: w.y1 }, d: unit({ x: w.x2 - w.x1, y: w.y2 - w.y1 }) };
}

/** The carrier moved `dist` to one side (a line sideways along its left normal; a circle's radius grown). */
export function offsetCarrier(k: Carrier, dist: number): Carrier | null {
  if (k.kind === 'line') return { ...k, p: add(k.p, mul({ x: -k.d.y, y: k.d.x }, dist)) };
  const r = k.r + dist;
  return r > 1e-6 ? { ...k, r } : null;
}

/** Where two carriers cross (none, one or two points). */
export function crossings(a: Carrier, b: Carrier): Point[] {
  if (a.kind === 'line' && b.kind === 'line') {
    const den = cross(a.d, b.d);
    if (Math.abs(den) < 1e-9) return [];
    const t = cross(sub(b.p, a.p), b.d) / den;
    return [add(a.p, mul(a.d, t))];
  }
  if (a.kind === 'circle' && b.kind === 'line') return crossings(b, a);
  if (a.kind === 'line' && b.kind === 'circle') {
    const f = sub(a.p, b.c);
    const along = dot(f, a.d);
    const disc = along * along - (dot(f, f) - b.r * b.r);
    if (disc < -1e-9) return [];
    const s = Math.sqrt(Math.max(0, disc));
    const t1 = -along - s;
    const t2 = -along + s;
    return s < 1e-9 ? [add(a.p, mul(a.d, t1))] : [add(a.p, mul(a.d, t1)), add(a.p, mul(a.d, t2))];
  }
  if (a.kind !== 'circle' || b.kind !== 'circle') return [];
  const v = sub(b.c, a.c);
  const d = len(v);
  if (d < 1e-9 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const u = mul(v, 1 / d);
  const m = add(a.c, mul(u, x));
  const n = { x: -u.y, y: u.x };
  return h < 1e-9 ? [m] : [add(m, mul(n, h)), sub(m, mul(n, h))];
}

/** The nearest point to p on the carrier. */
export function footOn(k: Carrier, p: Point): Point {
  if (k.kind === 'line') return add(k.p, mul(k.d, dot(sub(p, k.p), k.d)));
  const d = sub(p, k.c);
  return add(k.c, mul(unit(d), k.r));
}

/**
 * How far round (or along) a piece's carrier p is from its start, as a fraction of the piece,
 * going the way the piece runs: 0 at the start, 1 at the end, above 1 past the end. For a curve
 * the fraction goes on round the circle (up to a whole turn); `back` counts it the other way,
 * from the start backwards, as a negative fraction.
 */
export function fractionOn(w: WallLine, p: Point, back = false): number {
  const arc = arcOf(w);
  if (!arc) {
    const d = { x: w.x2 - w.x1, y: w.y2 - w.y1 };
    const L2 = dot(d, d) || 1;
    return dot(sub(p, { x: w.x1, y: w.y1 }), d) / L2;
  }
  const s = Math.sign(arc.sweep);
  const size = Math.abs(arc.sweep);
  const a = Math.atan2(p.y - arc.cy, p.x - arc.cx);
  const turned = ((((a - arc.a0) * s) % TAU) + TAU) % TAU;
  return back ? -((TAU - turned) % TAU) / size : turned / size;
}

/**
 * The piece cut (or carried on) so that one end is moved to p on its carrier, keeping the other
 * end (`keep` 'start' or 'end') where it is and the same curve.
 */
export function withEndAt<T extends WallLine>(w: T, keep: 'start' | 'end', p: Point): T {
  const arc = arcOf(w);
  if (!arc) return keep === 'start' ? { ...w, x2: p.x, y2: p.y } : { ...w, x1: p.x, y1: p.y };
  const far = keep === 'start' ? { x: w.x1, y: w.y1 } : { x: w.x2, y: w.y2 };
  // Round from the kept end, the way the piece runs from it, to p.
  const a0 = Math.atan2(far.y - arc.cy, far.x - arc.cx);
  const dir = (keep === 'start' ? 1 : -1) * Math.sign(arc.sweep);
  const a1 = Math.atan2(p.y - arc.cy, p.x - arc.cx);
  const turned = ((((a1 - a0) * dir) % TAU) + TAU) % TAU;
  if (turned < 1e-9) return w;
  const mid = polar({ x: arc.cx, y: arc.cy }, arc.r, a0 + (dir * turned) / 2);
  const end = polar({ x: arc.cx, y: arc.cy }, arc.r, a1);
  const seg = keep === 'start' ? segThrough(far, mid, end) : segThrough(end, mid, far);
  return { ...w, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, bow: seg.bow };
}

/** Length along a piece between fractions 0 and t (along the curve for an arc). */
export function lengthTo(w: WallLine, t: number): number {
  const arc = arcOf(w);
  return arc ? Math.abs(arc.sweep) * arc.r * t : Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * t;
}

/** The point at fraction t along a piece's carrier, t past 0 or 1 running on round the circle. */
export function atFraction(w: WallLine, t: number): Point {
  const arc = arcOf(w);
  if (!arc) return { x: w.x1 + t * (w.x2 - w.x1), y: w.y1 + t * (w.y2 - w.y1) };
  return polar({ x: arc.cx, y: arc.cy }, arc.r, arc.a0 + t * arc.sweep);
}

/** Whether two pieces lie on the same circle (or both on the same line), within tol. */
export function sameCarrier(a: WallLine, b: WallLine, tol: number): boolean {
  const ka = carrierOf(a);
  const kb = carrierOf(b);
  if (ka.kind === 'circle' && kb.kind === 'circle') return len(sub(ka.c, kb.c)) <= tol && Math.abs(ka.r - kb.r) <= tol;
  return false;
}

export { isArc };
