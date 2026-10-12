/**
 * Floor plans from a room list: the rooms are laid out in three strips across the plot (front:
 * porch and drawing room; middle: lounge, dining, kitchen, stair and small rooms; back: bedrooms
 * with their baths), with a passage when the back rooms can't all open onto the lounge. Many ways
 * of ordering and sizing the strips are tried; each is scored on the plan hints' rules (every room
 * reached through doors, daylight on an outside wall, kitchen by the dining room or lounge, room
 * sizes and shapes) and the best few that differ are kept. A first floor is laid out the same way
 * round the ground floor's stair, which keeps its place (see `generateUpperLayouts`). Pure; all
 * lengths in plan units, in a frame with x along the road and y going in from it (0 at the road
 * side of the building area).
 */
import { MM_PER_UNIT } from './scale';
import { MM_PER_FOOT } from './units';

export type RoomKind =
  | 'master'
  | 'bed'
  | 'bath'
  | 'drawing'
  | 'lounge'
  | 'kitchen'
  | 'dining'
  | 'porch'
  | 'prayer'
  | 'store'
  | 'laundry'
  | 'servant'
  | 'stair'
  | 'powder'
  | 'gym'
  | 'passage'
  | 'terrace';

/** Kinds of room with a size the owner can set. */
export type SizedKind = Exclude<RoomKind, 'passage' | 'terrace'>;

/** A room's usual size in feet: width (along the road) and depth, and the narrowest it may be. */
export interface RoomSize {
  w: number;
  d: number;
  minW: number;
}

/** Usual Pakistani room sizes, at or above the plan hints' good-practice sizes. */
export const DEFAULT_SIZES: Record<SizedKind, RoomSize> = {
  master: { w: 14, d: 16, minW: 11 },
  bed: { w: 12, d: 14, minW: 10 },
  bath: { w: 5, d: 8, minW: 5 },
  drawing: { w: 13, d: 16, minW: 11 },
  lounge: { w: 15, d: 18, minW: 11 },
  kitchen: { w: 9, d: 12, minW: 7 },
  dining: { w: 11, d: 12, minW: 9 },
  porch: { w: 11, d: 18.5, minW: 9.5 },
  prayer: { w: 7, d: 8, minW: 6 },
  store: { w: 5, d: 6, minW: 4 },
  laundry: { w: 5, d: 7, minW: 4 },
  servant: { w: 9, d: 10, minW: 8 },
  stair: { w: 7.5, d: 11, minW: 6.5 },
  powder: { w: 5, d: 7, minW: 4.5 },
  gym: { w: 12, d: 14, minW: 10 },
};

export const ROOM_NAMES: Record<RoomKind, string> = {
  master: 'Master bedroom',
  bed: 'Bedroom',
  bath: 'Bath',
  drawing: 'Drawing room',
  lounge: 'Lounge',
  kitchen: 'Kitchen',
  dining: 'Dining',
  porch: 'Car porch',
  prayer: 'Prayer room',
  store: 'Store',
  laundry: 'Laundry',
  servant: 'Servant room',
  stair: 'Stair',
  powder: 'Guest bath',
  gym: 'Gym',
  passage: 'Passage',
  terrace: 'Terrace',
};

/** What the owner asks for. The lounge and kitchen are always there. */
export interface Program {
  bedrooms: number;
  /** How many bedrooms (the master first) have their own bath. */
  attachedBaths: number;
  drawing: boolean;
  dining: boolean;
  porch: boolean;
  prayer: boolean;
  store: boolean;
  laundry: boolean;
  servant: boolean;
  stair: boolean;
  powder: boolean;
  /**
   * A basement's list instead: a hall (in place of the lounge), a gym, the servant room with its own
   * bath, store, laundry, guest bath and stair; no kitchen, porch or daylight.
   */
  basement?: boolean;
  /**
   * A first floor's list instead: bedrooms with their baths, a TV lounge and the rooms ticked (store,
   * laundry, guest bath, prayer room); the stair is the ground floor's, and what is left is a terrace.
   */
  upper?: boolean;
  gym?: boolean;
  /** Sizes that differ from the usual ones. */
  sizes?: Partial<Record<SizedKind, { w: number; d: number }>>;
}

export const DEFAULT_PROGRAM: Program = {
  bedrooms: 3,
  attachedBaths: 3,
  drawing: true,
  dining: true,
  porch: true,
  prayer: false,
  store: true,
  laundry: false,
  servant: false,
  stair: true,
  powder: true,
};

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A room of a plan: one rectangle, or two for a bedroom whose bath takes a corner. */
export interface LayoutRoom {
  kind: RoomKind;
  name: string;
  rects: Rect[];
  /** For a bath: the bedroom it belongs to. */
  of?: number;
}

/** A door between two rooms (or a room and outside), and how wide, in feet. */
export interface LayoutDoor {
  a: number;
  b: number | 'out';
  widthFt: number;
  /** A doorway with no door (lounge to dining, the stair). */
  open?: boolean;
  /** The main entrance. */
  main?: boolean;
}

export interface Layout {
  /** The building area used: width along the road and depth, in plan units. */
  W: number;
  D: number;
  rooms: LayoutRoom[];
  doors: LayoutDoor[];
  /** Lower is better. */
  score: number;
  /** What could be better, in plain words. */
  notes: string[];
  /** Tells plans apart: the rooms' order in each strip. */
  key: string;
}

