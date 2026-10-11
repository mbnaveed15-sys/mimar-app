/**
 * Checks for non-residential buildings (offices, schools, clinics, shops, mosques): how many people
 * each floor holds, and whether its exits, stairs, corridors, doors and toilets are enough for them.
 * The figures follow the Building Code of Pakistan (Fire Safety Provisions 2016), which takes them
 * from the International Building Code, and the Accessibility Code of Pakistan (2006). They are
 * good practice measured from the drawing, not an authority's approval. Pure.
 */
import {
  GROUND_LEVEL,
  levelOf,
  type BuildingUse,
  type Furniture,
  type Id,
  type Level,
  type Opening,
  type PlanDoc,
  type Point,
  type Room,
  type Stair,
} from '../types';
import { roomAreaSqMm } from '../rooms';
import { MM_PER_UNIT } from './scale';
import type { Hint } from './planHints';

/** Floor area per person (m²) by room name, the first match winning; 0 = not counted (circulation, toilets). */
const LOAD_BY_NAME: [RegExp, number][] = [
  [/toilet|\bwc\b|wash|bath|wudu|ablution|shaft|lift|elevator|stair|corridor|passage|lobby|duct|electric|plant/i, 0],
  [/store|stock|server|archive/i, 28],
  [/class/i, 1.9],
  [/lab|library|reading/i, 4.6],
  [/meeting|conference|board|waiting|assembly|canteen|cafeteria|dining/i, 1.4],
  [/prayer|musall|namaz/i, 0.65],
  [/sales|shop|retail|showroom/i, 2.8],
  [/kitchen|pantry/i, 18.6],
  [/consult|treatment|exam|pharmacy|ward|clinic/i, 9.3],
  [/office|staff|manager|principal|reception|admin|work/i, 9.3],
];

/** Area per person for rooms whose name says nothing, by the building's use (m²). */
const LOAD_BY_USE: Record<BuildingUse, number> = {
  office: 9.3,
  school: 1.9,
  clinic: 9.3,
  shop: 2.8,
  mosque: 0.65,
  other: 9.3,
};

/** People per WC: the first `first` people at `firstPer` each, the rest at `per`. */
const WC_RULE: Record<BuildingUse, { firstPer: number; first: number; per: number }> = {
  office: { firstPer: 25, first: 50, per: 50 },
  school: { firstPer: 50, first: 0, per: 50 },
  clinic: { firstPer: 25, first: 0, per: 25 },
  shop: { firstPer: 500, first: 0, per: 500 },
  mosque: { firstPer: 150, first: 0, per: 150 },
  other: { firstPer: 25, first: 50, per: 50 },
};

/** Exit door width per person (mm), and stair width per person. */
const DOOR_MM_PER_PERSON = 5;
const STAIR_MM_PER_PERSON = 7.6;
/** Narrowest stair: 1100 mm once 50 people use it, 900 mm below that. */
const STAIR_MIN_MM = 1100;
const STAIR_MIN_SMALL_MM = 900;
/** Narrowest corridor: 1100 mm; 1800 mm in a school corridor serving 100 people or more. */
const CORRIDOR_MIN_MM = 1100;
const SCHOOL_CORRIDOR_MIN_MM = 1800;
/** Narrowest door on the way out (leaf width), so its clear opening takes a wheelchair. */
const DOOR_MIN_MM = 900;
/** Longest straight-line distance from any room to an exit (the walk itself may be up to 60 m). */
const TRAVEL_MAX_MM = 45000;
/** An accessible toilet needs a 1.5 m turning circle. */
const ACCESSIBLE_MIN_MM = 1500;

const CORRIDOR = /corridor|passage|lobby|gallery|hall(way)?\b/i;
const PRAYER_HALL = /prayer hall/i;
const TOILET = /toilet|\bwc\b|wash|bath/i;
const ACCESSIBLE = /accessible|disabled|wheelchair|\bada\b/i;
const LIFT = /lift|elevator/i;

/** How many people a room holds by its name and the building's use. */
export function occupantsOf(room: Pick<Room, 'name' | 'points'>, use: BuildingUse): number {
  const name = room.name ?? '';
  if (CORRIDOR.test(name) && !PRAYER_HALL.test(name)) return 0;
  const per = LOAD_BY_NAME.find(([re]) => re.test(name))?.[1] ?? LOAD_BY_USE[use];
  if (!per) return 0;
  return Math.ceil(roomAreaSqMm(room as Room) / 1e6 / per);
}

/** How many exits a floor needs for this many people. */
export const exitsNeeded = (people: number) => (people > 1000 ? 4 : people > 500 ? 3 : people >= 50 ? 2 : 1);

/** How many WCs a building needs for this many people. */
export function wcsNeeded(people: number, use: BuildingUse): number {
  if (people <= 0) return 0;
  const r = WC_RULE[use];
  const first = Math.min(people, r.first);
  return Math.ceil(first / r.firstPer) + Math.ceil((people - first) / r.per);
}

