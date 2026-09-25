/**
 * Building bylaws for houses, by authority: setbacks for each kind of plot, and the limits the plan
 * check tests (height, storeys, coverage, plinth, boundary wall, room sizes). Sources and clause
 * numbers are kept with every figure; see docs/handover/06-bylaws.md. "Provisional" authorities come
 * from a compiled summary, not the official regulations, and say so in the app.
 */
import { MM_PER_FOOT, MM_PER_INCH } from './units';
import { MM_PER_UNIT } from './scale';
import type { Plot } from '../types';

const ft = (feet: number, inches = 0) => feet * MM_PER_FOOT + inches * MM_PER_INCH;

export type AuthorityId = 'cda' | 'cda-private' | 'dha-isb' | 'dha-lhr' | 'bahria-lhr' | 'lda';

/** Setbacks in mm: front, rear, and the two sides (side 2 is the smaller or only one). */
export interface Setbacks {
  front: number;
  rear: number;
  side1: number;
  side2: number;
}

/** The rules for one kind of plot, picked by its size and (for CDA) its frontage. */
export interface PlotRule {
  /** e.g. "Type C, 400–1000 sq yd, 50–59' frontage" or "10 marla". */
  label: string;
  /** Plot area in square yards, inclusive (upper bound open when missing). */
  sqyd?: [number, number?];
  /** Plot area in marla of 225 sq ft (Lahore), lower bound inclusive, upper exclusive. */
  marla?: [number, number?];
  /** Width of the plot along the road, in feet. */
  frontageFt?: [number, number?];
  setbacks: Setbacks;
  /** Highest ground floor plinth. */
  plinthMm?: number;
  /** Largest share of the plot the ground floor may cover (including the porch). */
  coveragePct?: number;
  /** Largest first floor, as a share of the ground floor. */
  firstFloorPct?: number;
  /** Cells that couldn't be read for certain, to check with the authority. */
  check?: string;
}

/** A room-size rule: rooms whose name matches, their least area and width. */
export interface RoomRule {
  names: RegExp;
  label: string;
  minSqFt: number;
  minWidthMm?: number;
}

export interface Authority {
  id: AuthorityId;
  name: string;
  status: 'official' | 'provisional';
  /** The document (and where in it) the figures come from. */
  source: string;
  /** Clause for the setback table. */
  setbackClause: string;
  rules: PlotRule[];
  storeys?: { max: number; clause: string };
  /** Tallest the house may be from the road, and the clause. */
  height?: {
    maxMm: number;
    clause: string;
    note?: string;
    /** Whether the mumty counts (it does when missing). */
    withMumty?: boolean;
  };
  plinth?: { clause: string };
  boundaryWall?: { minMm?: number; maxMm: number; clause: string };
  rooms?: { rules: RoomRule[]; clause: string };
  /** Least total covered area of a house. */
  minTotalSqFt?: { value: number; clause: string };
  /** How far a chajja or roof projection may reach into a setback. */
  projection?: { maxMm: number; clause: string };
  /** The mumty (stair tower) on the roof: its largest area, height and width. */
  mumty?: MumtyRule;
  /** The largest car porch for a plot size (width × depth, in feet, including the side setback). */
  carPorch?: { sizes: { sqyd: [number, number?]; w: number; d: number }[]; clause: string; note?: string };
  /** Plot sizes to start from, in feet (width along the road × depth). */
  presets: { label: string; w: number; d: number }[];
  notes: string[];
}

/** The mumty's limits. Its area is worked out from the plot (sq ft) and the block left by the setbacks (sq ft). */
export interface MumtyRule {
  area?: { maxSqFt: (m: { plotSqFt: number; buildableSqFt: number }) => number; rule: string; clause: string };
  /** Tallest, from the roof it stands on. */
  height?: { maxMm: number; clause: string };
  /** Widest, as a share of the plot's average width. */
  widthShare?: { share: number; clause: string };
}