const ft = (f: number) => (f * MM_PER_FOOT) / MM_PER_UNIT;
const sqft = (units2: number) => (units2 * MM_PER_UNIT * MM_PER_UNIT) / (MM_PER_FOOT * MM_PER_FOOT);
const rw = (r: Rect) => r.x1 - r.x0;
const rd = (r: Rect) => r.y1 - r.y0;
const areaOf = (room: LayoutRoom) => room.rects.reduce((s, r) => s + rw(r) * rd(r), 0);

export function sizeOf(program: Program, kind: SizedKind): RoomSize {
  const own = program.sizes?.[kind];
  const base = DEFAULT_SIZES[kind];
  return own ? { w: own.w, d: own.d, minW: Math.min(base.minW, own.w) } : base;
}

/** The rooms a program asks for, bedrooms (the master first) with their attached baths. */
function roomsOf(program: Program): { kind: SizedKind; name: string; bath?: boolean }[] {
  const out: { kind: SizedKind; name: string; bath?: boolean }[] = [];
  if (program.basement) {
    out.push({ kind: 'lounge', name: 'Hall' });
    if (program.gym) out.push({ kind: 'gym', name: ROOM_NAMES.gym });
    if (program.servant) out.push({ kind: 'servant', name: ROOM_NAMES.servant, bath: true });
    for (const k of ['store', 'laundry', 'powder', 'stair'] as const)
      if (program[k]) out.push({ kind: k, name: ROOM_NAMES[k] });
    return out;
  }
  const beds = Math.max(0, Math.min(8, Math.round(program.bedrooms)));
  if (program.upper) {
    for (let i = 0; i < beds; i++)
      out.push({
        kind: i === 0 ? 'master' : 'bed',
        name: i === 0 ? ROOM_NAMES.master : `Bedroom ${i + 1}`,
        bath: i < program.attachedBaths,
      });
    out.push({ kind: 'lounge', name: 'TV lounge' });
    for (const k of ['prayer', 'store', 'laundry', 'powder'] as const)
      if (program[k]) out.push({ kind: k, name: ROOM_NAMES[k] });
    return out;
  }
  for (let i = 0; i < beds; i++)
    out.push({
      kind: i === 0 ? 'master' : 'bed',
      name: i === 0 ? ROOM_NAMES.master : `Bedroom ${i + 1}`,
      bath: i < program.attachedBaths,
    });
  if (program.drawing) out.push({ kind: 'drawing', name: ROOM_NAMES.drawing });
  out.push({ kind: 'lounge', name: ROOM_NAMES.lounge });
  out.push({ kind: 'kitchen', name: ROOM_NAMES.kitchen });
  if (program.dining) out.push({ kind: 'dining', name: ROOM_NAMES.dining });
  if (program.porch) out.push({ kind: 'porch', name: ROOM_NAMES.porch });
  for (const k of ['prayer', 'store', 'laundry', 'servant', 'stair', 'powder'] as const)
    if (program[k]) out.push({ kind: k, name: ROOM_NAMES[k] });
  return out;
}

/** Roughly how much covered area the rooms need (sq ft), with a tenth more for walls. */
export function programArea(program: Program): number {
  let total = 0;
  for (const r of roomsOf(program)) {
    const s = sizeOf(program, r.kind);
    total += s.w * s.d;
    if (r.bath) {
      const b = sizeOf(program, 'bath');
      total += b.w * b.d;
    }
  }
  return total * 1.1;
}

/** Which strip each kind of room may go in, the likeliest first. */
const BANDS: Record<SizedKind, ('front' | 'middle' | 'back')[]> = {
  porch: ['front'],
  drawing: ['front', 'middle'],
  master: ['back', 'middle'],
  bed: ['back', 'middle', 'front'],
  bath: ['back'],
  lounge: ['middle'],
  dining: ['middle', 'front'],
  kitchen: ['middle', 'back', 'front'],
  stair: ['middle', 'front'],
  prayer: ['middle', 'front', 'back'],
  store: ['middle', 'back', 'front'],
  laundry: ['middle', 'back'],
  powder: ['middle', 'front'],
  servant: ['back', 'front', 'middle'],
  gym: ['back', 'middle', 'front'],
};

/** How readily a room takes spare width. */
const GROWTH: Partial<Record<RoomKind, number>> = {
  lounge: 3,
  drawing: 2,
  master: 2,
  bed: 1.5,
  dining: 1.5,
  kitchen: 1,
  servant: 0.8,
  porch: 0.3,
  stair: 0,
  bath: 0,
};

/** Rooms that want daylight from an outside wall, and how much it matters. */
const DAYLIGHT: Partial<Record<RoomKind, number>> = {
  master: 4,
  bed: 4,
  kitchen: 3,
  drawing: 3,
  lounge: 2.5,
  dining: 1,
  servant: 1,
};

/** A small repeatable random number maker, so "Try again" gives new plans and tests stay the same. */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface Item {
  kind: SizedKind;
  name: string;
  size: RoomSize;
  bath?: boolean;
  /** Area (sq ft) the room's own bath adds. */
  extra: number;
}

/** A column of a strip: one room, or two small ones stacked. */
type Column = Item[];

/** Sizes are to wall centre lines: this much more keeps the inside of a room at its size. */
const WALL_ALLOW = ft(0.4);

const SMALL = (it: Item) => it.size.w * it.size.d <= 50 && it.kind !== 'porch';

