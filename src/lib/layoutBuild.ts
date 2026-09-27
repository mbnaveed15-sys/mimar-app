/**
 * A plan from the room list (`layoutGen.ts`) built as ordinary Mimar items: 9" outside walls and
 * 4½" inside walls on the rooms' edges, named rooms, doors along the way through the house, windows
 * on the outside walls, and a U stair in the stair room. It goes in the largest rectangle inside the
 * plot's building line, square to the main road. Pure.
 */
import { placeOnWall } from '../geometry';
import { detectRoom } from '../rooms';
import { MM_PER_UNIT } from './scale';
import { stairLayout } from './site';
import { insetPolygon, plotSides, sideOutward, sideSetbacks } from './plot';
import { feetToUnits as ft, type Layout, type LayoutRoom, type Rect } from './layoutGen';
import type { Id, Opening, Plot, Point, Room, Stair, Wall } from '../types';

/** Local to plan coordinates: p = o + x·u + y·v (x along the road, y in from it). */
export interface Frame {
  o: Point;
  u: Point;
  v: Point;
}

export const toPlan = (f: Frame, x: number, y: number): Point => ({
  x: f.o.x + x * f.u.x + y * f.v.x,
  y: f.o.y + x * f.u.y + y * f.v.y,
});

const OUTER = (9 * 25.4) / MM_PER_UNIT;
const INNER = (4.5 * 25.4) / MM_PER_UNIT;
/** A house wall beside a boundary wall stands this far off it (a gap for the plaster). */
const CLEARANCE_MM = 25;

function inside(p: Point, poly: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const nearEdge = (p: Point, poly: Point[], tol: number) =>
  poly.some((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y) <= tol;
  });

/** Whether an axis-aligned rectangle lies inside a simple polygon (touching its edges allowed). */
function rectInside(r: Rect, poly: Point[]): boolean {
  const tol = 1e-6;
  const corners = [
    { x: r.x0, y: r.y0 },
    { x: r.x1, y: r.y0 },
    { x: r.x1, y: r.y1 },
    { x: r.x0, y: r.y1 },
  ];
  if (!corners.every((c) => inside(c, poly) || nearEdge(c, poly, 1e-4))) return false;
  // No corner of the polygon pokes into it, and no side of it cuts across.
  if (poly.some((p) => p.x > r.x0 + tol && p.x < r.x1 - tol && p.y > r.y0 + tol && p.y < r.y1 - tol)) return false;
  const mid = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  if (!inside(mid, poly)) return false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    // A polygon edge crossing the rectangle's inside, through two of its sides.
    const steps = 8;
    for (let k = 1; k < steps; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps };
      if (p.x > r.x0 + tol && p.x < r.x1 - tol && p.y > r.y0 + tol && p.y < r.y1 - tol) return false;
    }
  }
  return true;
}

/** The largest axis-aligned rectangle inside a polygon, from its corners' coordinates and a few in between. */
export function largestRect(poly: Point[]): Rect | null {
  const pick = (vals: number[]) => {
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const set = new Set(vals.map((v) => Math.round(v * 1000) / 1000));
    for (let k = 1; k < 12; k++) set.add(Math.round((lo + ((hi - lo) * k) / 12) * 1000) / 1000);
    return [...set].sort((a, b) => a - b);
  };
  const xs = pick(poly.map((p) => p.x));
  const ys = pick(poly.map((p) => p.y));
  let best: Rect | null = null;
  let bestArea = 0;
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++)
      for (let k = 0; k < ys.length; k++)
        for (let l = k + 1; l < ys.length; l++) {
          const area = (xs[j] - xs[i]) * (ys[l] - ys[k]);
          if (area <= bestArea) continue;
          const r = { x0: xs[i], y0: ys[k], x1: xs[j], y1: ys[l] };
          if (rectInside(r, poly)) [best, bestArea] = [r, area];
        }
  return best;
}

/**
 * Where a plan goes on a plot: the largest rectangle inside the building line, square to the main
 * road, as a frame whose origin is the rectangle's corner on the road side and whose size is
 * between the outside walls' centre lines. `maxAreaSqFt` (the bylaws' coverage) keeps it from
 * covering more; `needSqFt` (what the rooms need) keeps a big plot's house from spreading out.
 */
