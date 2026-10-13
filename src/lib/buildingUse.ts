/**
 * Checks for non-residential buildings (offices, schools, clinics, shops, mosques): how many people
 * each floor holds, and whether its exits, stairs, corridors, doors and toilets are enough for them.
 * The figures follow the Building Code of Pakistan (Fire Safety Provisions 2016), which takes them
 * from the International Building Code, and the Accessibility Code of Pakistan (2006). They are
 * good practice measured from the drawing, not an authority's approval. Pure.
 */
import {
  GROUND_LEVEL,
  SITE_LEVEL,
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
import { buildingLevels, groundIndex } from './levels';
import { MM_PER_UNIT } from './scale';
import type { Hint } from './planHints';
import type { CheckRow } from './planCheck';

/** Floor area per person (m²) by room name, the first match winning; 0 = not counted (circulation, toilets). */
const LOAD_BY_NAME: [RegExp, number][] = [
  [/toilet|\bwc\b|wash|bath|wudu|ablution|shaft|lift|elevator|stair|corridor|passage|lobby|duct|electric|plant/i, 0],
  [/warehouse|godown|loading/i, 46.5],
  [/store|stock|server|archive/i, 28],
  [/guest room|bedroom|suite|private room|flat\b|apartment|dorm/i, 18.6],
  [/banquet|wedding|marriage|function|community|main hall|sports hall|exam hall|lecture|stage/i, 1.4],
  [/workshop|production|factory/i, 9.3],
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
  hospital: 22.3,
  restaurant: 1.4,
  hotel: 18.6,
  apartments: 18.6,
  hall: 1.4,
  factory: 9.3,
  warehouse: 46.5,
  other: 9.3,
};

/** People per WC: the first `first` people at `firstPer` each, the rest at `per`. */
const WC_RULE: Record<BuildingUse, { firstPer: number; first: number; per: number }> = {
  office: { firstPer: 25, first: 50, per: 50 },
  school: { firstPer: 50, first: 0, per: 50 },
  clinic: { firstPer: 25, first: 0, per: 25 },
  shop: { firstPer: 500, first: 0, per: 500 },
  mosque: { firstPer: 150, first: 0, per: 150 },
  hospital: { firstPer: 25, first: 0, per: 25 },
  restaurant: { firstPer: 75, first: 0, per: 75 },
  // One WC per guest room (about two guests), and per flat (about five people).
  hotel: { firstPer: 2, first: 0, per: 2 },
  apartments: { firstPer: 5, first: 0, per: 5 },
  hall: { firstPer: 125, first: 0, per: 125 },
  factory: { firstPer: 100, first: 0, per: 100 },
  warehouse: { firstPer: 100, first: 0, per: 100 },
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
/** A hospital corridor that beds are wheeled along: 2400 mm. */
const HOSPITAL_CORRIDOR_MIN_MM = 2400;
/** Narrowest door on the way out (leaf width), so its clear opening takes a wheelchair. */
const DOOR_MIN_MM = 900;
/** Longest straight-line distance from any room to an exit (the walk itself may be up to 60 m). */
const TRAVEL_MAX_MM = 45000;
/** An accessible toilet needs a 1.5 m turning circle. */
const ACCESSIBLE_MIN_MM = 1500;

/** Library items that count as a WC. */
const WC_KINDS = new Set<string>(['wc', 'wc-indian', 'wc-cubicle', 'accessible-wc']);

const CORRIDOR = /corridor|passage|lobby|gallery|hall(way)?\b/i;
/** Halls people gather in, not passages. */
const PRAYER_HALL =
  /(prayer|banquet|wedding|marriage|main|function|dining|assembly|sports|exam|community|lecture) hall/i;
const TOILET = /toilet|\bwc\b|wash|bath/i;
const ACCESSIBLE = /accessible|disabled|wheelchair|\bada\b/i;
export const LIFT = /lift|elevator/i;

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
  const levels = buildingLevels(doc);

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
          `${level.name} holds ${about}: it needs ${need} ${ground ? (need === 1 ? 'exit to outside' : 'exits to outside') : need === 1 ? 'stair down' : 'stairs down'} (it has ${exits.length}), as far apart as you can.`,
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
    const corridorMin =
      use === 'hospital'
        ? HOSPITAL_CORRIDOR_MIN_MM
        : use === 'school' && people >= 100
          ? SCHOOL_CORRIDOR_MIN_MM
          : CORRIDOR_MIN_MM;
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
    (el): el is Furniture => el.type === 'furniture' && shown(el) && !!el.kind && WC_KINDS.has(el.kind),
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
      id: 'use-wcs-none',
      kind: 'use',
      text: `Put WCs in the toilets (Furniture › Toilets) to check them: about ${total} people need ${needWcs}.`,
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
  const accessibleWc = doc.elements.some((el) => el.type === 'furniture' && shown(el) && el.kind === 'accessible-wc');
  if (!accessible.length && !accessibleWc)
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
  // A ramp up the plinth is drawn on the ground floor or on the Ground (site) level.
  const ramp = stairs.some((s) => s.shape === 'ramp' && (levelOf(s) === GROUND_LEVEL || levelOf(s) === SITE_LEVEL));
  if (doc.plinthMm > 0 && !ramp)
    hints.push({
      id: 'use-ramp',
      kind: 'use',
      text: `The entrance is ${len(doc.plinthMm)} above the ground: add a ramp (Stairs, Ramp shape) for wheelchair users.`,
      ids: [],
    });
  if (needsLift(doc, use) && !allRooms.some((r) => LIFT.test(r.name)))
    hints.push({
      id: 'use-lift',
      kind: 'use',
      text: 'No lift: people in wheelchairs can only use the ground floor. Name a room "Lift" where one goes.',
      ids: [],
    });
  return hints;
}

/** People use an upper floor (not a basement), so a lift is wanted (a mosque's upper hall aside). */
function needsLift(doc: PlanDoc, use: BuildingUse): boolean {
  if (use === 'mosque') return false;
  const upper = new Set(doc.levels.filter((l, i) => i > groundIndex(doc) && !l.basement).map((l) => l.id));
  return doc.rooms.some((r) => !r.hidden && upper.has(levelOf(r)) && occupantsOf(r, use) > 0);
}

/** Hints that ask for something to be drawn before it can be checked: their rows are to check, not failed. */
const TO_DRAW = new Set(['use-wcs-none']);

/**
 * Which rows apply to this building at all: stairs only with a stair drawn, a ramp only with a
 * raised entrance, a lift only with people upstairs. The others say why they aren't needed.
 */
export function rowsNotNeeded(doc: PlanDoc, use: BuildingUse): Record<string, string | null> {
  const stairs = doc.elements.some((el) => el.type === 'stair' && !el.hidden && el.shape !== 'ramp');
  return {
    'use-stairs': stairs ? null : 'Not needed: no stairs drawn',
    'use-ramp': doc.plinthMm > 0 ? null : 'Not needed: the entrance is at ground level',
    'use-lift': needsLift(doc, use) ? null : 'Not needed: nobody uses an upper floor',
  };
}

/** How many people the whole building holds, by its rooms' names and sizes. */
export function buildingPeople(doc: PlanDoc, use: BuildingUse): number {
  return doc.rooms.filter((r) => !r.hidden).reduce((n, r) => n + occupantsOf(r, use), 0);
}

/** The plan check's building-use rows: each kind of hint above, with what it asks for and its code. */
const USE_ROWS: { id: string; label: string; prefixes: string[]; required: string; clause: string }[] = [
  {
    id: 'use-exits',
    label: 'Exits',
    prefixes: ['use-exits-', 'use-exit-width-'],
    required: '1 exit up to 49 people, 2 from 50, 3 over 500, 4 over 1,000; 5 mm of door (7.6 mm of stair) per person',
    clause: 'BCP Fire 2016',
  },
  {
    id: 'use-stairs',
    label: 'Stair widths',
    prefixes: ['use-stair-width-'],
    required: 'At least 1100 mm once 50 people use a stair (900 mm below that)',
    clause: 'BCP Fire 2016',
  },
  {
    id: 'use-corridors',
    label: 'Corridor widths',
    prefixes: ['use-corridor-'],
    required: 'At least 1100 mm (1800 mm in a school for 100 people or more, 2400 mm in a hospital)',
    clause: 'BCP Fire 2016',
  },
  {
    id: 'use-doors',
    label: 'Door widths',
    prefixes: ['use-doors-'],
    required: 'Doors on the way out at least 900 mm, for a wheelchair',
    clause: 'ACP 2006',
  },
  {
    id: 'use-travel',
    label: 'Distance to an exit',
    prefixes: ['use-travel-'],
    required: 'Under 45 m in a straight line from any room',
    clause: 'BCP Fire 2016',
  },
  {
    id: 'use-wcs',
    label: 'WCs',
    prefixes: ['use-toilets', 'use-wcs'],
    required: 'Enough WCs for the people the building holds',
    clause: 'Plumbing good practice',
  },
  {
    id: 'use-accessible',
    label: 'Accessible toilet',
    prefixes: ['use-accessible-'],
    required: 'At least one, 1.5 m each way inside for a wheelchair to turn',
    clause: 'ACP 2006',
  },
  {
    id: 'use-ramp',
    label: 'Ramp to the entrance',
    prefixes: ['use-ramp'],
    required: 'A ramp where the entrance is above the ground',
    clause: 'ACP 2006',
  },
  {
    id: 'use-lift',
    label: 'Lift',
    prefixes: ['use-lift'],
    required: 'A lift where people use upper floors',
    clause: 'ACP 2006',
  },
];

/**
 * The building-use hints as plan check rows: one per kind, met when no hint of that kind is given.
 * With no named rooms there are no people to count, and one row says so.
 */
export function buildingUseRows(
  hints: Hint[],
  people: number,
  notNeeded: Record<string, string | null> = {},
): CheckRow[] {
  if (!people)
    return [
      {
        id: 'use-people',
        label: 'People in the building',
        required: 'Name the rooms (Office, Classroom, Prayer hall…) to count people and check exits and toilets',
        actual: 'No named rooms yet',
        status: 'check',
        clause: 'BCP Fire 2016',
      },
    ];
  return USE_ROWS.map((row) => {
    const found = hints.filter((h) => row.prefixes.some((p) => h.id.startsWith(p)));
    const skip = notNeeded[row.id];
    return {
      id: row.id,
      label: row.label,
      required: row.required,
      actual: found.length ? found.map((h) => h.text).join(' ') : (skip ?? `Met, for about ${people} people`),
      status: !found.length ? 'ok' : found.every((h) => TO_DRAW.has(h.id)) ? 'check' : 'fail',
      clause: row.clause,
      ids: [...new Set(found.flatMap((h) => h.ids))],
    };
  });
}