/** Widths for a strip's columns filling W: each at least its narrowest, spare width to those that grow. */
function widths(cols: Column[], depth: number, W: number): number[] | null {
  const min = cols.map((c) => Math.max(...c.map((it) => ft(it.size.minW) + WALL_ALLOW)));
  const want = cols.map((c, i) => {
    // A column of stacked rooms is as wide as the widest; a room is its area over the strip's depth.
    if (c.length > 1) return Math.max(min[i], ...c.map((it) => ft(it.size.w)));
    const it = c[0];
    const area = ft(it.size.w) * ft(it.size.d) + it.extra * ft(1) * ft(1);
    const w = it.kind === 'porch' || it.kind === 'stair' ? ft(it.size.w) : area / depth;
    return Math.max(min[i], w);
  });
  const sumMin = min.reduce((a, b) => a + b, 0);
  if (sumMin > W + 1e-6) return null;
  const sumWant = want.reduce((a, b) => a + b, 0);
  if (sumWant > W) {
    // Squeeze towards the narrowest each may be.
    const t = (W - sumMin) / (sumWant - sumMin || 1);
    return want.map((w, i) => min[i] + (w - min[i]) * t);
  }
  const grow = cols.map((c) => (c.length > 1 ? 0.2 : (GROWTH[c[0].kind] ?? 0.5)));
  const g = grow.reduce((a, b) => a + b, 0) || 1;
  return want.map((w, i) => w + ((W - sumWant) * grow[i]) / g);
}

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Stack small rooms two to a column (randomly paired), the rest one each. */
function columnsOf(items: Item[], rand: () => number): Column[] {
  const small = items.filter(SMALL);
  const big = items.filter((it) => !SMALL(it));
  const cols: Column[] = big.map((it) => [it]);
  const s = shuffle(small, rand);
  for (let i = 0; i < s.length; i += 2) cols.push(s.slice(i, i + 2));
  return cols;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);

/** A stair's column across the plan: its own width, out to the plan's edge when that leaves less than 5'. */
function stairColumn(stair: Rect, W: number): [number, number] {
  const x0 = Math.max(0, stair.x0);
  const x1 = Math.min(W, stair.x1);
  return [x0 < ft(5) ? 0 : x0, W - x1 < ft(5) ? W : x1];
}

/**
 * A strip's columns shared out over its stretches (one, or two either side of a stair), each
 * stretch filled: their widths, or null when they can't be shared so that every stretch fits.
 */
function splitColumns(
  cols: Column[],
  stretches: [number, number][],
  depth: number,
  rand: () => number,
): { cols: Column[]; ws: number[]; x0: number; x1: number }[] | null {
  if (stretches.length === 1) {
    const [x0, x1] = stretches[0];
    const ws = widths(cols, depth, x1 - x0);
    return ws ? [{ cols, ws, x0, x1 }] : null;
  }
  const [[a0, a1], [b0, b1]] = stretches;
  for (const k of shuffle(
    cols.map((_, i) => i).filter((i) => i > 0),
    rand,
  )) {
    const left = cols.slice(0, k);
    const right = cols.slice(k);
    const wl = widths(left, depth, a1 - a0);
    const wr = widths(right, depth, b1 - b0);
    if (wl && wr)
      return [
        { cols: left, ws: wl, x0: a0, x1: a1 },
        { cols: right, ws: wr, x0: b0, x1: b1 },
      ];
  }
  return null;
}

/** The length two rooms share along a wall. */
export function shared(a: LayoutRoom, b: LayoutRoom): number {
  let best = 0;
  const eps = 1e-6;
  for (const r of a.rects)
    for (const s of b.rects) {
      if (Math.abs(r.x1 - s.x0) < eps || Math.abs(s.x1 - r.x0) < eps)
        best = Math.max(best, overlap(r.y0, r.y1, s.y0, s.y1));
      if (Math.abs(r.y1 - s.y0) < eps || Math.abs(s.y1 - r.y0) < eps)
        best = Math.max(best, overlap(r.x0, r.x1, s.x0, s.x1));
    }
  return best;
}

/** How much of a room's edge lies on the outside of the building area (sides: front is the road side). */
export function outside(room: LayoutRoom, W: number, D: number, sides = { front: true, back: true, ends: true }) {
  let len = 0;
  const eps = 1e-6;
  for (const r of room.rects) {
    if (sides.front && r.y0 < eps) len += rw(r);
    if (sides.back && r.y1 > D - eps) len += rw(r);
    if (sides.ends && r.x0 < eps) len += rd(r);
    if (sides.ends && r.x1 > W - eps) len += rd(r);
  }
  return len;
}

/**
 * One candidate plan from a set of random choices, or null when the rooms don't fit. `stair` (a first
 * floor's) is where the stair is: it gets a column of its own, as deep as the strips it reaches into.
 */