export function layoutSite(
  plot: Plot,
  opts: { maxAreaSqFt?: number; needSqFt?: number } = {},
): { frame: Frame; W: number; D: number; fullW: number; fullD: number } | null {
  // Inside the building line, and inside the boundary walls where a side has no setback to speak of.
  const sides = plotSides(plot);
  const setbacks = sideSetbacks(plot, sides);
  const clear = setbacks.map(
    (sb, i) => Math.max(sb.mm, sides[i].wall ? sides[i].wall!.thicknessMm + CLEARANCE_MM : 0) / MM_PER_UNIT,
  );
  const line = insetPolygon(plot.points, clear).points;
  if (line.length < 3) return null;
  const n = plot.points.length;
  const a = plot.points[plot.front % n];
  const out = sideOutward(plot, plot.front % n);
  const v = { x: -out.x, y: -out.y };
  const u = { x: -v.y, y: v.x };
  const local = line.map((p) => ({
    x: (p.x - a.x) * u.x + (p.y - a.y) * u.y,
    y: (p.x - a.x) * v.x + (p.y - a.y) * v.y,
  }));
  const r = largestRect(local);
  if (!r) return null;
  const fullW = r.x1 - r.x0;
  const fullD = r.y1 - r.y0;
  let depth = fullD;
  const sqftToUnits = (sq: number) => sq * ft(1) * ft(1);
  if (opts.maxAreaSqFt) depth = Math.min(depth, sqftToUnits(opts.maxAreaSqFt) / fullW);
  if (opts.needSqFt) depth = Math.min(depth, Math.max(ft(30), (sqftToUnits(opts.needSqFt) * 1.25) / fullW));
  const o = {
    x: a.x + (r.x0 + OUTER / 2) * u.x + (r.y0 + OUTER / 2) * v.x,
    y: a.y + (r.x0 + OUTER / 2) * u.y + (r.y0 + OUTER / 2) * v.y,
  };
  return { frame: { o, u, v }, W: fullW - OUTER, D: depth - OUTER, fullW, fullD };
}

export interface Built {
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  stairs: Stair[];
}

interface Seg {
  /** 'h': along x at y = at; 'v': along y at x = at. */
  dir: 'h' | 'v';
  at: number;
  from: number;
  to: number;
}

const OUT = -1;
const key = (v: number) => Math.round(v * 1000) / 1000;

/** The walls of a plan in its own frame: each piece of room edge, with the rooms on either side. */
function wallSegments(plan: Layout): (Seg & { thickness: number })[] {
  const lines = new Map<
    string,
    { dir: 'h' | 'v'; at: number; edges: { from: number; to: number; room: number; side: 1 | -1 }[] }
  >();
  const add = (dir: 'h' | 'v', at: number, from: number, to: number, room: number, side: 1 | -1) => {
    const k = `${dir}${key(at)}`;
    if (!lines.has(k)) lines.set(k, { dir, at, edges: [] });
    lines.get(k)!.edges.push({ from, to, room, side });
  };
  plan.rooms.forEach((room, i) =>
    room.rects.forEach((r) => {
      add('h', r.y0, r.x0, r.x1, i, 1);
      add('h', r.y1, r.x0, r.x1, i, -1);
      add('v', r.x0, r.y0, r.y1, i, 1);
      add('v', r.x1, r.y0, r.y1, i, -1);
    }),
  );
  const porch = (i: number) => i !== OUT && plan.rooms[i].kind === 'porch';
  const out: (Seg & { thickness: number })[] = [];
  for (const line of lines.values()) {
    const cuts = [...new Set(line.edges.flatMap((e) => [key(e.from), key(e.to)]))].sort((a, b) => a - b);
    let run: (Seg & { thickness: number }) | null = null;
    for (let c = 0; c + 1 < cuts.length; c++) {
      const [s0, s1] = [cuts[c], cuts[c + 1]];
      const mid = (s0 + s1) / 2;
      const on = (side: 1 | -1) =>
        line.edges.find((e) => e.side === side && e.from - 1e-6 <= mid && mid <= e.to + 1e-6)?.room ?? OUT;
      const plus = on(1);
      const minus = on(-1);
      // None inside a room or between the porch and outside; 9" facing outside or the porch; 4½" between rooms.
      const open = (i: number) => i === OUT || porch(i);
      const thickness = plus === minus || (open(plus) && open(minus)) ? 0 : open(plus) || open(minus) ? OUTER : INNER;
      if (run && run.thickness === thickness && Math.abs(run.to - s0) < 1e-6) run.to = s1;
      else {
        if (run && run.thickness) out.push(run);
        run = { dir: line.dir, at: line.at, from: s0, to: s1, thickness };
      }
    }
    if (run && run.thickness) out.push(run);
  }
  return out;
}

