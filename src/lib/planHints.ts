/**
 * Plan hints: good-practice advice on the layout, not bylaws. Can every room be reached through
 * doors? Do the living rooms get daylight? Are rooms a comfortable size for their name? Pure: plan
 * in, hints out. Rooms are recognised by their names.
 */
import { pointInPolygon } from '../geometry';
import { WET_ROOM } from './bylaws';
import { mumtyLevelIds, PORCH_ROOM } from './planCheck';
import { boxOf, cellFor, GridIndex } from './spatial';
import { MM_PER_UNIT } from './scale';
import { formatArea, formatLength, MM_PER_FOOT } from './units';
import { polygonArea, roomAreaSqMm, wallFaces } from '../rooms';
import {
  levelOf,
  type Id,
  type Opening,
  type PlanDoc,
  type Point,
  type Room,
  type Stair,
  type Units,
  type Wall,
} from '../types';
import { thicknessOf } from '../walls';

export type HintKind = 'reach' | 'daylight' | 'size' | 'layout';

export interface Hint {
  id: string;
  kind: HintKind;
  text: string;
  /** Rooms (and items) to select to see it. */
  ids: Id[];
}

/** Spaces open to the sky or the garden: they count as outside. */
const OUTDOOR = /porch|lawn|garden|court|terrace|veranda|verandah|balcony|patio|drive|yard/i;
/** A name that means this kind of room, unless it is a bath or WC ("Guest bath", "Master bath"). */
const dry = (re: RegExp) => ({ test: (name: string) => re.test(name) && !WET_ROOM.test(name) });
const BEDROOM = dry(/bed|guest|master/i);
/** Rooms that shouldn't be reached only through a bedroom. */
const MAIN_ROOM = dry(/bed|guest|kitchen|lounge|living|drawing|dining|study|family/i);
/** Rooms that want daylight and fresh air from an outside wall. */
const DAYLIGHT = dry(/bed|guest|drawing|lounge|living|dining|kitchen|study|family/i);
const KITCHEN = /kitchen/i;
const SITTING = /dining|lounge|living|family/i;
const PRAYER = /prayer|namaz|musall/i;
const WET = { test: (name: string) => WET_ROOM.test(name) || KITCHEN.test(name) };

/** Good-practice sizes by room name: the first that matches applies. */
export const GOOD_SIZES: {
  names: { test: (name: string) => boolean };
  label: string;
  sqft: number;
  widthFt: number;
  lengthFt?: number;
}[] = [
  { names: /bath|toilet|washroom|shower|ensuite|en-suite/i, label: 'a bathroom', sqft: 35, widthFt: 5 },
  { names: dry(/master/i), label: 'a master bedroom', sqft: 150, widthFt: 11 },
  { names: BEDROOM, label: 'a bedroom', sqft: 120, widthFt: 10 },
  { names: /drawing/i, label: 'a drawing room', sqft: 150, widthFt: 11 },
  { names: /lounge|living|family|\btv\b/i, label: 'a lounge', sqft: 150, widthFt: 11 },
  { names: /dining/i, label: 'a dining room', sqft: 100, widthFt: 9 },
  { names: KITCHEN, label: 'a kitchen', sqft: 70, widthFt: 7 },
  { names: PORCH_ROOM, label: 'a car porch (one car)', sqft: 162, widthFt: 9, lengthFt: 18 },
];

const SQ_MM_PER_SQ_FT = 92903.04;
/** Window height when not set (4'). */
const WINDOW_MM = 1219.2;
/** How far past a wall's face to look for the space on each side (plan units). */
const REACH = 3;
/** Most points tested along one wall for an outside face. */
const MAX_SAMPLES = 64;

/** A room's box: its shorter and longer side, in plan units. */
function boxSides(pts: Point[]): [number, number] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w < h ? [w, h] : [h, w];
}