function candidate(program: Program, W: number, D: number, rand: () => number, stair?: Rect): Layout | null {
  const hallX = stair ? stairColumn(stair, W) : null;
  const bathSize = sizeOf(program, 'bath');
  const items: Item[] = roomsOf(program).map((r) => ({
    ...r,
    size: sizeOf(program, r.kind),
    extra: r.bath ? bathSize.w * bathSize.d : 0,
  }));
  const band: Record<'front' | 'middle' | 'back', Item[]> = { front: [], middle: [], back: [] };
  const used = { front: 0, middle: 0, back: 0 };
  // Big rooms first; each goes in the first strip it may use that has width left (small rooms
  // count half, as two stack in one column), now and then trying another strip first.
  const order = [...items].sort((a, b) => b.size.minW * b.size.d - a.size.minW * a.size.d);
  for (const it of order) {
    let prefs = BANDS[it.kind];
    if (prefs.length > 1 && rand() < 0.2) prefs = [...prefs.slice(1), prefs[0]];
    const need = ft(it.size.minW) * (SMALL(it) ? 0.5 : 1);
    // (A strip the stair's column cuts across has less, which laying it out finds.)
    const choice = prefs.find((b) => used[b] + need <= W + 1e-6);
    if (!choice) return null;
    used[choice] += need;
    band[choice].push(it);
  }

  const depthOf = (list: Item[], jiggle: number) =>
    list.length ? Math.max(...list.filter((it) => !SMALL(it)).map((it) => ft(it.size.d)), ft(8)) * jiggle : 0;
  const passageW = ft(3.5);
  const withPassage = band.back.length > 1 && rand() < 0.6;
  let dF = depthOf(band.front, 0.9 + rand() * 0.2);
  let dB = depthOf(band.back, 0.9 + rand() * 0.2);
  const passage = withPassage ? passageW : 0;
  let dM = D - dF - dB - passage;
  const minMid = band.middle.length ? ft(10) : 0;
  const hasPorch = band.front.some((it) => it.kind === 'porch');
  // Where the middle strip is short, the back strip gives first (down to 10'), then the front (down
  // to a full 18' porch, or 9'), and last the porch (down to 16').
  const steps: [() => number, (v: number) => void, number][] = [
    [() => dB, (v) => (dB = v), ft(10)],
    [() => dF, (v) => (dF = v), hasPorch ? ft(18.5) : ft(9)],
    [() => dF, (v) => (dF = v), hasPorch ? ft(16) : ft(9)],
  ];
  for (const [get, put, floor] of steps) {
    if (dM >= minMid) break;
    const give = Math.min(Math.max(0, get() - floor), minMid - dM);
    put(get() - give);
    dM += give;
  }
  if (dM < minMid - 1e-6) return null;
  if (!band.middle.length) {
    // Nothing for the middle: the other strips share the depth.
    const total = dF + dB || 1;
    dF = ((D - passage) * dF) / total;
    dM = 0;
  }
  if (stair) {
    // Strips meet the stair's ends where they nearly do, so no sliver is left beside it.
    const near = (y: number) => [stair.y0, stair.y1].find((e) => Math.abs(e - y) < ft(3) && e > 1e-6 && e < D - 1e-6);
    const deep = ft(7.5);
    const f = band.front.length ? near(dF) : undefined;
    if (f !== undefined && f >= deep && (!band.middle.length || dF + dM - f >= deep)) {
      if (band.middle.length) dM += dF - f;
      dF = f;
    }
    const m = band.middle.length ? near(dF + dM) : undefined;
    if (m !== undefined && m - dF >= deep && D - m - passage >= (band.back.length ? deep : 0)) dM = m - dF;
  }
  // The stair's column runs through every strip the stair reaches into.
  const yB = dF + dM + passage;
  const strips: [number, number][] = [
    [0, dF],
    [dF, dF + dM],
    [dF + dM, yB],
    [yB, D],
  ];
  const hits = stair ? strips.filter(([a, b]) => b - a > 1e-6 && overlap(a, b, stair.y0, stair.y1) > 1e-6) : [];
  if (stair && !hits.length) return null;
  const hall: Rect | null =
    hallX && hits.length
      ? { x0: hallX[0], x1: hallX[1], y0: Math.min(...hits.map((h) => h[0])), y1: Math.max(...hits.map((h) => h[1])) }
      : null;
  /** The stretches across the plan a strip from y0 to y1 has for rooms: either side of the stair's column. */
  const stretches = (y0: number, y1: number): [number, number][] =>
    hall && overlap(y0, y1, hall.y0, hall.y1) > 1e-6
      ? (
          [
            [0, hall.x0],
            [hall.x1, W],
          ] as [number, number][]
        ).filter(([a, b]) => b - a > 1e-6)
      : [[0, W]];

  const rooms: LayoutRoom[] = [];
  const keyParts: string[] = [];
  const layBand = (list: Item[], y0: number, depth: number, name: string) => {
    if (!list.length) return true;
    let cols = columnsOf(list, rand);
    cols = shuffle(cols, rand);
    // The porch goes at one end, where a car can drive in.
    const p = cols.findIndex((c) => c[0].kind === 'porch');
    if (p >= 0) {
      const [porch] = cols.splice(p, 1);
      if (rand() < 0.5) cols.unshift(porch);
      else cols.push(porch);
    }
    const groups = splitColumns(cols, stretches(y0, y0 + depth), depth, rand);
    if (!groups) return false;
    keyParts.push(
      `${name}:${groups.map((g) => g.cols.map((c) => c.map((it) => it.kind).join('+')).join(',')).join('/')}`,
    );
    for (const g of groups) layColumns(g, y0, depth, name);
    return true;
  };
  const layColumns = (
    g: { cols: Column[]; ws: number[]; x0: number; x1: number },
    y0: number,
    depth: number,
    name: string,
  ) => {
    const { cols, ws } = g;
    let x = g.x0;
    cols.forEach((col, i) => {
      const x1 = i === cols.length - 1 ? g.x1 : x + ws[i];
      // Stacked rooms split the depth by their own depths.
      const total = col.reduce((s, it) => s + it.size.d, 0);
      let y = y0;
      col.forEach((it, j) => {
        const y1 = j === col.length - 1 ? y0 + depth : y + (depth * it.size.d) / total;
        const cell = { x0: x, y0: y, x1, y1 };
        const index = rooms.length;
        if (it.bath) {
          const b = sizeOf(program, 'bath');
          const bathName =
            it.kind === 'master'
              ? 'Master bath'
              : it.kind === 'servant'
                ? 'Servant bath'
                : `Bath ${it.name.replace(/\D+/g, '') || index}`;
          const left = rand() < 0.5;
          const atFar = name !== 'front';
          const bw = Math.max(ft(b.minW), Math.min(ft(b.w), rw(cell)));
          const bd = Math.min(ft(b.d), rd(cell) - ft(8));
          // In the corner away from the middle of the house (with a strip of bedroom beside it), or
          // failing that as a strip down one side of the room.
          const corner = bd >= ft(5) && rw(cell) - bw >= 0 && rand() < 0.7;
          const sideOk = rw(cell) - bw >= ft(9) - 1e-6;
          if (corner || !sideOk) {
            if (bd < ft(4.5)) {
              rooms.push({ kind: it.kind, name: it.name, rects: [cell] });
              y = y1;
              return;
            }
            const bx0 = left ? cell.x0 : cell.x1 - bw;
            const by0 = atFar ? cell.y1 - bd : cell.y0;
            const bath = { x0: bx0, y0: by0, x1: bx0 + bw, y1: by0 + bd };
            const main = atFar ? { ...cell, y1: cell.y1 - bd } : { ...cell, y0: cell.y0 + bd };
            const rest = rw(cell) - bw;
            const side = left
              ? { x0: bx0 + bw, y0: by0, x1: cell.x1, y1: by0 + bd }
              : { x0: cell.x0, y0: by0, x1: bx0, y1: by0 + bd };
            rooms.push({ kind: it.kind, name: it.name, rects: rest >= ft(3) ? [main, side] : [main] });
            // A bath with less than 3' of room beside it takes the whole width.
            if (rest < ft(3)) bath.x0 = cell.x0;
            if (rest < ft(3)) bath.x1 = cell.x1;
            rooms.push({ kind: 'bath', name: bathName, rects: [bath], of: index });
          } else {
            const bath = left ? { ...cell, x1: cell.x0 + bw } : { ...cell, x0: cell.x1 - bw };
            const main = left ? { ...cell, x0: cell.x0 + bw } : { ...cell, x1: cell.x1 - bw };
            rooms.push({ kind: it.kind, name: it.name, rects: [main] });
            rooms.push({ kind: 'bath', name: bathName, rects: [bath], of: index });
          }
        } else rooms.push({ kind: it.kind, name: it.name, rects: [cell] });
        y = y1;
      });
      x = x1;
    });
  };
  if (!layBand(band.front, 0, dF, 'front')) return null;
  if (!layBand(band.middle, dF, dM, 'middle')) return null;
  if (withPassage)
    rooms.push({
      kind: 'passage',
      name: ROOM_NAMES.passage,
      rects: stretches(dF + dM, yB).map(([x0, x1]) => ({ x0, y0: dF + dM, x1, y1: yB })),
    });
  if (!layBand(band.back, yB, D - yB, 'back')) return null;
  keyParts.push(withPassage ? 'passage' : '');
  if (hall && stair) {
    // The stair's room is where the stair (or its room) is below; the rest of its column is a
    // landing, and a sliver of less than 3' goes with the stair's room.
    const v = {
      x0: Math.max(hall.x0, stair.x0),
      x1: Math.min(hall.x1, stair.x1),
      y0: Math.max(hall.y0, stair.y0),
      y1: Math.min(hall.y1, stair.y1),
    };
    const pieces: Rect[] = [
      { ...hall, y1: v.y0 },
      { ...hall, y0: v.y1 },
      { x0: hall.x0, x1: v.x0, y0: v.y0, y1: v.y1 },
      { x0: v.x1, x1: hall.x1, y0: v.y0, y1: v.y1 },
    ].filter((r) => rw(r) > 1e-6 && rd(r) > 1e-6);
    const wide = pieces.filter((r) => Math.min(rw(r), rd(r)) >= ft(3));
    rooms.push({ kind: 'stair', name: ROOM_NAMES.stair, rects: [v, ...pieces.filter((r) => !wide.includes(r))] });
    // Pieces beside the stair join those in front of and behind it into one landing.
    const sides = wide.some((r) => r.y0 >= v.y0 - 1e-6 && r.y1 <= v.y1 + 1e-6);
    const groups = sides ? [wide] : wide.map((r) => [r]);
    for (const g of groups.filter((g) => g.length))
      rooms.push({ kind: 'passage', name: 'Landing', rects: [...g].sort((a, b) => rw(b) * rd(b) - rw(a) * rd(a)) });
    keyParts.push(`hall:${hits.length}:${wide.length}`);
  }
  return scorePlan({ W, D, rooms, doors: [], score: 0, notes: [], key: keyParts.join('|') }, program);
}