/** A room's box: its shorter side (plan units). */
function shortSide(pts: Point[]): number {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

/** What the plan hints worked out about one floor: its rooms and the doors between spaces ('out' is outside). */
export interface FloorInfo {
  level: Level;
  index: number;
  rooms: Room[];
  links: { door: Id; a: Id; b: Id }[];
  on: (text: string) => string;
}

/** The building-use hints: exits, stairs, corridors, doors, travel distance, toilets and access. */
export function buildingUseHints(
  doc: PlanDoc,
  use: BuildingUse,
  floors: FloorInfo[],
  len: (mm: number) => string,
): Hint[] {
  const hints: Hint[] = [];
  const shown = <T extends { hidden?: boolean }>(el: T) => !el.hidden;
  const stairs = doc.elements.filter((el): el is Stair => el.type === 'stair' && shown(el));
  const doors = new Map(
    doc.elements
      .filter((el): el is Opening => el.type === 'door' && shown(el) && !el.gate)
      .map((d) => [d.id, d] as const),
  );
  let total = 0;
  const levels = doc.levels;

  for (const { level, index, rooms, links, on } of floors) {
    const people = rooms.reduce((n, r) => n + occupantsOf(r, use), 0);
    total += people;
    if (!people) continue;
    const names = new Map(rooms.map((r) => [r.id, r.name] as const));

    // Ways out: doors to outside on the ground floor; the stairs elsewhere.
    const ground = level.id === GROUND_LEVEL;
    const below = levels[index - 1]?.id;
    const exitDoors = links
      .filter((l) => l.a === 'out' || l.b === 'out')
      .map((l) => doors.get(l.door)!)
      .filter(Boolean);
    // A stair is drawn on the floor it climbs from: a basement's own go up, an upper floor's come from below.
    const floorStairs = stairs.filter((s) => levelOf(s) === level.id || (!level.basement && levelOf(s) === below));
    const exits: { at: Point; widthMm: number; stair: boolean }[] = ground
      ? exitDoors.map((d) => ({ at: d, widthMm: d.width * MM_PER_UNIT, stair: false }))
      : floorStairs.map((s) => ({ at: s, widthMm: s.width * MM_PER_UNIT, stair: true }));
    const need = exitsNeeded(people);
    const about = `about ${people} ${people === 1 ? 'person' : 'people'}`;
    if (exits.length < need)
      hints.push({
        id: `use-exits-${level.id}`,
        kind: 'use',
        text: on(
          `${level.name} holds ${about}: it needs ${need} ${ground ? 'exits to outside' : 'stairs down'} (it has ${exits.length}), as far apart as you can.`,
        ),
        ids: ground ? exitDoors.map((d) => d.id) : floorStairs.map((s) => s.id),
      });
    if (exits.length) {
      const per = exits.some((e) => e.stair) ? STAIR_MM_PER_PERSON : DOOR_MM_PER_PERSON;
      const want = Math.ceil(people * per);
      const have = exits.reduce((w, e) => w + e.widthMm, 0);
      if (have + 1 < want)
        hints.push({
          id: `use-exit-width-${level.id}`,
          kind: 'use',
          text: on(
            `The ${ground ? 'exit doors' : 'stairs'} of the ${level.name.toLowerCase()} add up to ${len(have)} wide; ${about} need ${len(want)}.`,
          ),
          ids: ground ? exitDoors.map((d) => d.id) : floorStairs.map((s) => s.id),
        });
    }

    // Stairs on this floor wide enough for the people using them.
    const stairMin = people >= 50 ? STAIR_MIN_MM : STAIR_MIN_SMALL_MM;
    const narrowStairs = stairs.filter(
      (s) => levelOf(s) === level.id && s.shape !== 'ramp' && s.width * MM_PER_UNIT + 1 < stairMin,
    );
    if (narrowStairs.length)
      hints.push({
        id: `use-stair-width-${level.id}`,
        kind: 'use',
        text: on(`A stair is narrower than ${len(stairMin)} (the least for ${about}).`),
        ids: narrowStairs.map((s) => s.id),
      });

    // Corridors.
    const corridorMin = use === 'school' && people >= 100 ? SCHOOL_CORRIDOR_MIN_MM : CORRIDOR_MIN_MM;
    for (const r of rooms)
      if (CORRIDOR.test(r.name) && !PRAYER_HALL.test(r.name) && shortSide(r.points) * MM_PER_UNIT + 1 < corridorMin)
        hints.push({
          id: `use-corridor-${r.id}`,
          kind: 'use',
          text: on(
            `${r.name} is ${len(shortSide(r.points) * MM_PER_UNIT)} wide; a corridor wants at least ${len(corridorMin)}.`,
          ),
          ids: [r.id],
        });

    // Doors on the way out wide enough for a wheelchair (not those into toilet stalls).
    const narrow = links
      .filter((l) => !TOILET.test(names.get(l.a) ?? '') && !TOILET.test(names.get(l.b) ?? ''))
      .map((l) => doors.get(l.door))
      .filter((d): d is Opening => !!d && d.width * MM_PER_UNIT + 1 < DOOR_MIN_MM);
    if (narrow.length)
      hints.push({
        id: `use-doors-${level.id}`,
        kind: 'use',
        text: on(
          narrow.length === 1
            ? `A door is narrower than ${len(DOOR_MIN_MM)}, too tight for a wheelchair.`
            : `${narrow.length} doors are narrower than ${len(DOOR_MIN_MM)}, too tight for a wheelchair.`,
        ),
        ids: narrow.map((d) => d.id),
      });

    // Distance from the far corner of each room to the nearest exit, in a straight line.
    if (exits.length) {
      let worst: { room: Room; mm: number } | null = null;
      for (const r of rooms) {
        const far = Math.max(
          ...r.points.map((p) => Math.min(...exits.map((e) => Math.hypot(p.x - e.at.x, p.y - e.at.y)))),
        );
        const mm = far * MM_PER_UNIT;
        if (mm > TRAVEL_MAX_MM && (!worst || mm > worst.mm)) worst = { room: r, mm };
      }
      if (worst)
        hints.push({
          id: `use-travel-${level.id}`,
          kind: 'use',
          text: on(
            `${worst.room.name} is ${len(Math.round(worst.mm / 1000) * 1000)} from the nearest ${ground ? 'exit' : 'stair'} in a straight line: keep it under ${len(TRAVEL_MAX_MM)}, or add another way out.`,
          ),
          ids: [worst.room.id],
        });
    }
  }
  if (!total) return hints;

  // Toilets for the whole building.
  const allRooms = floors.flatMap((f) => f.rooms);
  const wcs = doc.elements.filter(
    (el): el is Furniture => el.type === 'furniture' && shown(el) && (el.kind === 'wc' || el.kind === 'wc-indian'),
  ).length;
  const needWcs = wcsNeeded(total, use);
  const toilets = allRooms.filter((r) => TOILET.test(r.name));
  if (!toilets.length && !wcs)
    hints.push({
      id: 'use-toilets',
      kind: 'use',
      text: `No toilets: about ${total} people need ${needWcs} ${needWcs === 1 ? 'WC' : 'WCs'}.`,
      ids: [],
    });
  else if (!wcs)
    hints.push({
      id: 'use-wcs',
      kind: 'use',
      text: `Put WCs in the toilets (Furniture › Bath) to check them: about ${total} people need ${needWcs}.`,
      ids: toilets.map((r) => r.id),
    });
  else if (wcs < needWcs)
    hints.push({
      id: 'use-wcs',
      kind: 'use',
      text: `About ${total} people need ${needWcs} WCs; ${wcs} ${wcs === 1 ? 'is' : 'are'} drawn.`,
      ids: toilets.map((r) => r.id),
    });

  // Access for wheelchair users.
  const accessible = allRooms.filter((r) => ACCESSIBLE.test(r.name) && TOILET.test(r.name));
  if (!accessible.length)
    hints.push({
      id: 'use-accessible-toilet',
      kind: 'use',
      text: `No accessible toilet: name one "Accessible toilet", at least ${len(ACCESSIBLE_MIN_MM)} each way inside.`,
      ids: [],
    });
  else
    for (const r of accessible)
      if (shortSide(r.points) * MM_PER_UNIT + 1 < ACCESSIBLE_MIN_MM)
        hints.push({
          id: `use-accessible-size-${r.id}`,
          kind: 'use',
          text: `${r.name} is ${len(shortSide(r.points) * MM_PER_UNIT)} across: a wheelchair needs ${len(ACCESSIBLE_MIN_MM)} to turn.`,
          ids: [r.id],
        });
  const ramp = stairs.some((s) => s.shape === 'ramp' && levelOf(s) === GROUND_LEVEL);
  if (doc.plinthMm > 0 && !ramp)
    hints.push({
      id: 'use-ramp',
      kind: 'use',
      text: `The entrance is ${len(doc.plinthMm)} above the ground: add a ramp (Stairs, Ramp shape) for wheelchair users.`,
      ids: [],
    });
  const upper = floors.some((f) => f.index > 0 && !f.level.basement && f.rooms.some((r) => occupantsOf(r, use) > 0));
  if (upper && use !== 'mosque' && !allRooms.some((r) => LIFT.test(r.name)))
    hints.push({
      id: 'use-lift',
      kind: 'use',
      text: 'No lift: people in wheelchairs can only use the ground floor. Name a room "Lift" where one goes.',
      ids: [],
    });
  return hints;
}