/** Where two rooms share an edge (the longest stretch), or where a room meets the outside. */
function sharedEdge(plan: Layout, a: LayoutRoom, b: LayoutRoom | null, preferFront: boolean): Seg | null {
  const segs: Seg[] = [];
  const eps = 1e-6;
  const ov = (a0: number, a1: number, b0: number, b1: number): [number, number] => [Math.max(a0, b0), Math.min(a1, b1)];
  for (const r of a.rects) {
    if (!b) {
      if (r.y0 < eps) segs.push({ dir: 'h', at: 0, from: r.x0, to: r.x1 });
      if (!preferFront || !segs.length) {
        if (r.y1 > plan.D - eps) segs.push({ dir: 'h', at: plan.D, from: r.x0, to: r.x1 });
        if (r.x0 < eps) segs.push({ dir: 'v', at: 0, from: r.y0, to: r.y1 });
        if (r.x1 > plan.W - eps) segs.push({ dir: 'v', at: plan.W, from: r.y0, to: r.y1 });
      }
      continue;
    }
    for (const s of b.rects) {
      if (Math.abs(r.y1 - s.y0) < eps || Math.abs(r.y0 - s.y1) < eps) {
        const [f, t] = ov(r.x0, r.x1, s.x0, s.x1);
        if (t - f > eps) segs.push({ dir: 'h', at: Math.abs(r.y1 - s.y0) < eps ? r.y1 : r.y0, from: f, to: t });
      }
      if (Math.abs(r.x1 - s.x0) < eps || Math.abs(r.x0 - s.x1) < eps) {
        const [f, t] = ov(r.y0, r.y1, s.y0, s.y1);
        if (t - f > eps) segs.push({ dir: 'v', at: Math.abs(r.x1 - s.x0) < eps ? r.x1 : r.x0, from: f, to: t });
      }
    }
  }
  return segs.sort((p, q) => q.to - q.from - (p.to - p.from))[0] ?? null;
}

const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });

/** Rooms that get a window on an outside wall, and baths that get a ventilator. */
const WINDOWED = new Set(['master', 'bed', 'drawing', 'lounge', 'kitchen', 'dining', 'servant', 'prayer']);
const VENTED = new Set(['bath', 'powder', 'laundry']);

/**
 * Build a plan in a frame. `newId` makes ids; `levelId` puts it on a floor; `riseMm` is how high
 * the stair climbs.
 */
