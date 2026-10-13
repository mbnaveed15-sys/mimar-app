/**
 * Building bylaws for houses, by authority: setbacks for each kind of plot, and the limits the plan
 * check tests (height, storeys, coverage, plinth, boundary wall, room sizes). Sources and clause
 * numbers are kept with every figure; see docs/handover/06-bylaws.md. "Provisional" authorities come
 * from a compiled summary, not the official regulations, and say so in the app.
 */
import { MM_PER_FOOT, MM_PER_INCH } from './units';
import { MM_PER_UNIT } from './scale';
import { frontage, plotArea } from './plot';
import type { Plot } from '../types';

/** Feet and inches in mm. */
export const ft = (feet: number, inches = 0) => feet * MM_PER_FOOT + inches * MM_PER_INCH;

export type AuthorityId =
  'cda' | 'cda-private' | 'dha-isb' | 'dha-lhr' | 'bahria-lhr' | 'lda' | 'lda-builtup' | 'lda-open';
/** No local authority: the plot's own setbacks and the national codes (see GENERAL). */
export type CheckAuthorityId = AuthorityId | 'general';

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
  /** Largest floor area ratio (all floors' covered area over the plot), as 1:far. */
  far?: number;
  /** Tallest from the road, when it goes by plot size (else the authority's height). */
  heightMm?: number;
  /** The front setback is the one typed for the plot (the authority fixes it case by case). */
  frontAsTyped?: string;
  /** Another pair of side setbacks (mm) that passes too. */
  altSides?: [number, number];
  /** The rear, or the sides, are the plot's own as typed (the authority fixes only the others). */
  rearAsTyped?: boolean;
  sidesAsTyped?: boolean;
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
  id: CheckAuthorityId;
  name: string;
  /** 'general': no local table, only the plot's own setbacks and the national codes. */
  status: 'official' | 'provisional' | 'general';
  /** The document (and where in it) the figures come from. */
  source: string;
  /** Clause for the setback table. */
  setbackClause: string;
  rules: PlotRule[];
  storeys?: { max: number; clause: string };
  /** Where the FAR comes from, and whether a basement counts in it. */
  far?: { clause: string; withBasement: boolean };
  /**
   * The table row as it applies to this plot, where more than its size decides (the road's width,
   * the plot's frontage): see LDA's built-up and open areas.
   */
  adjust?: (rule: PlotRule, m: { areaSqFt: number; frontageFt: number; roadFt?: number }) => PlotRule;
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
  /**
   * A basement: under the ground floor only ('house') or anywhere inside the building line
   * ('building'), and its clear height (least and most).
   */
  basement?: { extent: 'house' | 'building'; clearMm?: [number, number]; clause: string };
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
/** Baths and WCs, whatever else is in the name ("Guest bath", "Master bath", "Bed 1 WC"). */
export const WET_ROOM = /bath|toilet|\bw\.?c\b|washroom|powder|shower|ensuite|en-suite|lavatory/i;

/** The room-size rule for a room of this name: a bath or WC never counts as a habitable room. */
export function roomRuleFor(rules: RoomRule[], name: string): RoomRule | null {
  const wet = WET_ROOM.test(name);
  return rules.find((r) => r.names.test(name) && !(wet && r.names === HABITABLE)) ?? null;
}

/** CDA Schedule-2 room sizes (both CDA tables). */
export const CDA_ROOMS: RoomRule[] = [
  { names: HABITABLE, label: 'Habitable room', minSqFt: 100, minWidthMm: ft(8, 6) },
  { names: /kitchen/i, label: 'Kitchen', minSqFt: 45, minWidthMm: ft(5) },
  { names: /bath|toilet/i, label: 'Bathroom', minSqFt: 24, minWidthMm: ft(3) },
  { names: /\bw\.?c\b|powder/i, label: 'WC', minSqFt: 12, minWidthMm: ft(3) },
];

