/**
 * Floor plans from a room list: the rooms are laid out in three strips across the plot (front:
 * porch and drawing room; middle: lounge, dining, kitchen, stair and small rooms; back: bedrooms
 * with their baths), with a passage when the back rooms can't all open onto the lounge. Many ways
 * of ordering and sizing the strips are tried; each is scored on the plan hints' rules (every room
 * reached through doors, daylight on an outside wall, kitchen by the dining room or lounge, room
 * sizes and shapes) and the best few that differ are kept. Pure; all lengths in plan units, in a
 * frame with x along the road and y going in from it (0 at the road side of the building area).
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
  | 'passage';

/** Kinds of room with a size the owner can set. */
export type SizedKind = Exclude<RoomKind, 'passage'>;

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
  passage: 'Passage',
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
  const beds = Math.max(0, Math.min(8, Math.round(program.bedrooms)));
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

/** One candidate plan from a set of random choices, or null when the rooms don't fit. */
function candidate(program: Program, W: number, D: number, rand: () => number): Layout | null {
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
    const ws = widths(cols, depth, W);
    if (!ws) return false;
    keyParts.push(`${name}:${cols.map((c) => c.map((it) => it.kind).join('+')).join(',')}`);
    let x = 0;
    cols.forEach((col, i) => {
      const x1 = i === cols.length - 1 ? W : x + ws[i];
      // Stacked rooms split the depth by their own depths.
      const total = col.reduce((s, it) => s + it.size.d, 0);
      let y = y0;
      col.forEach((it, j) => {
        const y1 = j === col.length - 1 ? y0 + depth : y + (depth * it.size.d) / total;
        const cell = { x0: x, y0: y, x1, y1 };
        const index = rooms.length;
        if (it.bath) {
          const b = sizeOf(program, 'bath');
          const bathName = it.kind === 'master' ? 'Master bath' : `Bath ${it.name.replace(/\D+/g, '') || index}`;
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
    return true;
  };
  if (!layBand(band.front, 0, dF, 'front')) return null;
  if (!layBand(band.middle, dF, dM, 'middle')) return null;
  if (withPassage)
    rooms.push({
      kind: 'passage',
      name: ROOM_NAMES.passage,
      rects: [{ x0: 0, y0: dF + dM, x1: W, y1: dF + dM + passage }],
    });
  if (!layBand(band.back, dF + dM + passage, D - dF - dM - passage, 'back')) return null;
  keyParts.push(withPassage ? 'passage' : '');
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

  // The main entrance: from the porch, or the road side, into the lounge; failing that, through the drawing room.
  const drawing = idx('drawing');
  const roadSide = (i: number) => outside(rooms[i], W, D, { front: true, back: false, ends: false });
  let viaDrawing = false;
  if (porch >= 0 && shared(rooms[porch], rooms[lounge]) >= need(3.5))
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

  const linked = new Set<number>([lounge]);
  if (porch >= 0) linked.add(porch);
  // Rooms join in order, so a kitchen can open off a dining room joined before it.
  const order = [
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
  ];
  const pending = rooms.map((_, i) => i).filter((i) => i !== lounge && i !== porch && rooms[i].kind !== 'bath');
  pending.sort((a, b) => order.indexOf(rooms[a].kind) - order.indexOf(rooms[b].kind));
  for (let pass = 0; pass < 2; pass++)
    for (const i of pending) {
      if (linked.has(i)) continue;
      const room = rooms[i];
      const width = DOOR_FT[room.kind] ?? 3;
      let joined = false;
      for (const fromKind of ENTERED_FROM[room.kind]) {
        const j = rooms.findIndex((r, k) => r.kind === fromKind && linked.has(k) && shared(room, r) >= need(width));
        if (j < 0) continue;
        const open =
          (room.kind === 'dining' && fromKind === 'lounge') || room.kind === 'stair' || room.kind === 'passage';
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
    if (r.kind === 'passage') continue;
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
  // Daylight: rooms that want it on an outside wall (not onto the porch).
  for (const r of rooms) {
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
  if (!(
    (dining >= 0 && shared(rooms[kitchen], rooms[dining]) > ft(2)) ||
    shared(rooms[kitchen], rooms[lounge]) > ft(2)
  )) {
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
  // Plans with a room that can't be reached come last (shown only when nothing better fits).
  const ranked = [...best.values()].sort(
    (a, b) => Number(a.notes.some(UNREACHED)) - Number(b.notes.some(UNREACHED)) || a.score - b.score,
  );
  // Keep plans that differ in more than the order of small rooms.
  const out: Layout[] = [];
  const coarse = (p: Layout) => p.key.replace(/\+?(store|laundry|powder|prayer)/g, '');
  for (const p of ranked) {
    if (out.length >= (opts.count ?? 3)) break;
    if (out.some((q) => coarse(q) === coarse(p))) continue;
    out.push(p);
  }
  for (const p of ranked) {
    if (out.length >= (opts.count ?? 3)) break;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** The plan turned left for right. */
export function mirrorLayout(plan: Layout): Layout {
  const flip = (r: Rect): Rect => ({ x0: plan.W - r.x1, y0: r.y0, x1: plan.W - r.x0, y1: r.y1 });
  return { ...plan, rooms: plan.rooms.map((room) => ({ ...room, rects: room.rects.map(flip) })) };
}

export { ft as feetToUnits, sqft as unitsToSqFt };