export function buildLayout(
  plan: Layout,
  frame: Frame,
  opts: { newId: () => Id; levelId?: Id; riseMm: number },
): Built {
  const P = (x: number, y: number) => toPlan(frame, x, y);
  const on = opts.levelId ? { levelId: opts.levelId } : {};
  const segs = wallSegments(plan);
  const walls: Wall[] = segs.map((s) => {
    const a = s.dir === 'h' ? P(s.from, s.at) : P(s.at, s.from);
    const b = s.dir === 'h' ? P(s.to, s.at) : P(s.at, s.to);
    return { id: opts.newId(), type: 'wall', x1: a.x, y1: a.y, x2: b.x, y2: b.y, thickness: s.thickness, ...on };
  });
  const wallAt = (seg: Seg, t: number) => {
    const i = segs.findIndex(
      (s) => s.dir === seg.dir && Math.abs(s.at - seg.at) < 1e-6 && s.from - 1e-6 <= t && t <= s.to + 1e-6,
    );
    return i >= 0 ? { wall: walls[i], seg: segs[i] } : null;
  };

  const openings: Opening[] = [];
  /** A door or window on a stretch of edge, centred (or at `t`), swinging towards `into`. */
  const place = (
    seg: Seg,
    widthFt: number,
    extra: Partial<Opening> & Pick<Opening, 'type'>,
    into?: Point,
    t?: number,
  ) => {
    const at = t ?? (seg.from + seg.to) / 2;
    const host = wallAt(seg, at);
    if (!host) return null;
    const p = seg.dir === 'h' ? P(at, seg.at) : P(seg.at, at);
    const width = Math.min(ft(widthFt), host.seg.to - host.seg.from - ft(1));
    if (width < ft(2)) return null;
    const o: Opening = { id: opts.newId(), wallId: host.wall.id, ...placeOnWall(host.wall, p, width), ...extra, ...on };
    if (into) {
      // An unturned door swings towards the right of its wall's direction (on screen).
      const d = { x: host.wall.x2 - host.wall.x1, y: host.wall.y2 - host.wall.y1 };
      const c = seg.dir === 'h' ? P(at, seg.at) : P(seg.at, at);
      if ((into.x - c.x) * d.y - (into.y - c.y) * d.x < 0) o.flipSide = true;
    }
    openings.push(o);
    return o;
  };

  const doorAt = new Map<string, number[]>();
  for (const d of plan.doors) {
    const a = plan.rooms[d.a];
    const b = d.b === 'out' ? null : plan.rooms[d.b];
    const seg = sharedEdge(plan, a, b, d.b === 'out');
    if (!seg) continue;
    // Swing into the room being entered: the second room, or the house from outside or the porch.
    const target = b && b.kind !== 'porch' ? b : a;
    const c = centre(target.rects[0]);
    const into = P(c.x, c.y);
    const o = place(seg, d.widthFt, { type: 'door', ...(d.open ? { doorKind: 'opening' as const } : {}) }, into);
    if (o) {
      const k = `${seg.dir}${key(seg.at)}`;
      doorAt.set(k, [...(doorAt.get(k) ?? []), (seg.from + seg.to) / 2]);
    }
  }

  // Windows: on the longest stretch of outside wall, away from a door there.
  plan.rooms.forEach((room) => {
    const vent = VENTED.has(room.kind);
    if (!vent && !WINDOWED.has(room.kind)) return;
    const edges: Seg[] = [];
    for (const r of room.rects) {
      if (r.y0 < 1e-6) edges.push({ dir: 'h', at: 0, from: r.x0, to: r.x1 });
      if (r.y1 > plan.D - 1e-6) edges.push({ dir: 'h', at: plan.D, from: r.x0, to: r.x1 });
      if (r.x0 < 1e-6) edges.push({ dir: 'v', at: 0, from: r.y0, to: r.y1 });
      if (r.x1 > plan.W - 1e-6) edges.push({ dir: 'v', at: plan.W, from: r.y0, to: r.y1 });
    }
    // (A room's edges onto the porch are inside walls, so windows never face the porch.)
    const areaSqFt = room.rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.y1 - r.y0), 0) / (ft(1) * ft(1));
    // A window of a tenth of the floor (4' high), on the longest stretch it fits, away from a door there.
    const want = vent ? 2 : Math.max(3, Math.min(8, Math.ceil(areaSqFt / 40)));
    for (const edge of edges.sort((p, q) => q.to - q.from - (p.to - p.from))) {
      const len = (edge.to - edge.from) / ft(1);
      const widthFt = Math.min(want, len - 2);
      if (widthFt < (vent ? 1.5 : 3)) continue;
      const doors = doorAt.get(`${edge.dir}${key(edge.at)}`)?.filter((t) => t > edge.from && t < edge.to) ?? [];
      let t = (edge.from + edge.to) / 2;
      if (doors.some((d) => Math.abs(d - t) < ft(widthFt / 2 + 3))) {
        const d = doors[0];
        t = d - edge.from > edge.to - d ? (edge.from + d) / 2 : (d + edge.to) / 2;
        const room = Math.min(t - edge.from, edge.to - t, Math.abs(d - t) - ft(2));
        if (room < ft(widthFt / 2 + 1)) continue;
      }
      place(
        edge,
        widthFt,
        vent
          ? { type: 'window', windowKind: 'vent', sillMm: 1829, heightMm: 610 }
          : { type: 'window', windowKind: 'sliding' },
        undefined,
        t,
      );
      break;
    }
  });

  // Rooms: the space the walls close round each one (the porch is open, so it's drawn as its outline).
  const rooms: Room[] = [];
  for (const room of plan.rooms) {
    const main = room.rects[0];
    const c = centre(main);
    const p = P(c.x, c.y);
    const found = room.kind === 'porch' ? null : detectRoom(walls, p);
    const points = found ?? [P(main.x0, main.y0), P(main.x1, main.y0), P(main.x1, main.y1), P(main.x0, main.y1)];
    rooms.push({ id: opts.newId(), name: room.name, points, ...on });
  }

  // A U stair in the stair room, turned to fit.
  const stairs: Stair[] = [];
  const stairRoom = plan.rooms.find((r) => r.kind === 'stair');
  if (stairRoom) {
    const r = stairRoom.rects[0];
    const spec = { shape: 'U' as const, width: ft(3), riseMm: opts.riseMm, treadMm: 254 };
    const l = stairLayout(spec);
    const w = r.x1 - r.x0;
    const d = r.y1 - r.y0;
    // Its width across the room's width, or turned a quarter if that fits better.
    const turn = Math.max(l.w / w, l.h / d) > Math.max(l.h / w, l.w / d) ? 90 : 0;
    const base = (Math.atan2(frame.u.y, frame.u.x) * 180) / Math.PI;
    const c = centre(r);
    const p = P(c.x, c.y);
    stairs.push({
      id: opts.newId(),
      type: 'stair',
      x: p.x,
      y: p.y,
      rotation: (((base + turn) % 360) + 360) % 360,
      ...spec,
      riserMm: l.riserMm,
      w: l.w,
      h: l.h,
      ...on,
    });
  }
  return { walls, openings, rooms, stairs };
}