/** Room kinds a room may be entered from, the best first. */
const ENTERED_FROM: Record<RoomKind, RoomKind[]> = {
  lounge: [],
  passage: ['lounge'],
  drawing: ['lounge', 'passage'],
  dining: ['lounge', 'passage', 'drawing'],
  kitchen: ['dining', 'lounge', 'passage'],
  master: ['passage', 'lounge', 'stair'],
  bed: ['passage', 'lounge', 'stair', 'dining'],
  bath: [],
  stair: ['lounge', 'passage', 'dining'],
  prayer: ['lounge', 'passage', 'dining', 'drawing'],
  store: ['kitchen', 'lounge', 'passage', 'dining', 'stair'],
  laundry: ['kitchen', 'passage', 'lounge'],
  powder: ['lounge', 'passage', 'stair', 'drawing', 'dining'],
  servant: ['kitchen', 'passage', 'lounge'],
  porch: [],
  gym: ['lounge', 'passage', 'stair'],
  terrace: [],
};

/** On a first floor everything starts from the stair: the TV lounge and passage open off it. */
const UPPER_FROM: Partial<Record<RoomKind, RoomKind[]>> = {
  lounge: ['stair', 'passage'],
  passage: ['stair', 'lounge'],
  master: ['passage', 'lounge', 'stair'],
  bed: ['passage', 'lounge', 'stair'],
  prayer: ['lounge', 'passage', 'stair'],
  store: ['lounge', 'passage', 'stair'],
  laundry: ['passage', 'lounge', 'stair'],
  powder: ['lounge', 'passage', 'stair'],
};