/** The points just past each face of a wall, at a point p on it. */
function sidesAt(w: Wall, p: Point): [Point, Point] {
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1;
  const d = thicknessOf(w) / 2 + REACH;
  const n = { x: (-(w.y2 - w.y1) / len) * d, y: ((w.x2 - w.x1) / len) * d };
  return [
    { x: p.x + n.x, y: p.y + n.y },
    { x: p.x - n.x, y: p.y - n.y },
  ];
}

/** Whether any point just outside polygon a (up to `gap` away) falls in polygon b: they share a wall. */
function touches(a: Point[], b: Point[], gap: number): boolean {
  for (let i = 0; i < a.length; i++) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const n = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
    for (const t of [0.15, 0.35, 0.5, 0.65, 0.85])
      for (const s of [gap, -gap]) {
        const m = { x: p.x + (q.x - p.x) * t + n.x * s, y: p.y + (q.y - p.y) * t + n.y * s };
        if (pointInPolygon(m, b)) return true;
      }
  }
  return false;
}

/** Hints for the whole plan. Rooms in `skipSizes` (already too small for the bylaws) get no size hint. */
export function planHints(doc: PlanDoc, ctx: { units: Units; skipSizes?: Set<Id> }): Hint[] {
  const hints: Hint[] = [];
  const len = (mm: number) => formatLength(mm, ctx.units);
  const area = (sqMm: number) => formatArea(sqMm, ctx.units);
  const mumtys = mumtyLevelIds(doc);
  const wallById = new Map(doc.elements.filter((el): el is Wall => el.type === 'wall').map((w) => [w.id, w] as const));

  doc.levels.forEach((level, index) => {
    const rooms = doc.rooms.filter((r) => !r.hidden && levelOf(r) === level.id);
    if (!rooms.length) return;
    const indoor = rooms.filter((r) => !OUTDOOR.test(r.name));
    const walls = doc.elements.filter(
      (el): el is Wall => el.type === 'wall' && !el.hidden && !el.kind && levelOf(el) === level.id,
    );
    const openings = doc.elements.filter(
      (el): el is Opening =>
        (el.type === 'door' || el.type === 'window') && !el.hidden && !el.gate && levelOf(el) === level.id,
    );
    // The smallest room a point is in; outdoor rooms and unnamed space count as outside ("out").
    const bySize = [...rooms].sort((a, b) => polygonArea(a.points) - polygonArea(b.points));
    const boxes = bySize.map((r) => boxOf(r.points));
    const roomIndex = new GridIndex<Room>(cellFor(boxes));
    bySize.forEach((r, i) => roomIndex.add(r, boxes[i]));
    const roomAt = (p: Point): Room | null => roomIndex.at(p).find((r) => pointInPolygon(p, r.points)) ?? null;
    const nodeAt = (p: Point): Id => {
      const r = roomAt(p);
      return r && !OUTDOOR.test(r.name) ? r.id : 'out';
    };
    const names = new Map(rooms.map((r) => [r.id, r.name] as const));
    const name = (id: Id) => names.get(id) ?? '';
    // On an upper floor, say which.
    const on = (text: string) => (index > 0 ? `${level.name}: ${text}` : text);

    // Doors join the spaces on either side.
    const links: { door: Id; a: Id; b: Id }[] = [];
    for (const o of openings) {
      const w = wallById.get(o.wallId);
      if (o.type !== 'door' || !w) continue;
      const [p, q] = sidesAt(w, o);
      const a = nodeAt(p);
      const b = nodeAt(q);
      if (a !== b) links.push({ door: o.id, a, b });
    }
    const adjacent = new Map<Id, Id[]>();
    for (const l of links) {
      adjacent.set(l.a, [...(adjacent.get(l.a) ?? []), l.b]);
      adjacent.set(l.b, [...(adjacent.get(l.b) ?? []), l.a]);
    }
    const neighbours = (id: Id) => adjacent.get(id) ?? [];
    const walk = (starts: Id[], avoid: (id: Id) => boolean) => {
      const seen = new Set<Id>(starts);
      const queue = [...starts];
      for (let head = 0; head < queue.length; head++) {
        const id = queue[head];
        for (const n of neighbours(id))
          if (!seen.has(n)) {
            seen.add(n);
            if (!avoid(n)) queue.push(n);
          }
      }
      return seen;
    };

    // Where you arrive on this floor: outside on the ground floor, the stairs above it.
    let starts: Id[];
    let from = 'the entrance';
    if (index === 0) {
      starts = ['out'];
      if (links.length && !links.some((l) => l.a === 'out' || l.b === 'out')) {
        hints.push({
          id: `no-entrance-${level.id}`,
          kind: 'reach',
          text: `${level.name}: no door leads outside (an entrance).`,
          ids: [],
        });
        starts = [];
      }
    } else {
      const below = doc.levels[index - 1]?.id;
      const stairs = doc.elements.filter(
        (el): el is Stair => el.type === 'stair' && !el.hidden && (levelOf(el) === level.id || levelOf(el) === below),
      );
      starts = [...new Set(stairs.map((s) => nodeAt(s)))];
      from = 'the stairs';
      if (!stairs.length) {
        hints.push({ id: `no-stair-${level.id}`, kind: 'reach', text: `No stair reaches the ${level.name}.`, ids: [] });
      }
    }

    const doored = new Set(links.flatMap((l) => [l.a, l.b]));
    for (const r of indoor)
      if (!doored.has(r.id))
        hints.push({ id: `no-door-${r.id}`, kind: 'reach', text: on(`${r.name} has no door.`), ids: [r.id] });
    if (starts.length) {
      const reached = walk(starts, () => false);
      for (const r of indoor) {
        if (!doored.has(r.id)) continue;
        if (!reached.has(r.id)) {
          hints.push({
            id: `unreached-${r.id}`,
            kind: 'reach',
            text: on(`${r.name} can't be reached from ${from}.`),
            ids: [r.id],
          });
          continue;
        }
        if (!MAIN_ROOM.test(r.name)) continue;
        // Reached only by walking through a bedroom?
        const around = walk(starts, (id) => id !== r.id && BEDROOM.test(name(id)));
        if (around.has(r.id)) continue;
        const via = neighbours(r.id).find((n) => BEDROOM.test(name(n)) && reached.has(n));
        hints.push({
          id: `through-${r.id}`,
          kind: 'reach',
          text: on(`${r.name} is only reached through ${via ? name(via) : 'a bedroom'}.`),
          ids: via ? [r.id, via] : [r.id],
        });
      }
    }

    // Prayer rooms opening onto a bath or kitchen.
    for (const l of links) {
      const [p, other] = PRAYER.test(name(l.a)) ? [l.a, l.b] : PRAYER.test(name(l.b)) ? [l.b, l.a] : [null, null];
      if (p && other && WET.test(name(other)))
        hints.push({
          id: `prayer-${l.door}`,
          kind: 'layout',
          text: on(`${name(p)} opens onto ${name(other)}.`),
          ids: [p, other, l.door],
        });
    }

    // Kitchens next to the dining room or lounge (a shared wall or a door).
    const sitting = indoor.filter((r) => SITTING.test(r.name) && !KITCHEN.test(r.name));
    const gap = Math.max(0, ...walls.map(thicknessOf)) + REACH * 2;
    if (sitting.length)
      for (const k of indoor.filter((r) => KITCHEN.test(r.name) && !SITTING.test(r.name))) {
        const byDoor = neighbours(k.id).some((n) => sitting.some((s) => s.id === n));
        if (byDoor || sitting.some((s) => touches(k.points, s.points, gap) || touches(s.points, k.points, gap)))
          continue;
        hints.push({
          id: `kitchen-${k.id}`,
          kind: 'layout',
          text: on(`${k.name} isn't next to the dining room or lounge.`),
          ids: [k.id],
        });
      }

    // Daylight: an outside wall, a window in it, and window area of a tenth of the floor.
    if (!mumtys.has(level.id)) {
      const faces = wallFaces(walls);
      const faceBoxes = faces.map(boxOf);
      const faceIndex = new GridIndex<Point[]>(cellFor(faceBoxes));
      faces.forEach((f, i) => faceIndex.add(f, faceBoxes[i]));
      const outside = (p: Point) => {
        const r = roomAt(p);
        if (r) return OUTDOOR.test(r.name);
        return !faceIndex.at(p).some((f) => pointInPolygon(p, f));
      };
      // Rooms with an outside wall, and the glass opening each room onto the outside: found once for all.
      const outer = new Set<Id>();
      for (const w of walls) {
        const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
        const steps = Math.min(MAX_SAMPLES, Math.max(2, Math.ceil(L / 30)));
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const [p, q] = sidesAt(w, { x: w.x1 + (w.x2 - w.x1) * t, y: w.y1 + (w.y2 - w.y1) * t });
          const rp = roomAt(p);
          const rq = roomAt(q);
          if (rp && outside(q)) outer.add(rp.id);
          if (rq && outside(p)) outer.add(rq.id);
        }
      }
      const glass = new Map<Id, number>();
      for (const o of openings) {
        const w = wallById.get(o.wallId);
        if (o.type !== 'window' || !w || (o.flat && !o.open)) continue;
        const [p, q] = sidesAt(w, o);
        const sqMm = o.width * MM_PER_UNIT * (o.heightMm ?? WINDOW_MM) * (o.shape === 'circle' ? Math.PI / 4 : 1);
        for (const [inner, other] of [
          [p, q],
          [q, p],
        ]) {
          const r = roomAt(inner);
          if (r && outside(other)) glass.set(r.id, (glass.get(r.id) ?? 0) + sqMm);
        }
      }
      for (const r of indoor.filter((x) => DAYLIGHT.test(x.name))) {
        const outerWall = outer.has(r.id);
        const glassSqMm = glass.get(r.id) ?? 0;
        const floor = roomAreaSqMm(r);
        if (!outerWall && !glassSqMm)
          hints.push({
            id: `inner-${r.id}`,
            kind: 'daylight',
            text: on(`${r.name} has no outside wall, so no window or fresh air.`),
            ids: [r.id],
          });
        else if (!glassSqMm)
          hints.push({
            id: `no-window-${r.id}`,
            kind: 'daylight',
            text: on(`${r.name} has an outside wall but no window.`),
            ids: [r.id],
          });
        else if (glassSqMm < floor / 10 - 1)
          hints.push({
            id: `small-window-${r.id}`,
            kind: 'daylight',
            text: on(
              `${r.name}'s windows are about ${area(glassSqMm)}, less than a tenth of its floor (${area(floor)}).`,
            ),
            ids: [r.id],
          });
      }
    }

    // Good-practice sizes.
    for (const r of rooms) {
      if (ctx.skipSizes?.has(r.id)) continue;
      const g = GOOD_SIZES.find((s) => s.names.test(r.name));
      if (!g) continue;
      const floor = roomAreaSqMm(r);
      const [short, long] = boxSides(r.points).map((u) => u * MM_PER_UNIT);
      const minW = g.widthFt * MM_PER_FOOT;
      const minL = (g.lengthFt ?? 0) * MM_PER_FOOT;
      if (floor >= g.sqft * SQ_MM_PER_SQ_FT - 1 && short >= minW - 5 && long >= minL - 5) continue;
      const want = g.lengthFt ? `${len(minW)} × ${len(minL)}` : `${area(g.sqft * SQ_MM_PER_SQ_FT)}, ${len(minW)} wide`;
      hints.push({
        id: `size-${r.id}`,
        kind: 'size',
        text: on(`${r.name} is small for ${g.label} (${want}): about ${area(floor)}, ${len(short)} wide.`),
        ids: [r.id],
      });
    }
  });
  return hints;
}