/** DHA Islamabad 8.57.5: mumty area as a share of the plot, from the row at or below the plot's size. */
const DHA_MUMTY: [number, number][] = [
  [125, 20],
  [200, 13.5],
  [250, 11],
  [300, 11],
  [400, 11],
  [500, 9],
  [600, 9],
  [800, 9],
  [1000, 9],
];

const HABITABLE = /bed|drawing|lounge|living|dining|study|guest|family/i;

/** CDA Schedule-2 room sizes (both CDA tables). */
const CDA_ROOMS: RoomRule[] = [
  { names: HABITABLE, label: 'Habitable room', minSqFt: 100, minWidthMm: ft(8, 6) },
  { names: /kitchen/i, label: 'Kitchen', minSqFt: 45, minWidthMm: ft(5) },
  { names: /bath|toilet/i, label: 'Bathroom', minSqFt: 24, minWidthMm: ft(3) },
  { names: /\bw\.?c\b|powder/i, label: 'WC', minSqFt: 12, minWidthMm: ft(3) },
];

const sb = (front: number, side1: number, side2: number, rear: number): Setbacks => ({
  front: ft(front),
  side1: ft(side1),
  side2: ft(side2),
  rear: ft(rear),
});

const CDA_PRESETS = [
  { label: '25×50', w: 25, d: 50 },
  { label: '30×60', w: 30, d: 60 },
  { label: '35×70', w: 35, d: 70 },
  { label: '40×80', w: 40, d: 80 },
  { label: '50×90', w: 50, d: 90 },
];
const LAHORE_PRESETS = [
  { label: '5 marla (25×45)', w: 25, d: 45 },
  { label: '8 marla (30×60)', w: 30, d: 60 },
  { label: '10 marla (35×65)', w: 35, d: 65 },
  { label: '1 kanal (50×90)', w: 50, d: 90 },
  { label: '2 kanal (75×120)', w: 75, d: 120 },
];

const A = ft(3, 6);
const CD = ft(5);