/** Rooms nobody should have to walk through. */
const THROUGH_NOT = new Set<RoomKind>([
  'bath',
  'porch',
  'master',
  'bed',
  'store',
  'powder',
  'laundry',
  'prayer',
  'servant',
  'gym',
]);

const DOOR_FT: Partial<Record<RoomKind, number>> = { bath: 2.5, store: 2.5, powder: 2.5, laundry: 2.5 };

/**
 * The plan's doors and its score. The lounge is the heart of the house: the main entrance reaches it
 * from the porch or the road side; each room opens onto the best neighbour it may be entered from;
 * a bath opens off its bedroom. Rooms that can't be reached count heavily against the plan.
 */
function scorePlan(plan: Layout, program: Program): Layout {
  const { rooms, W, D } = plan;
  const doors: LayoutDoor[] = [];
  const notes: string[] = [];
  let score = 0;
  const idx = (kind: RoomKind) => rooms.findIndex((r) => r.kind === kind);
  const lounge = idx('lounge');
  const porch = idx('porch');
  const need = (w: number) => ft(w + 2);

  // The main entrance: from the porch, or the road side, into the lounge; failing that, through the
  // drawing room. A basement is entered by its stair, which opens onto its hall.
  const drawing = idx('drawing');
  const basement = !!program.basement;
  const upper = !!program.upper;
  const roadSide = (i: number) => outside(rooms[i], W, D, { front: true, back: false, ends: false });
  let viaDrawing = false;
  if (basement || upper) {
    // No way in from outside to find.
  } else if (porch >= 0 && shared(rooms[porch], rooms[lounge]) >= need(3.5))
    doors.push({ a: lounge, b: porch, widthFt: 3.5, main: true });
  else if (roadSide(lounge) >= need(3.5)) doors.push({ a: lounge, b: 'out', widthFt: 3.5, main: true });
  else if (drawing >= 0 && shared(rooms[drawing], rooms[lounge]) >= need(3)) {
    viaDrawing = true;
    score += 3;
    notes.push('The way in is through the drawing room.');
  } else {
    score += 40;
    notes.push('The lounge has no way in from outside.');
  }
  // The drawing room has its own door from outside (or the porch), for guests.
  if (drawing >= 0) {
    const main = viaDrawing ? { main: true } : {};
    if (porch >= 0 && shared(rooms[drawing], rooms[porch]) >= need(3.5))
      doors.push({ a: drawing, b: porch, widthFt: 3.5, ...main });
    else if (roadSide(drawing) >= need(3.5) || outside(rooms[drawing], W, D) >= need(3.5))
      doors.push({ a: drawing, b: 'out', widthFt: 3.5, ...main });
    else if (viaDrawing) {
      score += 40;
      notes.push('The house has no way in from outside.');
    }
  }

  // A first floor is reached up its stair.
  const stair = idx('stair');
  const linked = new Set<number>([upper ? stair : lounge]);
  if (porch >= 0) linked.add(porch);
  // Rooms join in order, so a kitchen can open off a dining room joined before it.
  const order = [
    ...(upper ? ['lounge'] : []),
    'passage',
    'drawing',
    'dining',
    'kitchen',
    'stair',
    'master',
    'bed',
    'prayer',
    'powder',
    'store',
    'laundry',
    'servant',
    'gym',
  ];
  const pending = rooms
    .map((_, i) => i)
    .filter((i) => !linked.has(i) && i !== porch && rooms[i].kind !== 'bath' && (upper || i !== lounge));
  pending.sort((a, b) => order.indexOf(rooms[a].kind) - order.indexOf(rooms[b].kind));
  for (let pass = 0; pass < 2; pass++)
    for (const i of pending) {
      if (linked.has(i)) continue;
      const room = rooms[i];
      const width = DOOR_FT[room.kind] ?? 3;
      let joined = false;
      for (const fromKind of (upper && UPPER_FROM[room.kind]) || ENTERED_FROM[room.kind]) {
        const j = rooms.findIndex((r, k) => r.kind === fromKind && linked.has(k) && shared(room, r) >= need(width));
        if (j < 0) continue;
        const open =
          (room.kind === 'dining' && fromKind === 'lounge') ||
          room.kind === 'stair' ||
          room.kind === 'passage' ||
          (room.kind === 'lounge' && fromKind === 'stair');
        doors.push({
          a: j,
          b: i,
          widthFt: open ? Math.min(5, shared(room, rooms[j]) / ft(1) - 2) : width,
          ...(open ? { open } : {}),
        });
        linked.add(i);
        joined = true;
        break;
      }
      if (!joined && pass === 1) {
        if (room.kind === 'servant' && outside(room, W, D) >= need(3)) {
          doors.push({ a: i, b: 'out', widthFt: 3 });
          linked.add(i);
          continue;
        }
        // Last resort: through any room already joined that isn't private or a bath.
        const via = rooms.findIndex(
          (r, k) => linked.has(k) && !THROUGH_NOT.has(r.kind) && shared(room, r) >= need(width),
        );
        if (via >= 0) {
          doors.push({ a: via, b: i, widthFt: width });
          linked.add(i);
          score += 6;
          notes.push(`${room.name} opens off the ${rooms[via].name.toLowerCase()}.`);
          continue;
        }
        score += 40;
        notes.push(`${room.name} can't be reached.`);
      }
    }
  if (upper && lounge >= 0 && stair >= 0 && shared(rooms[lounge], rooms[stair]) < need(3)) {
    score += 3;
    notes.push('The TV lounge isn’t by the stair.');
  }
  // Baths open off their bedroom.
  rooms.forEach((r, i) => {
    if (r.kind !== 'bath' || r.of === undefined) return;
    if (shared(r, rooms[r.of]) >= need(2.5)) doors.push({ a: r.of, b: i, widthFt: 2.5 });
    else {
      score += 40;
      notes.push(`${r.name} can't be reached.`);
    }
  });

  // Sizes and shapes against what was asked for.
  for (const r of rooms) {
    if (r.kind === 'passage' || r.kind === 'terrace') continue;
    const want = sizeOf(program, r.kind);
    const got = sqft(areaOf(r));
    const target = want.w * want.d;
    const off = (got - target) / target;
    score += off < 0 ? -off * 6 : Math.max(0, off - 0.3) * 1.5;
    const main = r.rects[0];
    const narrow = Math.min(rw(main), rd(main));
    const long = Math.max(rw(main), rd(main));
    if (narrow < ft(want.minW) + WALL_ALLOW - 1e-6 && r.kind !== 'porch') {
      score += 5 + ((ft(want.minW) + WALL_ALLOW - narrow) / ft(1)) * 2;
      if (off < -0.25) notes.push(`${r.name} is small (${Math.round(got)} sq ft).`);
    }
    if (long / Math.max(narrow, 1) > 2.2 && r.kind !== 'porch' && r.kind !== 'stair')
      score += (long / narrow - 2.2) * 3;
  }
  // Daylight: rooms that want it on an outside wall (not onto the porch). None in a basement.
  for (const r of basement ? [] : rooms) {
    const weight = DAYLIGHT[r.kind];
    if (!weight) continue;
    if (outside(r, W, D) < ft(4)) {
      score += weight;
      if (weight >= 3) notes.push(`${r.name} has no outside wall for a window.`);
    }
  }
  // The kitchen by the dining room or lounge.
  const kitchen = idx('kitchen');
  const dining = idx('dining');
  if (
    kitchen >= 0 &&
    !((dining >= 0 && shared(rooms[kitchen], rooms[dining]) > ft(2)) || shared(rooms[kitchen], rooms[lounge]) > ft(2))
  ) {
    score += 4;
    notes.push('The kitchen isn’t next to the dining room or lounge.');
  }
  // The drawing room near the entrance, away from the bedrooms.
  if (drawing >= 0 && rooms.some((r) => (r.kind === 'master' || r.kind === 'bed') && shared(r, rooms[drawing]) > 0))
    score += 1;
  return { ...plan, doors, notes, score };
}