/** Setbacks in feet: front, side 1, side 2, rear. */
export const sb = (front: number, side1: number, side2: number, rear: number): Setbacks => ({
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

const LDA_SOURCE =
  'LDA Building and Zoning Regulations 2019 (amendments to 28 Jan 2020 and the office order of 28 Oct 2022)';

/** LDA 2.2.3: plots in marla [from, to), coverage %, FAR 1:x, height in feet (all 3 storeys). */
const LDA_LIMITS: [number, number, number, number, number][] = [
  [0, 5, 80, 2.4, 38],
  [5, 10, 75, 2.3, 38],
  [10, 20, 70, 2.8, 45],
  [20, 30.01, 65, 2.6, 45],
  [30.01, 40, 60, 2.4, 45],
  [40, Infinity, 55, 2.2, 45],
];
/** LDA 2.1.3, built-up areas on roads up to 25' wide: marla [from, to), coverage %, FAR 1:x. */
const LDA_NARROW: [number, number, number, number][] = [
  [0, 5, 85, 2],
  [5, 10, 80, 1.6],
  [10, 20, 70, 1.5],
  [20, 40, 65, 1.4],
  [40, Infinity, 60, 1.3],
];
const marlaLabel = (m: number) => (m >= 20 && m % 20 === 0 ? `${m / 20} kanal` : `${m} marla`);

/** LDA house rows: setbacks [front, side 1, side 2, rear] by marla, split where 2.2.3's limits change too. */
function ldaRules(setbacks: [number, number, [number, number, number, number]][]): PlotRule[] {
  const cuts = [...new Set([...setbacks.flatMap(([a, b]) => [a, b]), ...LDA_LIMITS.flatMap(([a, b]) => [a, b])])]
    .filter((m) => Number.isFinite(m))
    .sort((a, b) => a - b);
  const rules: PlotRule[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const lo = cuts[i];
    const hi = cuts[i + 1] ?? Infinity;
    const row = setbacks.find(([a, b]) => lo >= a && lo < b);
    const lim = LDA_LIMITS.find(([a, b]) => lo >= a && lo < b);
    if (!row || !lim) continue;
    const [f, s1, s2, r] = row[2];
    const name = (m: number) => marlaLabel(Math.round(m));
    // A bound just over a whole number (30.01) keeps that number in the row below it.
    const over = (m: number) => !Number.isInteger(m);
    const from = over(lo) ? `Over ${name(lo)}` : !lo ? '' : name(lo);
    const to = hi === Infinity ? '' : over(hi) ? `to ${name(hi)}` : `to under ${name(hi)}`;
    rules.push({
      label: !lo ? `Under ${name(hi)}` : hi === Infinity ? `${from} and above` : `${from} ${to}`,
      marla: hi === Infinity ? [lo] : [lo, hi],
      setbacks: sb(f, s1, s2, r),
      coveragePct: lim[2],
      far: lim[3],
      heightMm: ft(lim[4]),
    });
  }
  return rules;
}

/** LDA 2.2.1, approved schemes (also the building line in open areas, 2.3.1). */
const LDA_SCHEME_RULES = ldaRules([
  [0, 10, [5, 0, 0, 5]],
  [10, 30.01, [10, 5, 0, 7]],
  [30.01, 40, [10, 5, 5, 7]],
  [40, 80, [20, 10, 10, 10]],
  [80, Infinity, [20, 13, 13, 13]],
]);
/** LDA 2.1.1(b), established built-up areas on roads wider than 25'. */
const LDA_BUILTUP_RULES = ldaRules([
  [0, 5, [5, 0, 0, 0]],
  [5, 10, [5, 0, 0, 5]],
  [10, 30.01, [10, 5, 0, 7]],
  [30.01, 40, [10, 5, 5, 7]],
  [40, Infinity, [20, 10, 10, 10]],
]);

/** What all LDA houses share (2.2.2–2.7, 5.2.1, 5.2.2). */
const LDA_HOUSE = {
  storeys: { max: 3, clause: '2.7.1(a)' },
  height: {
    maxMm: ft(45),
    clause: '2.2.3',
    note: 'From the road to the top of the parapet, without the mumty.',
    withMumty: false,
  },
  far: { clause: '2.2.3', withBasement: true },
  rooms: {
    rules: [
      { names: HABITABLE, label: 'Habitable room', minSqFt: 100, minWidthMm: ft(8) },
      { names: /kitchen/i, label: 'Kitchen', minSqFt: 50, minWidthMm: ft(6) },
    ],
    clause: '5.2.2(a)',
  },
  basement: { extent: 'building' as const, clause: '5.2.1(e)' },
  mumty: { height: { maxMm: ft(9, 6), clause: '1.1 (Building Height)' } },
  presets: LAHORE_PRESETS,
};

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
    basement: { extent: 'house', clearMm: [ft(8, 6), ft(12)], clause: 'Schedule-I' },
    mumty: {
      area: {
        maxSqFt: ({ plotSqFt, buildableSqFt }) => buildableSqFt / (plotSqFt / 9 <= 200.5 ? 3 : 4),
        rule: 'a third of the block left by the setbacks (up to 200 sq yd), a quarter above',
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
    basement: { extent: 'building', clause: '8.56.5.3' },
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
    notes: [
      'The side setback marked * in the bylaws goes on the car porch side; Swap left and right moves it.',
      'The first floor may be 90% of the ground floor on 400 sq yd and above.',
    ],
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
    basement: { extent: 'building', clause: 'summary' },
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
    name: 'LDA Lahore (approved schemes)',
    status: 'official',
    source: LDA_SOURCE,
    setbackClause: '2.2.1',
    rules: LDA_SCHEME_RULES,
    ...LDA_HOUSE,
    notes: ["The 5' side setback of 10 to 30 marla goes on one side only; Swap left and right moves it."],
  },
  {
    id: 'lda-builtup',
    name: 'LDA Lahore (built-up areas)',
    status: 'official',
    source: LDA_SOURCE,
    setbackClause: '2.1.1',
    rules: LDA_BUILTUP_RULES,
    ...LDA_HOUSE,
    adjust: (rule, { roadFt }) => {
      // On a road up to 25' wide, the older table (2.1.3) and 38' high; the building line follows
      // the houses already there.
      if (roadFt === undefined || roadFt > 25) return rule;
      const narrow = LDA_NARROW.find(([lo, hi]) => (rule.marla?.[0] ?? 0) >= lo && (rule.marla?.[0] ?? 0) < hi);
      return {
        ...rule,
        label: `${rule.label}, road up to 25'`,
        coveragePct: narrow?.[2] ?? rule.coveragePct,
        far: narrow?.[3] ?? rule.far,
        heightMm: ft(38),
        frontAsTyped:
          "On a road up to 25' wide the building line is the one the houses along it already keep (2.1.1a).",
      };
    },
    notes: ["Type the road width under the plot: on roads up to 25' wide other limits apply (2.1.1–2.1.3)."],
  },
  {
    id: 'lda-open',
    name: 'LDA Lahore (predominantly open areas)',
    status: 'official',
    source: LDA_SOURCE,
    setbackClause: '2.3.1',
    rules: LDA_SCHEME_RULES,
    ...LDA_HOUSE,
    adjust: (rule, { frontageFt }) => {
      // The building line as in schemes; the rear and sides by the plot's frontage.
      const f = Math.round(frontageFt);
      const [rear, side] = f < 30 ? [5, 0] : f <= 50 ? [5, 5] : f <= 70 ? [10, 5] : [10, 10];
      return {
        ...rule,
        label: `${rule.label}, ${f}' frontage`,
        setbacks: { front: rule.setbacks.front, rear: ft(rear), side1: ft(side), side2: ft(side) },
      };
    },
    notes: ['The rear and side setbacks go by the plot’s frontage along the road (2.3.1).'],
  },
];

export const authorityById = (id: string | undefined) => AUTHORITIES.find((a) => a.id === id);

/**
 * The check for a plot with no authority picked (or a building with no plot): the plot's own
 * setbacks, and for buildings the national fire and access codes (see `buildingUse.ts`).
 */
export const GENERAL: Authority = {
  id: 'general',
  name: 'General (no local authority picked)',
  status: 'general',
  source:
    'the plot’s own setbacks; Building Code of Pakistan (Fire Safety Provisions 2016) and Accessibility Code of Pakistan 2006 for buildings',
  setbackClause: 'Plot’s own',
  rules: [],
  presets: CDA_PRESETS,
  notes: [],
};

export const SQ_FT_PER_SQ_YD = 9;
const within = (v: number, [lo, hi]: [number, number?]) => v >= lo && (hi === undefined || v <= hi);
const withinOpen = (v: number, [lo, hi]: [number, number?]) => v >= lo && (hi === undefined || v < hi);

/**
 * The rule for a plot of this area (sq ft) and frontage (ft). Where both size and frontage are
 * given (CDA), the row fitting both wins, as plot types go by both; failing that, the size decides.
 * Areas are rounded to the nearest whole square yard, as the tables are.
 */
export function ruleFor(authority: Authority, areaSqFt: number, frontageFt: number): PlotRule | null {
  const sqyd = Math.round(areaSqFt / SQ_FT_PER_SQ_YD);
  const marla = areaSqFt / 225;
  const bySize = (r: PlotRule) => (r.sqyd ? within(sqyd, r.sqyd) : r.marla ? withinOpen(marla + 1e-6, r.marla) : true);
  const byFront = (r: PlotRule) => !r.frontageFt || within(Math.round(frontageFt), r.frontageFt);
  // Size and frontage together first; then size alone (a row for a much bigger plot, picked by its
  // frontage only, would give setbacks that swallow the plot); frontage alone only as a last resort.
  return (
    authority.rules.find((r) => r.frontageFt && byFront(r) && bySize(r)) ??
    authority.rules.find((r) => !r.frontageFt && bySize(r)) ??
    authority.rules.find(bySize) ??
    authority.rules.find((r) => r.frontageFt && byFront(r)) ??
    null
  );
}

const SQ_MM_PER_SQ_FT = 92903.04;

/** A plot's area (sq ft, less any cut corner) and its frontage along the main road (ft). */
export function plotMeasures(plot: Plot): { areaSqFt: number; frontageFt: number } {
  const areaSqFt = (plotArea(plot) * MM_PER_UNIT * MM_PER_UNIT) / SQ_MM_PER_SQ_FT;
  const frontageFt = (frontage(plot) * MM_PER_UNIT) / MM_PER_FOOT;
  return { areaSqFt, frontageFt };
}

/** The authority and rule that apply to a plot, if it has an authority. */
export function plotRule(plot: Plot): { authority: Authority; rule: PlotRule | null } | null {
  const authority = authorityById(plot.authority);
  if (!authority) return null;
  const { areaSqFt, frontageFt } = plotMeasures(plot);
  const rule = ruleFor(authority, areaSqFt, frontageFt);
  const roadFt = roadWidthFt(plot);
  return {
    authority,
    rule: rule && authority.adjust ? authority.adjust(rule, { areaSqFt, frontageFt, roadFt }) : rule,
  };
}

/** The main road's width (its right of way), in feet, if typed. */
export const roadWidthFt = (plot: Plot): number | undefined =>
  plot.roadWidthMm ? plot.roadWidthMm / MM_PER_FOOT : undefined;

/** A rule's setbacks with the sides it leaves to the plot (front, rear or sides as typed) taken from the plot. */
export function withTyped(s: Plot['setbacks'], rule: PlotRule, plot: Plot): Plot['setbacks'] {
  const own = plot.setbacks;
  return {
    ...s,
    ...(rule.frontAsTyped ? { front: own.front } : {}),
    ...(rule.rearAsTyped ? { rear: own.rear } : {}),
    ...(rule.sidesAsTyped ? { sides: own.sides, side2: own.side2 } : {}),
  };
}

/** A rule's setbacks as a plot's (side 1 and side 2), swapped when the smaller side is to go on the other side. */
export function plotSetbacks(rule: PlotRule, swap = false): Plot['setbacks'] {
  const { front, rear, side1, side2 } = rule.setbacks;
  return swap ? { front, rear, sides: side2, side2: side1 } : { front, rear, sides: side1, side2 };
}