export const AUTHORITIES: Authority[] = [
  {
    id: 'cda',
    name: 'CDA Islamabad (sectors)',
    status: 'official',
    source: 'ICT Building Control Regulations 2020, as amended by S.R.O. 1074(I)/2023 (Gazette, 16 Aug 2023)',
    setbackClause: 'Schedule-I',
    rules: [
      { label: 'Type A, up to 150 sq yd', sqyd: [0, 150], frontageFt: [20, 29], setbacks: sb(5, 0, 0, 5), plinthMm: A },
      {
        label: 'Type A, 151–200 sq yd',
        sqyd: [151, 200],
        frontageFt: [25, 30],
        setbacks: sb(6, 0, 0, 6),
        plinthMm: A,
        check: "The front setback reads 6' in the Gazette but 5' in a redrawn copy; 6' is used.",
      },
      {
        label: 'Type A, 201–300 sq yd',
        sqyd: [201, 300],
        frontageFt: [30, 35],
        setbacks: sb(10, 0, 0, 8),
        plinthMm: A,
      },
      {
        label: 'Type A, 300–450 sq yd',
        sqyd: [300, 450],
        frontageFt: [40, 49],
        setbacks: sb(10, 0, 4, 10),
        plinthMm: A,
      },
      {
        label: 'Type B (semi-detached), 300–625 sq yd',
        sqyd: [300, 625],
        frontageFt: [40, 49],
        setbacks: sb(10, 0, 5, 10),
        plinthMm: A,
      },
      {
        label: 'Type C, 400–1000 sq yd',
        sqyd: [400, 1000],
        frontageFt: [50, 59],
        setbacks: sb(15, 5, 5, 10),
        plinthMm: CD,
      },
      {
        label: 'Type C, 530–1335 sq yd',
        sqyd: [530, 1335],
        frontageFt: [60, 69],
        setbacks: sb(15, 10, 5, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 700–1670 sq yd',
        sqyd: [700, 1670],
        frontageFt: [70, 79],
        setbacks: sb(20, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 885–2670 sq yd',
        sqyd: [885, 2670],
        frontageFt: [80, 89],
        setbacks: sb(25, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 800–2900 sq yd',
        sqyd: [800, 2900],
        frontageFt: [90, 99],
        setbacks: sb(30, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 1770–2720 sq yd',
        sqyd: [1770, 2720],
        frontageFt: [100],
        setbacks: sb(40, 15, 15, 10),
        plinthMm: CD,
      },
    ],
    storeys: { max: 2, clause: 'Schedule-I' },
    height: {
      maxMm: ft(30),
      clause: 'Schedule-I',
      note: 'The house must look two-storey from the front.',
      withMumty: false,
    },
    plinth: { clause: 'Schedule-I' },
    boundaryWall: { minMm: ft(3), maxMm: ft(7), clause: '4.1.1' },
    rooms: { rules: CDA_ROOMS, clause: 'Schedule-2' },
    projection: { maxMm: ft(3), clause: 'Schedule-4' },
    mumty: {
      area: {
        maxSqFt: ({ plotSqFt, buildableSqFt }) => buildableSqFt / (plotSqFt / 9 <= 200.5 ? 3 : 4),
        rule: '⅓ of the block left by the setbacks (up to 200 sq yd), ¼ above',
        clause: 'Schedule-I',
      },
      height: { maxMm: ft(10), clause: '2.14.1' },
    },
    presets: CDA_PRESETS,
    notes: [
      'The type depends on both the plot size and its frontage.',
      'The smaller side setback goes on the south or west side.',
      'Construction may cover the block left by the setbacks.',
    ],
  },
  {
    id: 'cda-private',
    name: 'Islamabad private housing schemes',
    status: 'official',
    source: 'ICT Building Control Regulations 2020, as amended by S.R.O. 1074(I)/2023 (Gazette, 16 Aug 2023)',
    setbackClause: 'Schedule-5',
    rules: [
      { label: 'Type A, up to 150 sq yd', sqyd: [0, 150], frontageFt: [20, 29], setbacks: sb(5, 0, 0, 5), plinthMm: A },
      { label: 'Type A, 151–200 sq yd', sqyd: [151, 200], frontageFt: [25, 30], setbacks: sb(5, 0, 0, 5), plinthMm: A },
      { label: 'Type A, 201–320 sq yd', sqyd: [201, 320], frontageFt: [30, 39], setbacks: sb(6, 0, 0, 6), plinthMm: A },
      {
        label: 'Type A, 300–450 sq yd',
        sqyd: [300, 450],
        frontageFt: [40, 49],
        setbacks: sb(10, 4, 0, 5),
        plinthMm: A,
      },
      {
        label: 'Type B (semi-detached), 300–625 sq yd',
        sqyd: [300, 625],
        frontageFt: [40, 49],
        setbacks: sb(10, 4, 0, 5),
        plinthMm: A,
      },
      {
        label: 'Type C, 400–1000 sq yd',
        sqyd: [400, 1000],
        frontageFt: [50, 59],
        setbacks: sb(15, 5, 5, 8),
        plinthMm: CD,
        check: "The front setback can't be read in the Gazette; 15' (as the next size up) is used.",
      },
      {
        label: 'Type C, 530–1335 sq yd',
        sqyd: [530, 1335],
        frontageFt: [60, 69],
        setbacks: sb(15, 5, 5, 8),
        plinthMm: CD,
      },
      {
        label: 'Type D, 700–1670 sq yd',
        sqyd: [700, 1670],
        frontageFt: [70, 79],
        setbacks: sb(20, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 885–2670 sq yd',
        sqyd: [885, 2670],
        frontageFt: [80, 89],
        setbacks: sb(25, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 800–2900 sq yd',
        sqyd: [800, 2900],
        frontageFt: [90, 99],
        setbacks: sb(30, 10, 10, 10),
        plinthMm: CD,
      },
      {
        label: 'Type D, 1770–2720 sq yd',
        sqyd: [1770, 2720],
        frontageFt: [100],
        setbacks: sb(35, 10, 10, 10),
        plinthMm: CD,
      },
    ],
    storeys: { max: 2, clause: 'Schedule-5' },
    height: { maxMm: ft(30), clause: 'Schedule-5', withMumty: false },
    plinth: { clause: 'Schedule-5' },
    boundaryWall: { minMm: ft(3), maxMm: ft(7), clause: '4.1.1' },
    rooms: { rules: CDA_ROOMS, clause: 'Schedule-2' },
    projection: { maxMm: ft(3), clause: 'Schedule-4' },
    mumty: { height: { maxMm: ft(10), clause: '2.14.1' } },
    presets: CDA_PRESETS,
    notes: ['The smaller side setback goes on the south or west side.'],
  },
  {
    id: 'dha-isb',
    name: 'DHA Islamabad & Rawalpindi',
    status: 'official',
    source: 'DHA Islamabad & Rawalpindi Revised Byelaws & Regulations 2022 (updated 2023)',
    setbackClause: '8.54',
    rules: [
      { label: 'Up to 200 sq yd', sqyd: [0, 200], setbacks: sb(5, 0, 0, 3), coveragePct: 85, firstFloorPct: 100 },
      { label: '201–249 sq yd', sqyd: [201, 249], setbacks: sb(7, 3, 0, 3), coveragePct: 75, firstFloorPct: 100 },
      { label: '250–399 sq yd', sqyd: [250, 399], setbacks: sb(10, 3, 3, 3), coveragePct: 70, firstFloorPct: 100 },
      { label: '400–600 sq yd', sqyd: [400, 600], setbacks: sb(15, 5, 5, 5), coveragePct: 68, firstFloorPct: 90 },
      { label: '601–800 sq yd', sqyd: [601, 800], setbacks: sb(18, 5, 5, 5), coveragePct: 68, firstFloorPct: 90 },
      { label: '801 sq yd and above', sqyd: [801], setbacks: sb(20, 5, 5, 5), coveragePct: 60, firstFloorPct: 90 },
    ].map((r): PlotRule => ({ ...(r as PlotRule), plinthMm: ft(4, 6) })),
    storeys: { max: 2, clause: '8.56.2' },
    height: { maxMm: ft(37), clause: '8.56.3', note: 'Including the water tank and mumty.' },
    plinth: { clause: '8.56.7' },
    boundaryWall: { minMm: ft(5, 6), maxMm: ft(7, 6), clause: '8.62.3–8.62.5' },
    rooms: { rules: [{ names: HABITABLE, label: 'Habitable room', minSqFt: 80 }], clause: '8.56.1' },
    minTotalSqFt: { value: 2000, clause: '8.56.5.5' },
    mumty: {
      area: {
        maxSqFt: ({ plotSqFt }) => {
          const sqyd = plotSqFt / 9;
          const row = [...DHA_MUMTY].reverse().find(([size]) => sqyd >= size - 0.5) ?? DHA_MUMTY[0];
          return (plotSqFt * row[1]) / 100;
        },
        rule: 'A share of the plot: 20% (125 sq yd) down to 9% (500 sq yd and above)',
        clause: '8.57.5',
      },
      height: { maxMm: ft(11), clause: '8.57.3' },
      widthShare: { share: 0.5, clause: '8.57.2' },
    },
    carPorch: {
      sizes: [
        { sqyd: [0, 200], w: 14, d: 18 },
        { sqyd: [201, 399], w: 20, d: 18 },
        { sqyd: [400, 800], w: 30, d: 35 },
        { sqyd: [801], w: 32, d: 35 },
      ],
      clause: '8.56.10.1',
      note: 'A second porch only on corner plots or plots opening on two roads (18×18 and smaller).',
    },
    presets: [
      { label: '25×50', w: 25, d: 50 },
      { label: '30×60', w: 30, d: 60 },
      { label: '35×70', w: 35, d: 70 },
      { label: '50×90', w: 50, d: 90 },
    ],
    notes: ['Side 1 is the car porch side.', 'The first floor may be 90% of the ground floor on 400 sq yd and above.'],
  },
  {
    id: 'dha-lhr',
    name: 'DHA Lahore',
    status: 'provisional',
    source: 'Compiled summary (no clause numbers); check against the DHA Lahore regulations',
    setbackClause: 'summary',
    rules: [
      { label: '5 marla', marla: [0, 6], setbacks: sb(5, 3, 0, 3), firstFloorPct: 100 },
      { label: '7 marla', marla: [6, 7.5], setbacks: sb(7, 3, 0, 3), firstFloorPct: 75 },
      { label: '8 marla', marla: [7.5, 9], setbacks: sb(8, 4, 0, 4), firstFloorPct: 75 },
      {
        label: '10 marla',
        marla: [9, 15],
        setbacks: { ...sb(10, 5, 0, 5), front: ft(10, 9), side1: ft(5, 4.5), rear: ft(5, 4.5) },
        firstFloorPct: 75,
      },
      {
        label: '1 kanal',
        marla: [15, 30],
        setbacks: { ...sb(15, 5, 5, 5), front: ft(15, 9), side1: ft(5, 4.5), side2: ft(5, 4.5), rear: ft(5, 4.5) },
        firstFloorPct: 75,
      },
      {
        label: '2 kanal (100×90)',
        marla: [30],
        frontageFt: [90],
        setbacks: { ...sb(15, 8, 8, 8), front: ft(15, 9) },
        firstFloorPct: 75,
      },
      {
        label: '2 kanal (75×120)',
        marla: [30],
        setbacks: { front: ft(20, 9), rear: ft(8, 4.5), side1: ft(5, 4.5), side2: ft(5, 4.5) },
        firstFloorPct: 75,
      },
    ],
    height: { maxMm: ft(35), clause: 'summary', note: 'From the road crown.' },
    boundaryWall: { maxMm: ft(7), clause: 'summary' },
    rooms: { rules: [{ names: HABITABLE, label: 'Room', minSqFt: 100 }], clause: 'summary' },
    presets: [
      { label: '5 marla (25×45)', w: 25, d: 45 },
      { label: '7 marla (30×52½)', w: 30, d: 52.5 },
      { label: '8 marla (30×60)', w: 30, d: 60 },
      { label: '10 marla (35×65)', w: 35, d: 65 },
      { label: '1 kanal (50×90)', w: 50, d: 90 },
      { label: '2 kanal (100×90)', w: 100, d: 90 },
      { label: '2 kanal (75×120)', w: 75, d: 120 },
    ],
    notes: ['The first floor may cover 75% of the ground floor (5 marla: 100%).'],
  },
  {
    id: 'bahria-lhr',
    name: 'Bahria Town Lahore',
    status: 'provisional',
    source: 'Compiled summary (no clause numbers); check against the Bahria Town bylaws',
    setbackClause: 'summary',
    rules: [
      { label: '5 marla', marla: [0, 6.5], setbacks: sb(5, 0, 0, 5) },
      { label: '8 marla', marla: [6.5, 9], setbacks: sb(5, 0, 0, 5) },
      { label: '10 marla', marla: [9, 15], setbacks: sb(10, 5, 0, 7) },
      { label: '1 kanal', marla: [15, 30], setbacks: sb(10, 5, 5, 7) },
      { label: '2 kanal', marla: [30], setbacks: sb(20, 10, 10, 10) },
    ],
    height: { maxMm: ft(38), clause: 'summary', note: 'From the road crown.' },
    boundaryWall: { maxMm: ft(7), clause: 'summary' },
    presets: LAHORE_PRESETS,
    notes: [],
  },
  {
    id: 'lda',
    name: 'LDA Lahore (setbacks only)',
    status: 'provisional',
    source: 'Compiled summary; heights and FAR left out until the official LDA 2019 regulations are checked',
    setbackClause: 'summary',
    rules: [
      { label: 'Under 5 marla', marla: [0, 5], setbacks: sb(5, 0, 0, 0) },
      { label: '5–10 marla', marla: [5, 10], setbacks: sb(5, 0, 0, 5) },
      { label: '10–30 marla', marla: [10, 30], setbacks: sb(10, 5, 0, 7) },
      { label: '30 marla – 2 kanal', marla: [30, 40], setbacks: sb(10, 5, 5, 7) },
      { label: '2 kanal and above', marla: [40], setbacks: sb(20, 10, 10, 10) },
    ],
    presets: LAHORE_PRESETS,
    notes: [],
  },
];

export const authorityById = (id: string | undefined) => AUTHORITIES.find((a) => a.id === id);

const SQ_FT_PER_SQ_YD = 9;
const within = (v: number, [lo, hi]: [number, number?]) => v >= lo && (hi === undefined || v <= hi);
const withinOpen = (v: number, [lo, hi]: [number, number?]) => v >= lo && (hi === undefined || v < hi);

/**
 * The rule for a plot of this area (sq ft) and frontage (ft). Where both size and frontage are
 * given (CDA), frontage decides first, as plot types go by both; areas are rounded to the nearest
 * whole square yard, as the tables are.
 */
export function ruleFor(authority: Authority, areaSqFt: number, frontageFt: number): PlotRule | null {
  const sqyd = Math.round(areaSqFt / SQ_FT_PER_SQ_YD);
  const marla = areaSqFt / 225;
  const bySize = (r: PlotRule) => (r.sqyd ? within(sqyd, r.sqyd) : r.marla ? withinOpen(marla + 1e-6, r.marla) : true);
  const byFront = (r: PlotRule) => !r.frontageFt || within(Math.round(frontageFt), r.frontageFt);
  return (
    authority.rules.find((r) => r.frontageFt && byFront(r) && bySize(r)) ??
    authority.rules.find((r) => r.frontageFt && byFront(r)) ??
    authority.rules.find((r) => !r.frontageFt && bySize(r)) ??
    authority.rules.find(bySize) ??
    null
  );
}

const SQ_MM_PER_SQ_FT = 92903.04;

/** A plot's area (sq ft) and its frontage along the road (ft). */
export function plotMeasures(plot: Plot): { areaSqFt: number; frontageFt: number } {
  const pts = plot.points;
  let twice = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    twice += p.x * q.y - q.x * p.y;
  });
  const areaSqFt = ((Math.abs(twice) / 2) * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT;
  const a = pts[plot.front % pts.length];
  const b = pts[(plot.front + 1) % pts.length];
  const frontageFt = (Math.hypot(b.x - a.x, b.y - a.y) * MM_PER_UNIT) / MM_PER_FOOT;
  return { areaSqFt, frontageFt };
}

/** The authority and rule that apply to a plot, if it has an authority. */
export function plotRule(plot: Plot): { authority: Authority; rule: PlotRule | null } | null {
  const authority = authorityById(plot.authority);
  if (!authority) return null;
  const { areaSqFt, frontageFt } = plotMeasures(plot);
  return { authority, rule: ruleFor(authority, areaSqFt, frontageFt) };
}

/** A rule's setbacks as a plot's (side 1 and side 2), swapped when the smaller side is to go on the other side. */
export function plotSetbacks(rule: PlotRule, swap = false): Plot['setbacks'] {
  const { front, rear, side1, side2 } = rule.setbacks;
  return swap ? { front, rear, sides: side2, side2: side1 } : { front, rear, sides: side1, side2 };
}