/**
 * The best plans for a program in a W × D building area (plan units), that differ from each other:
 * `tries` random ones are made from `seed`, and the best of each arrangement kept.
 */
const UNREACHED = (note: string) => /can't be reached|no way in/.test(note);

export function generateLayouts(
  program: Program,
  W: number,
  D: number,
  opts: { seed?: number; count?: number; tries?: number } = {},
): Layout[] {
  const rand = rng(opts.seed ?? 1);
  const best = new Map<string, Layout>();
  const tries = opts.tries ?? 1500;
  for (let i = 0; i < tries; i++) {
    const plan = candidate(program, W, D, rand);
    if (!plan) continue;
    const have = best.get(plan.key);
    if (!have || plan.score < have.score) best.set(plan.key, plan);
  }
  return bestOf(best, opts.count ?? 3);
}

/** The best plans kept, that differ in more than the order of small rooms. */
function bestOf(best: Map<string, Layout>, count: number): Layout[] {
  // Plans with a room that can't be reached come last (shown only when nothing better fits).
  const ranked = [...best.values()].sort(
    (a, b) => Number(a.notes.some(UNREACHED)) - Number(b.notes.some(UNREACHED)) || a.score - b.score,
  );
  const out: Layout[] = [];
  const coarse = (p: Layout) => p.key.replace(/\+?(store|laundry|powder|prayer)/g, '');
  for (const p of ranked) {
    if (out.length >= count) break;
    if (out.some((q) => coarse(q) === coarse(p))) continue;
    out.push(p);
  }
  for (const p of ranked) {
    if (out.length >= count) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** A straight wall of the floor below, in the plan's frame: along x at y = at ('h'), or along y at x = at ('v'). */
export interface GroundLine {
  dir: 'h' | 'v';
  at: number;
  from: number;
  to: number;
}

/** What a first floor is planned over, in the plan's frame (see `upperSite` in `layoutBuild.ts`). */
export interface Ground {
  /**
   * Where the stair is: the stair's room below (to its walls' centre lines) when it is open to the
   * first floor (`open`), else a little more than the stair itself. The first floor's stair room is this.
   */
  stair: Rect;
  /** The stair's room below is left open to the first floor, as its stair well. */
  open?: boolean;
  /** How deep the terrace in front is (none: 0): the rooms go behind it. */
  terrace: number;
  /** The baths, kitchens and laundries below. */
  wet?: Rect[];
  /** The walls below. */
  lines?: GroundLine[];
}

/**
 * First-floor plans over a ground floor whose building area is W × D (plan units): the rooms behind
 * a terrace `ground.terrace` deep, round the stair where it is on the ground floor. Plans whose
 * baths sit over the wet rooms below and whose walls stand on the walls below score better.
 */
export function generateUpperLayouts(
  program: Program,
  W: number,
  D: number,
  ground: Ground,
  opts: { seed?: number; count?: number; tries?: number } = {},
): Layout[] {
  const off = Math.max(0, Math.min(ground.terrace, ground.stair.y0));
  const shift = (r: Rect): Rect => ({ ...r, y0: r.y0 - off, y1: r.y1 - off });
  const stair = shift(ground.stair);
  const wet = (ground.wet ?? []).map(shift);
  const lines = (ground.lines ?? []).map((l) =>
    l.dir === 'h' ? { ...l, at: l.at - off } : { ...l, from: l.from - off, to: l.to - off },
  );
  const rand = rng(opts.seed ?? 1);
  const best = new Map<string, Layout>();
  const tries = opts.tries ?? 1500;
  const upper = { ...program, upper: true, basement: false, stair: false };
  for (let i = 0; i < tries; i++) {
    const plan = candidate(upper, W, D - off, rand, stair);
    if (!plan) continue;
    const fitted = overGround(plan, wet, lines);
    const have = best.get(fitted.key);
    if (!have || fitted.score < have.score) best.set(fitted.key, fitted);
  }
  return bestOf(best, opts.count ?? 3).map((plan) => withTerrace(plan, off, D));
}

/** How well a first floor sits on the floor below: baths over wet rooms, walls over walls. */
function overGround(plan: Layout, wet: Rect[], lines: GroundLine[]): Layout {
  const { W, D, rooms } = plan;
  const eps = 1e-6;
  let score = plan.score;
  const notes = [...plan.notes];
  // Baths, guest baths and laundries over the wet rooms below.
  const wetKinds = new Set<RoomKind>(['bath', 'powder', 'laundry']);
  const wetRooms = rooms.filter((r) => wetKinds.has(r.kind));
  const over = (r: LayoutRoom) =>
    r.rects.reduce(
      (sum, a) =>
        sum +
        wet.reduce(
          (s, b) => s + Math.max(0, overlap(a.x0, a.x1, b.x0, b.x1)) * Math.max(0, overlap(a.y0, a.y1, b.y0, b.y1)),
          0,
        ),
      0,
    ) >=
    areaOf(r) * 0.3;
  const dry = wetRooms.filter((r) => !over(r));
  score += dry.length * 1.5;
  if (wet.length && wetRooms.length && dry.length === wetRooms.length)
    notes.push('No bath is over a bath or kitchen below.');
  // Inside walls standing on walls below (each room's edges, so a wall counts from both its sides).
  if (lines.length) {
    const near = ft(0.75);
    let loose = 0;
    for (const room of rooms)
      for (const r of room.rects) {
        const edges: GroundLine[] = [
          { dir: 'h', at: r.y0, from: r.x0, to: r.x1 },
          { dir: 'h', at: r.y1, from: r.x0, to: r.x1 },
          { dir: 'v', at: r.x0, from: r.y0, to: r.y1 },
          { dir: 'v', at: r.x1, from: r.y0, to: r.y1 },
        ];
        for (const e of edges) {
          const edgeOfPlan = e.dir === 'h' ? e.at < eps || e.at > D - eps : e.at < eps || e.at > W - eps;
          if (edgeOfPlan) continue;
          const held = lines
            .filter((l) => l.dir === e.dir && Math.abs(l.at - e.at) <= near)
            .reduce(
              (s, l) => s + Math.max(0, overlap(e.from, e.to, Math.min(l.from, l.to), Math.max(l.from, l.to))),
              0,
            );
          loose += Math.max(0, e.to - e.from - held);
        }
      }
    score += (loose / ft(10)) * 0.3;
  }
  return { ...plan, score, notes };
}

/** A first floor's plan moved back behind its terrace, with the terrace and a door out to it. */
function withTerrace(plan: Layout, off: number, D: number): Layout {
  if (off <= 1e-6) return plan;
  const rooms: LayoutRoom[] = plan.rooms.map((room) => ({
    ...room,
    rects: room.rects.map((r) => ({ ...r, y0: r.y0 + off, y1: r.y1 + off })),
  }));
  const terrace = rooms.length;
  rooms.push({ kind: 'terrace', name: ROOM_NAMES.terrace, rects: [{ x0: 0, y0: 0, x1: plan.W, y1: off }] });
  const doors = [...plan.doors];
  // Out from the TV lounge, or else the passage, the stair or a bedroom.
  for (const kind of ['lounge', 'passage', 'stair', 'master', 'bed'] as RoomKind[]) {
    const i = rooms.findIndex((r) => r.kind === kind && shared(r, rooms[terrace]) >= ft(5));
    if (i < 0) continue;
    doors.push({ a: i, b: terrace, widthFt: 3 });
    break;
  }
  return { ...plan, D, rooms, doors };
}

/** The plan turned left for right. */
export function mirrorLayout(plan: Layout): Layout {
  const flip = (r: Rect): Rect => ({ x0: plan.W - r.x1, y0: r.y0, x1: plan.W - r.x0, y1: r.y1 });
  return { ...plan, rooms: plan.rooms.map((room) => ({ ...room, rects: room.rects.map(flip) })) };
}

export { ft as feetToUnits, sqft as unitsToSqFt };
