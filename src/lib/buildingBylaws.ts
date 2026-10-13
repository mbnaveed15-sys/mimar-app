/**
 * Bylaws for non-residential buildings (and apartments), by authority and by the area the plot is in:
 * CDA's commercial areas (Gazette S.R.O. 1074(I)/2023, Section 8), DHA Islamabad & Rawalpindi's
 * commercial plots (Byelaws 2022, 8.77–8.106) and LDA's commercial, public and industrial areas
 * (Building and Zoning Regulations 2019, with the office order of 28 Oct 2022). Data only: the plan
 * check rows are made in `buildingCheck.ts`. See docs/handover/06-bylaws.md.
 */
import {
  ft,
  plotMeasures,
  roadWidthFt,
  sb,
  SQ_FT_PER_SQ_YD,
  type AuthorityId,
  type PlotRule,
  type Setbacks,
} from './bylaws';
import { outlinePoints } from './plot';
import { MM_PER_UNIT } from './scale';
import { MM_PER_FOOT } from './units';
import type { BuildingUse, Plot } from '../types';

const NONE = sb(0, 0, 0, 0);

/** What the limits are worked out from: the plot, its road, the building's use and its storeys. */
export interface BuildingMeasures {
  sqft: number;
  frontageFt: number;
  /** The plot's depth from the main road, ft. */
  depthFt: number;
  /** The main road's width, ft, if typed. */
  roadFt?: number;
  use: BuildingUse;
  /** Storeys above the ground (basements and the mumty left out), as drawn. */
  storeys: number;
}

/** A row the plan can't measure: shown to check. */
export interface CheckNote {
  id: string;
  label: string;
  text: string;
  clause: string;
}

/** One building's limits in one area. Missing figures aren't limited (or are set case by case). */
export interface BuildingLimits {
  /** The table row or zone, e.g. "Category 1, up to 899 sq yd". */
  label: string;
  clause: string;
  /** Missing: as per the site or allotment letter (the plot's own setbacks, to check). */
  setbacks?: Setbacks;
  setbacksClause?: string;
  /** Another pair of side setbacks that passes too (CDA industrial: 15' and 15', or 10' and 20'). */
  altSides?: [number, number];
  /** The front setback is the one typed for the plot, and why. */
  frontAsTyped?: string;
  /** The rear, or the sides, are the plot's own (only the others are fixed). */
  rearAsTyped?: boolean;
  sidesAsTyped?: boolean;
  /** Ground floor coverage (and of the floors above, where it differs). */
  coveragePct?: number;
  upperCoveragePct?: number;
  coverageNote?: string;
  coverageClause?: string;
  /** Largest FAR, as 1:far. */
  far?: number;
  farNote?: string;
  farClause?: string;
  /** Basements count in the FAR (they don't, unless said). */
  farWithBasement?: boolean;
  /** Storeys above the ground, and how the bylaws put it. */
  maxStoreys?: number;
  storeysLabel?: string;
  storeysClause?: string;
  /** Tallest, and least tall, from the road. */
  heightMm?: number;
  minHeightMm?: number;
  heightClause?: string;
  /** What the height includes, in words. */
  heightNote?: string;
  /** Plot size and road the area or zone needs. */
  minSqFt?: number;
  maxSqFt?: number;
  minRoadFt?: number;
  minFrontageFt?: number;
  plotClause?: string;
  /** A veranda (arcade) along the road sides. */
  verandaMm?: number;
  verandaClause?: string;
  /** The mumty: its largest share of the plot, its width as a share of the plot's width, its height. */
  mumty?: { sharePct?: number; widthShare?: number; heightMm?: number; clause: string };
  /** Parking needed at all (CDA: only above 900 sq yd unless the area says otherwise). */
  parkingNeeded?: boolean;
  parkingNote?: string;
  /** Lift needed above this many storeys (CDA), and the clause. */
  liftAbove?: number;
  liftClause?: string;
  notes?: CheckNote[];
}

export interface BuildingArea {
  id: string;
  label: string;
  clause: string;
  /** The uses this area is the first choice for. */
  uses?: BuildingUse[];
  limits: (m: BuildingMeasures) => BuildingLimits;
}

/** How many cars a building needs, and the rule in words. */
export interface ParkingNeed {
  cars: number;
  rule: string;
  clause: string;
}

/** What the parking rule is worked out from. */
export interface ParkingMeasures {
  /** Covered area for parking, sq ft (parking floors, plant and the mumty left out). */
  coveredSqFt: number;
  /** Rooms counted for parking: hotel rooms, flats (by their kitchens), hospital beds, classrooms. */
  rooms: number;
  flats: number;
  beds: number;
  classrooms: number;
  /** A hospital's covered area other than its wards, sq ft. */
  clinicalSqFt: number;
}

/** The rules every building under an authority shares. */
export interface BuildingFacilities {
  /** A lift: needed or not, and the rule in words. */
  lift: (m: { storeys: number; sqft: number; use: BuildingUse; liftAbove?: number }) => {
    needed: boolean;
    rule: string;
    clause: string;
  };
  /** Emergency stairs beside the main stair. */
  emergencyStairs: (m: { storeys: number; sqft: number; heightMm: number }) => {
    count: number;
    rule: string;
    clause: string;
  };
  /** A ramp to the entrance: needed, its least width, the rule. */
  ramp: (m: { coveredSqFt: number }) => { needed: boolean; minWidthMm?: number; rule: string; clause: string };
  /** Each storey's clear height (floor to the slab above). */
  storeyHeight?: { minMm?: number; maxMm?: number; clause: string };
  basementMinMm?: { mm: number; clause: string };
  plinthMaxMm?: { mm: number; clause: string };
  /** Shops' least area (sq ft) and width. */
  shops?: { minSqFt: number; minWidthMm?: number; clause: string };
  /** Stairs: least width (by storeys and use), highest riser, least tread. */
  stairs?: {
    minWidthMm: (m: { storeys: number; use: BuildingUse }) => number;
    maxRiserMm: number;
    minTreadMm: number;
    clause: string;
  };
  notes?: CheckNote[];
}

export interface BuildingBylaws {
  /** The authorities these rules apply to. */
  ids: AuthorityId[];
  name: string;
  source: string;
  areas: BuildingArea[];
  parking: (use: BuildingUse, m: ParkingMeasures, limits: BuildingLimits) => ParkingNeed | null;
  /** Area counted for one car in a car park, sq ft. */
  sqFtPerCar: number;
  sqFtPerCarClause: string;
  facilities: BuildingFacilities;
  /** Whether the height includes the mumty and water tank. */
  heightWithMumty: boolean;
  /** Ask for the road's width (its limits go by it). */
  usesRoadWidth: boolean;
  /** Parking is needed from this plot size (sq ft) unless the area says (CDA 9.9.1: above 900 sq yd). */
  parkingFromSqFt?: { sqft: number; clause: string };
}

const KANAL_SQ_FT = 4500;
const MARLA_SQ_FT = 225;
const ACRE_SQ_FT = 43560;
const sqyd = (m: BuildingMeasures) => Math.round(m.sqft / SQ_FT_PER_SQ_YD);
const per = (sqft: number, each: number) => Math.ceil(sqft / each - 1e-9);

// ——— CDA ———

/** CDA's commercial areas (8.x.1): public toilets, ramps and lifts. */
const cdaToilets = (where: string, clause: string): CheckNote => ({
  id: 'bylaw-public-toilets',
  label: 'Public toilets',
  text: where,
  clause,
});
const cdaLift = (m: BuildingMeasures, clause: string) => ({
  liftAbove: m.use === 'apartments' ? 4 : 3,
  liftClause: clause,
});

const CDA_AREAS: BuildingArea[] = [
  {
    id: 'cda-blue-north',
    label: 'Blue Area, northern strip (high-rise)',
    clause: '8.1',
    limits: (m) => {
      const yd = sqyd(m);
      const [cat, far] = yd <= 2999 ? ['I', 8] : yd <= 4999 ? ['II', 9] : ['III', 10];
      return {
        label: `Category ${cat} (${yd <= 2999 ? 'up to 2,999' : yd <= 4999 ? '3,000 to 4,999' : '5,000 and above'} sq yd)`,
        clause: '8.1',
        far,
        coveragePct: 70,
        coverageNote: 'ground and 4 storeys; flexible above',
        storeysLabel: 'Set by the CAA/PAF',
        verandaMm: ft(7),
        verandaClause: '8.1.1(i)',
        parkingNeeded: true,
        ...cdaLift(m, '8.1.1(iii)(c)'),
        notes: [
          cdaToilets('At least 2 public toilets and 1 for special persons on every commercial floor', '8.1.1(iii)(a)'),
          {
            id: 'bylaw-setbacks-site',
            label: 'Setbacks',
            text: 'Set by the Planning Wing plot by plot: the plot’s own are checked',
            clause: '8.1',
          },
        ],
      };
    },
  },
  {
    id: 'cda-blue-south',
    label: 'Blue Area, southern strip (G-6/G-7, F-6, F-7)',
    clause: '8.2',
    limits: (m) => {
      const side = m.frontageFt <= 100.5 ? 5 : 10;
      return {
        label: `Frontage ${Math.round(m.frontageFt)}': sides ${side}' each`,
        clause: '8.2',
        setbacks: { ...NONE, side1: ft(side), side2: ft(side) },
        setbacksClause: '8.2 (6)',
        rearAsTyped: true,
        frontAsTyped: 'CDA gives only the side setbacks here: the front and rear are the plot’s own',
        far: 6,
        storeysLabel: 'Not capped, within the FAR',
        verandaMm: ft(7),
        verandaClause: '8.2.1(1)',
        ...cdaLift(m, '8.2.1(3)(c)'),
        notes: [
          cdaToilets('At least 2 public toilets and 1 for special persons on every commercial floor', '8.2.1(3)(a)'),
        ],
      };
    },
  },
  {
    id: 'cda-markaz',
    label: 'Markaz (commercial plots; also private schemes)',
    clause: '8.3',
    uses: ['shop', 'office', 'restaurant', 'other'],
    limits: (m) => {
      const big = sqyd(m) >= 900;
      return {
        label: big ? 'Category 2, 900 sq yd and above' : 'Category 1, up to 899 sq yd',
        clause: '8.3',
        far: big ? 6 : 5,
        maxStoreys: big ? 9 : 7,
        storeysLabel: big ? 'LG+G+7 or G+8' : 'LG+G+5 or G+6',
        verandaMm: ft(6),
        verandaClause: '8.3.1(i)',
        parkingNeeded: true,
        parkingNote: 'for vacant plots',
        ...cdaLift(m, '8.3.1(iii)(c)'),
        notes: [
          cdaToilets('At least 2 public toilets and 1 for special persons on the ground floor', '8.3.1(iii)(a)'),
          {
            id: 'bylaw-setbacks-site',
            label: 'Setbacks',
            text: 'As in the Markaz’s layout plan: the plot’s own are checked',
            clause: '8.3',
          },
        ],
      };
    },
  },
  {
    id: 'cda-class3',
    label: 'Class-III shopping centre',
    clause: '8.4',
    limits: () => ({
      label: 'LG+G+1',
      clause: '8.4',
      far: 3,
      maxStoreys: 3,
      storeysLabel: 'LG+G+1',
      verandaMm: ft(5),
      verandaClause: '8.4.1(i)',
    }),
  },
  {
    id: 'cda-community-core',
    label: 'Community Core, H-series',
    clause: '8.4(A)',
    limits: () => ({
      label: 'LG+G+2 or G+3',
      clause: '8.4(A)',
      far: 4,
      maxStoreys: 4,
      storeysLabel: 'LG+G+2 or G+3',
      verandaMm: ft(5),
      verandaClause: '8.4.1(i)',
    }),
  },
  {
    id: 'cda-it-centre',
    label: 'I&T centre',
    clause: '8.5',
    limits: () => ({
      label: 'LG+G+2',
      clause: '8.5',
      far: 4,
      maxStoreys: 4,
      storeysLabel: 'LG+G+2 (another storey only with charges)',
      verandaMm: ft(5),
      verandaClause: '8.5.1(i)',
    }),
  },
  {
    id: 'cda-mauve',
    label: 'Mauve Area (offices)',
    clause: '8.6',
    limits: (m) => {
      const yd = sqyd(m);
      const cat = yd <= 3300 ? 1 : yd <= 6600 ? 2 : yd < 15000 ? 3 : 4;
      const far = [4, 5, 6, 8][cat - 1];
      // Category 1: a 100'×140' plot keeps 20' at the rear, a 100'×280' one 40'.
      const setbacks = cat === 1 ? sb(40, 15, 15, m.depthFt >= 210 ? 40 : 20) : sb(60, 30, 30, 60);
      return {
        label: `Category ${cat} (${['up to 3,300', '3,301 to 6,600', '6,601 to 14,999', '15,000 and above'][cat - 1]} sq yd)`,
        clause: '8.6',
        setbacks,
        far,
        coveragePct: 40,
        storeysLabel: 'Flexible',
        mumty: { heightMm: ft(8), clause: '8.6 (6)' },
        notes: [
          {
            id: 'bylaw-building-gap',
            label: 'Between buildings',
            text: "At least 30' between two detached buildings on the plot",
            clause: '8.6 (7)',
          },
        ],
      };
    },
  },
  {
    id: 'cda-h-series',
    label: 'H-series (all uses)',
    clause: '8.7',
    limits: (m) => {
      const big = sqyd(m) > 4166;
      const school = m.use === 'school';
      return {
        label: big ? 'More than 4,166 sq yd' : 'Up to 4,166 sq yd',
        clause: '8.7',
        setbacks: big ? sb(50, 30, 30, 30) : sb(30, 30, 30, 30),
        far: school ? (big ? 4 : 2) : big ? 6 : 4,
        farNote: school ? 'schools up to secondary level' : undefined,
        coveragePct: 40,
        maxStoreys: big ? 10 : 4,
        storeysLabel: big ? '2 basements + G+9' : 'Basement + G+3',
        heightMm: big ? undefined : ft(56),
        heightNote: big ? undefined : "only the stair tower, lift room and water tank above, 8' at most",
        mumty: { heightMm: ft(8), clause: '8.7 (6)' },
        notes: [
          {
            id: 'bylaw-building-gap',
            label: 'Between buildings',
            text: "At least 30' between two detached buildings on the plot",
            clause: '8.7 (7)',
          },
        ],
      };
    },
  },
  {
    id: 'cda-public-f5g5',
    label: 'Public buildings, F-5/G-5 and Admin Centre',
    clause: '8.8',
    limits: () => ({
      label: 'Basements + G+9',
      clause: '8.8',
      setbacks: sb(30, 30, 30, 30),
      far: 3.5,
      coveragePct: 40,
      maxStoreys: 10,
      storeysLabel: 'Basements + G+9',
    }),
  },
  {
    id: 'cda-education',
    label: 'Education zones II, IV and V',
    clause: '8.9',
    uses: ['school'],
    limits: (m) => {
      const big = m.sqft > 1.5 * ACRE_SQ_FT + 1;
      const school = m.use === 'school';
      return {
        label: big ? 'More than 1.5 acres' : 'Up to 1.5 acres',
        clause: big ? '8.9(b)' : '8.9(a)',
        setbacks: sb(50, 30, 30, 40),
        far: school ? 2.5 : big ? 4 : 3,
        farNote: school ? 'schools up to secondary level' : undefined,
        coveragePct: big ? 30 : 40,
        maxStoreys: big ? 10 : 6,
        storeysLabel: big ? 'G+9' : 'G+5',
      };
    },
  },
  {
    id: 'cda-diplomatic',
    label: 'Diplomatic Enclave (extension)',
    clause: '8.10',
    limits: () => ({
      label: 'Basement + G+7',
      clause: '8.10',
      setbacks: sb(30, 20, 20, 30),
      far: 3,
      coveragePct: 40,
      maxStoreys: 8,
      storeysLabel: 'Basement + G+7',
    }),
  },
  {
    id: 'cda-fruit-market',
    label: 'Fruit and vegetable market',
    clause: '8.11',
    limits: () => ({
      label: 'LG+G+2',
      clause: '8.11',
      far: 4,
      farWithBasement: true,
      farNote: 'the lower ground counts',
      maxStoreys: 4,
      storeysLabel: 'LG+G+2',
    }),
  },
  {
    id: 'cda-hotel',
    label: 'Hotel or motel site',
    clause: '8.12',
    uses: ['hotel'],
    limits: (m) => {
      const big = sqyd(m) >= 3000;
      return {
        label: big ? 'Type 2, 3,000 sq yd and above' : 'Type 1, under 3,000 sq yd',
        clause: '8.12',
        far: big ? 6 : 5,
        coveragePct: big ? 70 : 80,
        storeysLabel: 'Within the CAA’s limit',
        parkingNeeded: true,
        notes: [
          {
            id: 'bylaw-setbacks-site',
            label: 'Setbacks',
            text: 'As the site needs, unless the layout plan fixes them: the plot’s own are checked',
            clause: '8.12',
          },
        ],
      };
    },
  },
  {
    id: 'cda-standalone',
    label: 'Standalone commercial on an arterial road (Zones 2, 4, 5)',
    clause: '8.13',
    limits: (m) => {
      const yd = sqyd(m);
      const row =
        yd <= 500
          ? ['Up to 500 sq yd', 4, 80]
          : yd <= 1000
            ? ['500 to 1,000 sq yd', 4.5, 65]
            : yd <= 2000
              ? ['1,000 to 2,000 sq yd', 5, 60]
              : ['Above 2,000 sq yd', 5.5, 55];
      return {
        label: row[0] as string,
        clause: '8.13',
        setbacks: { ...NONE, front: ft(20) },
        rearAsTyped: true,
        sidesAsTyped: true,
        far: row[1] as number,
        coveragePct: row[2] as number,
        storeysLabel: 'Flexible',
        parkingNeeded: true,
        notes: [
          {
            id: 'bylaw-murree-road',
            label: 'Murree Road',
            text: "On Murree Road from Faizabad the front setback is 15', not 20'",
            clause: '8.13 (B)',
          },
        ],
      };
    },
  },
  {
    id: 'cda-major-avenue',
    label: 'Major avenue of a private scheme (Zones 2, 4, 5)',
    clause: '8.14',
    limits: (m) => {
      const road = m.roadFt;
      const far = road === undefined ? 5 : road > 200.5 ? 6 : road > 100.5 ? 5.5 : 5;
      return {
        label: road === undefined ? "Road width not typed (60–100' assumed)" : `Road ${Math.round(road)}' wide`,
        clause: '8.14',
        far,
        coveragePct: 70,
        storeysLabel: 'Ground + 4 commercial, offices or flats above; height as the CAA allows',
        minRoadFt: 60,
        verandaMm: ft(6),
        verandaClause: '8.14.1(i)',
        parkingNeeded: true,
        ...cdaLift(m, '8.14.1(iii)(c)'),
        notes: [
          cdaToilets('At least 2 public toilets and 1 for special persons on every commercial floor', '8.14.1(iii)(a)'),
          {
            id: 'bylaw-setbacks-site',
            label: 'Setbacks',
            text: 'As in the allotment letter: the plot’s own are checked',
            clause: '8.14',
          },
          ...(m.use === 'school'
            ? [{ id: 'bylaw-use', label: 'Use', text: 'Schools aren’t allowed on major avenues', clause: '8.14' }]
            : []),
        ],
      };
    },
  },
  {
    id: 'cda-industrial',
    label: 'Industrial area',
    clause: '8.16',
    uses: ['factory', 'warehouse'],
    limits: (m) => {
      const s = Math.max(2, Math.min(4, m.storeys || 2));
      const [far, cover] = s <= 2 ? [1.2, 60] : s === 3 ? [1.5, 50] : [1.6, 50];
      return {
        label: s <= 2 ? 'G+1 (2 storeys)' : s === 3 ? 'G+2 (3 storeys)' : 'G+3 (4 storeys)',
        clause: '8.16',
        setbacks: sb(s <= 2 ? 30 : 40, 15, 15, 10),
        altSides: [10, 20],
        far,
        coveragePct: cover,
        maxStoreys: 4,
        storeysLabel: 'G+3 at most',
        heightMm: ft(60),
      };
    },
  },
  {
    id: 'cda-petrol',
    label: 'Petrol or CNG station',
    clause: '8.17',
    limits: () => ({
      label: '2 storeys',
      clause: '8.17',
      setbacks: sb(20, 10, 10, 5),
      coveragePct: 25,
      coverageNote: 'without the canopy over the filling points',
      maxStoreys: 2,
      storeysLabel: '2 storeys',
      notes: [cdaToilets('2 public and disabled toilets', '8.17')],
    }),
  },
  {
    id: 'cda-masjid',
    label: 'Masjid',
    clause: '8.18',
    uses: ['mosque'],
    limits: () => ({
      label: 'Ground + mezzanine + basement',
      clause: '8.18',
      setbacks: NONE,
      coveragePct: 100,
      maxStoreys: 2,
      storeysLabel: 'Ground + mezzanine + basement',
      notes: [cdaToilets('Public and disabled toilets with the ablution area', '8.18')],
    }),
  },
  {
    id: 'cda-hospital',
    label: 'Hospital site in a Markaz',
    clause: '8.19',
    uses: ['hospital', 'clinic'],
    limits: (m) => {
      const big = sqyd(m) >= 2000;
      return {
        label: big ? '2,000 sq yd and above' : 'Under 2,000 sq yd',
        clause: '8.19',
        far: big ? 6 : 5,
        coveragePct: 70,
        coverageNote: 'new plots (plots already allotted may cover 100%)',
        parkingNeeded: true,
        notes: [
          {
            id: 'bylaw-setbacks-site',
            label: 'Setbacks',
            text: 'As the site needs, unless the layout plan marks them: the plot’s own are checked',
            clause: '8.19',
          },
        ],
      };
    },
  },
  {
    id: 'cda-apartments',
    label: 'Apartment site',
    clause: '8.20',
    uses: ['apartments'],
    limits: (m) => ({
      label: m.sqft > 8 * KANAL_SQ_FT + 1 ? 'Above 8 kanal' : '4 to 8 kanal',
      clause: '8.20',
      far: m.sqft > 8 * KANAL_SQ_FT + 1 ? 5 : 4,
      coveragePct: 50,
      storeysLabel: 'As the CAA allows',
      minSqFt: 4 * KANAL_SQ_FT,
      parkingNeeded: true,
      ...cdaLift(m, '4.1.16(b)'),
      notes: [
        {
          id: 'bylaw-building-gap',
          label: 'Between blocks',
          text: "At least 40' between blocks; roof structures at most 15% of the roof",
          clause: '8.20 (5), (15)',
        },
      ],
    }),
  },
  {
    id: 'cda-hall',
    label: 'Marriage or event hall',
    clause: '8.23',
    uses: ['hall'],
    limits: () => ({
      label: 'Hall',
      clause: '8.23',
      setbacks: sb(30, 15, 15, 15),
      far: 1,
      coveragePct: 50,
      maxStoreys: 2,
      storeysLabel: '2 storeys',
      minSqFt: 2000 * SQ_FT_PER_SQ_YD,
      minFrontageFt: 100,
      minRoadFt: 60,
      parkingNeeded: true,
    }),
  },
];

const CDA: BuildingBylaws = {
  ids: ['cda', 'cda-private'],
  name: 'CDA',
  source: 'ICT Building Control Regulations 2020, as amended by S.R.O. 1074(I)/2023, Section 8',
  areas: CDA_AREAS,
  sqFtPerCar: 250,
  sqFtPerCarClause: '8.1 (9)',
  usesRoadWidth: true,
  heightWithMumty: false,
  parkingFromSqFt: { sqft: 900 * SQ_FT_PER_SQ_YD, clause: '9.9 (1)' },
  parking: (use, m, limits) => {
    if (use === 'mosque') return null;
    if (use === 'hospital') {
      const cars = Math.ceil(1.5 * m.beds) + per(m.clinicalSqFt, 750);
      return {
        cars,
        rule: `1.5 a bed (${m.beds} hospital ${m.beds === 1 ? 'bed' : 'beds'} drawn) and 1 per 750 sq ft of the rest`,
        clause: '8.19',
      };
    }
    if (use === 'apartments' && limits.clause === '8.20')
      return {
        cars: Math.ceil(1.5 * m.flats),
        rule: `1.5 a flat (${m.flats} ${m.flats === 1 ? 'flat' : 'flats'}, counted by their kitchens)`,
        clause: '8.20 (7)',
      };
    if (use === 'hall' || limits.clause === '8.23')
      return { cars: per(m.coveredSqFt, 500), rule: '1 per 500 sq ft of covered area', clause: '8.23 (vi)' };
    return { cars: per(m.coveredSqFt, 750), rule: '1 per 750 sq ft of covered area', clause: '9.9 (1)' };
  },
  facilities: {
    lift: ({ storeys, use, liftAbove }) => {
      const above = liftAbove ?? 4;
      return {
        needed: storeys > above,
        rule:
          liftAbove !== undefined
            ? `One taking a wheelchair above ${above} storeys${use === 'apartments' ? ' (flats)' : ''}`
            : 'One taking a wheelchair above ground + 3',
        clause: '4.1.16(b)',
      };
    },
    emergencyStairs: ({ storeys }) => ({
      count: storeys > 4 ? 1 : 0,
      rule: 'An external emergency stair as well as the internal one above 4 floors',
      clause: '9.9 (4)',
    }),
    ramp: () => ({
      needed: true,
      rule: 'From the footpath to the entrance, in every building other than a house',
      clause: '4.1.16(c)',
    }),
    storeyHeight: { maxMm: ft(14), clause: '4.1.15' },
  },
};

// ——— DHA Islamabad & Rawalpindi ———

const DHA_COMMERCIAL = (main: boolean): BuildingArea => ({
  id: main ? 'dha-main' : 'dha-sector',
  label: main ? 'Main commercial' : 'Sector commercial',
  clause: '8.77.1',
  uses: main
    ? undefined
    : ['shop', 'office', 'restaurant', 'hotel', 'apartments', 'hall', 'factory', 'warehouse', 'other'],
  limits: (m) => {
    const yd = sqyd(m);
    return {
      label: `${main ? 'Main' : 'Sector'} commercial, ${yd <= 400 ? '101 to 400 sq yd' : 'above 400 sq yd'}`,
      clause: '8.77.1',
      setbacks: NONE,
      setbacksClause: '8.77.1',
      coveragePct: 100,
      coverageNote: 'the footprint',
      maxStoreys: main ? 6 : 4,
      storeysLabel: main ? 'Basement + G+5' : 'Basement + G+3',
      heightMm: ft(main ? 82 : 60),
      heightClause: '8.86',
      heightNote: 'with the water tank and mumty',
      minSqFt: 101 * SQ_FT_PER_SQ_YD,
      maxSqFt: 400 * SQ_FT_PER_SQ_YD,
      plotClause: '8.77.1',
      mumty: { sharePct: 30, widthShare: 2 / 3, clause: '8.89' },
      notes:
        yd > 400
          ? [
              {
                id: 'bylaw-large-plot',
                label: 'Plot above 400 sq yd',
                text: 'DHA decides the standards for this plot case by case',
                clause: '8.77.1.2',
              },
            ]
          : [],
    };
  },
});

const DHA: BuildingBylaws = {
  ids: ['dha-isb'],
  name: 'DHA Islamabad & Rawalpindi',
  source: 'DHA Islamabad & Rawalpindi Revised Byelaws & Regulations 2022 (updated 2023), 6.8 and 8.77–8.106',
  sqFtPerCar: 250,
  sqFtPerCarClause: '6.8.12',
  usesRoadWidth: false,
  heightWithMumty: true,
  areas: [
    DHA_COMMERCIAL(false),
    DHA_COMMERCIAL(true),
    {
      id: 'dha-amenity',
      label: 'Amenity plot (school, health, worship)',
      clause: '1.2.3',
      uses: ['school', 'clinic', 'hospital', 'mosque'],
      limits: () => ({
        label: 'Amenity plot',
        clause: '1.2.3',
        notes: [
          {
            id: 'bylaw-amenity',
            label: 'Coverage, height and setbacks',
            text: 'The byelaws give none for amenity plots: check with DHA (the plot’s own setbacks are checked)',
            clause: '1.2.3',
          },
        ],
      }),
    },
  ],
  parking: (use, m) => {
    if (use === 'mosque' || use === 'factory' || use === 'warehouse') return null;
    if (use === 'apartments')
      return { cars: per(m.coveredSqFt, 1000), rule: '1 per 1,000 sq ft of floor area', clause: '6.8.14.2' };
    if (use === 'school') {
      const cars = Math.max(per(m.coveredSqFt, 4000), Math.ceil(m.classrooms / 4));
      return {
        cars,
        rule: `1 per 4,000 sq ft, or a quarter of a car a classroom (${m.classrooms} drawn) if more`,
        clause: '6.8.14.3',
      };
    }
    if (use === 'hospital' || use === 'clinic')
      return { cars: per(m.coveredSqFt, 1500), rule: '1 per 1,500 sq ft of floor area', clause: '6.8.14.4' };
    return { cars: per(m.coveredSqFt, 500), rule: '1 per 500 sq ft of floor area', clause: '6.8.14.1' };
  },
  facilities: {
    lift: () => ({ needed: true, rule: 'At least one taking a wheelchair', clause: '8.91.2' }),
    emergencyStairs: ({ sqft }) => ({
      count: sqft >= 400 * SQ_FT_PER_SQ_YD - 1 ? 1 : 0,
      rule: 'An emergency stair on plots of 16 marla (400 sq yd) and above',
      clause: '8.100',
    }),
    ramp: ({ coveredSqFt }) => ({
      needed: coveredSqFt >= 4500,
      rule: 'An entrance with a ramp (and steps) once the building is 4,500 sq ft or more',
      clause: '8.91.3',
    }),
    storeyHeight: { minMm: ft(8, 6), clause: '8.84' },
    basementMinMm: { mm: ft(8, 6), clause: '8.85.3' },
    plinthMaxMm: { mm: ft(4, 6), clause: '8.80' },
    shops: { minSqFt: 100, clause: '8.84' },
    stairs: { minWidthMm: () => ft(3, 6), maxRiserMm: ft(0, 7), minTreadMm: ft(0, 10), clause: '8.96.1, 8.88.1' },
    notes: [
      {
        id: 'bylaw-ladies-toilets',
        label: 'Toilets',
        text: 'Toilets in each commercial block, with separate ones for ladies',
        clause: '8.92',
      },
    ],
  },
};

// ——— LDA ———

/** An LDA height zone: its name, least plot (sq ft) and road (ft), storeys, height (ft), FAR. */
interface LdaZone {
  name: string;
  minSqFt: number;
  minRoadFt: number;
  storeys?: number;
  storeysLabel: string;
  heightFt?: number;
  far?: number;
  coveragePct: number;
}
const K = KANAL_SQ_FT;
const M = MARLA_SQ_FT;
/** 3.1.1 (and the 2022 order): commercial buildings, converted plots, the CBD. */
const LDA_COMMERCIAL: LdaZone[] = [
  { name: 'Low rise', minSqFt: 0, minRoadFt: 30, storeys: 4, storeysLabel: 'G+3', heightFt: 50, coveragePct: 65 },
  { name: 'Mid rise-1', minSqFt: K, minRoadFt: 40, storeys: 7, storeysLabel: 'G+6', heightFt: 90, coveragePct: 65 },
  {
    name: 'Mid rise-2',
    minSqFt: 2 * K,
    minRoadFt: 40,
    storeys: 10,
    storeysLabel: 'G+9',
    heightFt: 120,
    far: 6,
    coveragePct: 65,
  },
  {
    name: 'High rise-1',
    minSqFt: 4 * K,
    minRoadFt: 50,
    storeys: 16,
    storeysLabel: 'G+14 and a service floor',
    heightFt: 200,
    far: 10,
    coveragePct: 65,
  },
  {
    name: 'High rise-2',
    minSqFt: 6 * K,
    minRoadFt: 80,
    storeys: 25,
    storeysLabel: 'G+23 and a service floor',
    heightFt: 300,
    far: 12,
    coveragePct: 65,
  },
  {
    name: 'Skyscraper',
    minSqFt: 12 * K,
    minRoadFt: 80,
    storeysLabel: "Above 300' (NOC from the CAA)",
    coveragePct: 50,
  },
];
/** 2.5 (and the 2022 order): apartment buildings. */
const LDA_APARTMENTS: LdaZone[] = [
  { name: 'Low rise', minSqFt: 10 * M, minRoadFt: 40, storeys: 4, storeysLabel: 'G+3', heightFt: 48, coveragePct: 65 },
  {
    name: 'Mid rise-1',
    minSqFt: K,
    minRoadFt: 40,
    storeys: 7,
    storeysLabel: 'G+6',
    heightFt: 90,
    far: 5,
    coveragePct: 65,
  },
  {
    name: 'Mid rise-2',
    minSqFt: 2 * K,
    minRoadFt: 40,
    storeys: 12,
    storeysLabel: 'G+11',
    heightFt: 160,
    far: 6,
    coveragePct: 65,
  },
  {
    name: 'High rise-1',
    minSqFt: 4 * K,
    minRoadFt: 60,
    storeys: 16,
    storeysLabel: 'G+14 and a service floor',
    heightFt: 200,
    far: 10,
    coveragePct: 65,
  },
  {
    name: 'High rise-2',
    minSqFt: 8 * K,
    minRoadFt: 80,
    storeys: 25,
    storeysLabel: 'G+23 and a service floor',
    heightFt: 300,
    far: 12,
    coveragePct: 65,
  },
  {
    name: 'Skyscraper',
    minSqFt: 12 * K,
    minRoadFt: 80,
    storeysLabel: "Above 300' (NOC from the CAA)",
    coveragePct: 50,
  },
];
/** 3.9.2: public building sites (the road's width doesn't apply on designated sites). */
const LDA_PUBLIC: LdaZone[] = [
  { name: 'Low rise', minSqFt: 0, minRoadFt: 0, storeys: 4, storeysLabel: 'G+3', heightFt: 48, coveragePct: 65 },
  { name: 'Mid rise-1', minSqFt: K, minRoadFt: 0, storeys: 7, storeysLabel: 'G+6', heightFt: 90, coveragePct: 60 },
  {
    name: 'Mid rise-2',
    minSqFt: 2 * K,
    minRoadFt: 0,
    storeys: 10,
    storeysLabel: 'G+9',
    heightFt: 120,
    far: 5.5,
    coveragePct: 55,
  },
  {
    name: 'High rise-1',
    minSqFt: 4 * K,
    minRoadFt: 0,
    storeys: 16,
    storeysLabel: 'G+14 and a service floor',
    heightFt: 200,
    far: 8,
    coveragePct: 55,
  },
  {
    name: 'High rise-2',
    minSqFt: 8 * K,
    minRoadFt: 0,
    storeys: 25,
    storeysLabel: 'G+23 and a service floor',
    heightFt: 300,
    far: 12,
    coveragePct: 55,
  },
  { name: 'Skyscraper', minSqFt: 12 * K, minRoadFt: 0, storeysLabel: "Above 300' (NOC from the CAA)", coveragePct: 55 },
];
/** 3.3.2: civic, commercial and neighbourhood centres (no road condition; parking from 4 kanal). */
const LDA_CENTRES: LdaZone[] = [
  { name: 'Low rise', minSqFt: 0, minRoadFt: 0, storeys: 3, storeysLabel: 'G+2', heightFt: 38, coveragePct: 87.5 },
  {
    name: 'Mid rise-1',
    minSqFt: 4 * M,
    minRoadFt: 0,
    storeys: 6,
    storeysLabel: 'G+5',
    heightFt: 72,
    coveragePct: 87.5,
  },
  {
    name: 'Mid rise-1',
    minSqFt: 10 * M,
    minRoadFt: 0,
    storeys: 7,
    storeysLabel: 'G+6',
    heightFt: 90,
    coveragePct: 87.5,
  },
  {
    name: 'Mid rise-2',
    minSqFt: 2 * K,
    minRoadFt: 0,
    storeys: 10,
    storeysLabel: 'G+9',
    heightFt: 120,
    far: 5.5,
    coveragePct: 87.5,
  },
  {
    name: 'High rise-1',
    minSqFt: 4 * K,
    minRoadFt: 0,
    storeys: 16,
    storeysLabel: 'G+14 and a service floor',
    heightFt: 200,
    far: 8,
    coveragePct: 87.5,
  },
  {
    name: 'High rise-2',
    minSqFt: 8 * K,
    minRoadFt: 0,
    storeys: 25,
    storeysLabel: 'G+23 and a service floor',
    heightFt: 300,
    far: 12,
    coveragePct: 87.5,
  },
  {
    name: 'Skyscraper',
    minSqFt: 12 * K,
    minRoadFt: 0,
    storeysLabel: "Above 300' (NOC from the CAA)",
    coveragePct: 87.5,
  },
];

/** The highest zone the plot and its road allow (the owner may build to a lower one, 11.1(3)). */
function ldaZone(zones: LdaZone[], m: BuildingMeasures): LdaZone {
  const road = m.roadFt;
  const fits = zones.filter((z) => m.sqft >= z.minSqFt - 1 && (road === undefined || road >= z.minRoadFt - 0.5));
  return fits[fits.length - 1] ?? zones[0];
}

/** Limits from an LDA zone. */
function zoneLimits(
  zones: LdaZone[],
  m: BuildingMeasures,
  clause: string,
  extra: Partial<BuildingLimits>,
): BuildingLimits {
  const z = ldaZone(zones, m);
  const sky = !z.heightFt;
  const roadNote =
    m.roadFt === undefined && !extra.minRoadFt && zones.some((x) => x.minRoadFt > 0)
      ? [
          {
            id: 'bylaw-road',
            label: 'Road width',
            text: 'Type the road’s width under the plot: the zone goes by it as well as by the plot’s size',
            clause: '11.1',
          },
        ]
      : [];
  return {
    label: `${z.name}${m.roadFt !== undefined && z.minRoadFt ? `, road ${Math.round(m.roadFt)}'` : ''}`,
    clause,
    coveragePct: z.coveragePct,
    far: z.far,
    farNote: sky ? "skyscrapers: 4% of the height in feet (400' gives 1:16)" : undefined,
    maxStoreys: z.storeys,
    storeysLabel: z.storeysLabel,
    heightMm: z.heightFt ? ft(z.heightFt) : undefined,
    heightClause: '11.1',
    heightNote: 'to the top of the parapet, without the mumty and lift head',
    ...extra,
    notes: [...roadNote, ...(extra.notes ?? [])],
  };
}

/** 3.6.1: rear and side spaces of converted plots, by size; the front is set for the road. */
function ldaConvertedSetbacks(m: BuildingMeasures): Setbacks {
  const marla = m.sqft / M;
  const [rear, s1, s2] =
    marla < 10 ? [5, 0, 0] : marla < 30 ? [7, 5, 0] : marla < 40 ? [7, 5, 5] : marla < 80 ? [10, 10, 10] : [13, 13, 13];
  return { ...sb(0, s1, s2, rear) };
}

/** 4.1.1 and 4.2.1: industrial setbacks [front, sides, rear] and coverage by plot size. */
function ldaIndustrial(m: BuildingMeasures, builtUp: boolean): BuildingLimits {
  const marla = m.sqft / M;
  const acres = m.sqft / ACRE_SQ_FT;
  const rows: [boolean, string, number, number, number, number][] = builtUp
    ? [
        [marla < 10, 'Under 10 marla', 5, 5, 5, 65],
        [marla <= 20, '10 marla to 1 kanal', 10, 5, 5, 60],
        [marla <= 40, '1 to 2 kanal', 15, 7, 7, 55],
        [marla < 80, '2 to 4 kanal', 20, 13, 13, 55],
        [acres < 1, '4 kanal to 1 acre', 30, 13, 13, 55],
        [acres < 5, '1 to 5 acres', 50, 20, 20, 55],
        [true, '5 acres and above', 70, 20, 20, 55],
      ]
    : [
        [marla <= 20, 'Up to 1 kanal', 10, 5, 5, 55],
        [marla < 80, '1 to 4 kanal', 20, 13, 13, 55],
        [acres < 1, '4 kanal to 1 acre', 30, 13, 13, 55],
        [acres < 5, '1 to 5 acres', 50, 20, 20, 55],
        [true, '5 acres and above', 70, 20, 20, 55],
      ];
  const [, label, front, side, rear, cover] = rows.find((r) => r[0])!;
  const clause = builtUp ? '4.2.1' : '4.1.1';
  return {
    label,
    clause,
    setbacks: sb(front, side, side, rear),
    far: 2,
    coveragePct: cover,
    heightMm: ft(builtUp ? 48 : 90),
    heightClause: builtUp ? '4.2.2' : '4.1.2',
    heightNote: 'to the top of the parapet, without chimneys, lift heads and water towers',
    parkingNeeded: false,
    parkingNote: 'optional',
  };
}

const LDA_AREAS: BuildingArea[] = [
  {
    id: 'lda-converted',
    label: 'Converted plot on a commercial road',
    clause: '3.1.1, 3.6',
    uses: ['shop', 'office', 'restaurant', 'hotel', 'other'],
    limits: (m) =>
      zoneLimits(LDA_COMMERCIAL, m, '3.1.1', {
        setbacks: ldaConvertedSetbacks(m),
        setbacksClause: '3.6.1',
        frontAsTyped:
          'The building line is set for each road by the Commercialization Committee (see the Land Use Rules’ List A): type it as the front setback',
      }),
  },
  {
    id: 'lda-centre',
    label: 'Civic, commercial or neighbourhood centre',
    clause: '3.3',
    limits: (m) => {
      const marla = m.sqft / M;
      const arcade = marla <= 2.5 ? 0 : marla <= 7 ? 5 : 10;
      return zoneLimits(LDA_CENTRES, m, '3.3.2', {
        setbacks: NONE,
        setbacksClause: '3.3.1',
        coveragePct: 87.5,
        upperCoveragePct: 75,
        coverageNote: '7/8 of the plot with the arcade; 3/4 on the floors above',
        verandaMm: arcade ? ft(arcade) : undefined,
        verandaClause: '5.2.2(c), office order 2022',
        parkingNeeded: m.sqft >= 4 * K - 1,
        parkingNote: m.sqft >= 4 * K - 1 ? undefined : 'not needed below 4 kanal in a centre',
      });
    },
  },
  {
    id: 'lda-cbd',
    label: 'Central Business District',
    clause: '3.2',
    limits: (m) =>
      zoneLimits(LDA_COMMERCIAL, m, '3.1.1', {
        setbacks: NONE,
        setbacksClause: '3.2.1',
      }),
  },
  {
    id: 'lda-public',
    label: 'Public building site in a scheme',
    clause: '3.9',
    uses: ['school', 'clinic', 'hospital', 'mosque'],
    limits: (m) => {
      const marla = m.sqft / M;
      const [setbacks, cover, lanes] =
        marla <= 20
          ? [sb(10, 5, 5, 5), 65, 'optional']
          : marla < 40
            ? [sb(20, 10, 10, 10), 60, 'one']
            : marla < 80
              ? [sb(25, 10, 10, 10), 55, "one, 10' wide"]
              : [sb(30, 13, 13, 13), 55, "two, each 10' wide"];
      const mosque = m.use === 'mosque';
      return zoneLimits(LDA_PUBLIC, m, '3.9.2', {
        setbacks: mosque ? { ...NONE, front: setbacks.front } : setbacks,
        setbacksClause: '3.9.1',
        coveragePct: cover,
        coverageClause: '3.9.1',
        notes: [
          {
            id: 'bylaw-drop-lane',
            label: 'Pick-and-drop lane',
            text: `Lanes inside the plot: ${lanes}${m.use === 'school' ? ', in addition to the building line for a school' : ''}`,
            clause: '3.9.1',
          },
        ],
      });
    },
  },
  {
    id: 'lda-apartments',
    label: 'Apartment building',
    clause: '2.5',
    uses: ['apartments'],
    limits: (m) => {
      const marla = m.sqft / M;
      const setbacks = marla >= 80 ? sb(30, 13, 13, 13) : marla >= 40 ? sb(30, 10, 10, 10) : undefined;
      return zoneLimits(LDA_APARTMENTS, m, '2.5', {
        setbacks: setbacks ?? { ...NONE, front: ft(20) },
        setbacksClause: setbacks ? '2.5(a)' : 'office order 2022 (iv)',
        // Under 2 kanal only a 20' front is given: the rear and sides are the plot's own.
        rearAsTyped: !setbacks,
        sidesAsTyped: !setbacks,
        minSqFt: 10 * M,
        minRoadFt: 40,
        minHeightMm: ft(48),
        plotClause: '2.5, office order 2022',
      });
    },
  },
  {
    id: 'lda-hall',
    label: 'Hall, club, theatre or exhibition hall',
    clause: '3.8.3',
    uses: ['hall'],
    limits: (m) =>
      zoneLimits(LDA_COMMERCIAL, m, '3.1.1', {
        setbacks: sb(40, 15, 15, 15),
        setbacksClause: '3.8.3',
        minSqFt: 4 * K,
        plotClause: '3.8.3',
      }),
  },
  {
    id: 'lda-petrol',
    label: 'Petrol or CNG station',
    clause: '3.8.2',
    limits: () => ({
      label: 'Single storey',
      clause: '3.8.2',
      setbacks: sb(20, 5, 5, 5),
      maxStoreys: 1,
      storeysLabel: 'Single storey',
      minSqFt: K,
      minRoadFt: 80,
      minFrontageFt: 60,
      plotClause: "3.8.2 (petrol 1½ kanal and 70' front; CNG 1 kanal and 60')",
    }),
  },
  {
    id: 'lda-bus',
    label: 'Bus or minibus stand',
    clause: '3.8.1',
    limits: () => ({
      label: 'Bus stand',
      clause: '3.8.1',
      setbacks: sb(20, 10, 10, 10),
      coveragePct: 20,
      coverageNote: 'covered area without the parking sheds',
      maxStoreys: 2,
      storeysLabel: '2 floors',
      heightMm: ft(30),
    }),
  },
  {
    id: 'lda-industrial',
    label: 'Industrial estate or zone (schemes, open areas)',
    clause: '4.1',
    uses: ['factory', 'warehouse'],
    limits: (m) => ldaIndustrial(m, false),
  },
  {
    id: 'lda-industrial-builtup',
    label: 'Industrial zone in a built-up area',
    clause: '4.2',
    limits: (m) => ldaIndustrial(m, true),
  },
];

const LDA: BuildingBylaws = {
  ids: ['lda', 'lda-builtup', 'lda-open'],
  name: 'LDA',
  source: 'LDA Building and Zoning Regulations 2019 (amendments to 28 Jan 2020 and the office order of 28 Oct 2022)',
  areas: LDA_AREAS,
  sqFtPerCar: 250,
  sqFtPerCarClause: "Mimar (LDA gives only the 8'×16' stall, 5.7.3)",
  usesRoadWidth: true,
  heightWithMumty: false,
  parking: (use, m, limits) => {
    if (limits.parkingNeeded === false) return null;
    if (use === 'mosque') return null;
    const covered = m.coveredSqFt;
    switch (use) {
      case 'hotel':
        return {
          cars: Math.ceil(m.rooms / 6),
          rule: `1 per 6 rooms (${m.rooms} drawn); more for its shops, offices and restaurant`,
          clause: '3.11',
        };
      case 'hospital':
      case 'clinic':
        return { cars: per(covered, 1400), rule: '1 per 1,400 sq ft of floor area', clause: '3.11' };
      case 'restaurant':
      case 'hall':
        return { cars: per(covered, 500), rule: '1 per 500 sq ft of floor area', clause: '3.11' };
      case 'school':
        return { cars: per(covered, 2000), rule: '1 per 2,000 sq ft of floor area', clause: '3.11' };
      default:
        return {
          cars: per(covered, 1200),
          rule: '1 per 1,200 sq ft of covered area',
          clause: '3.11, office order 2022',
        };
    }
  },
  facilities: {
    lift: ({ sqft }) => ({
      needed: sqft > 7 * M + 1,
      rule: 'In buildings on plots above 7 marla',
      clause: '6.4.2',
    }),
    emergencyStairs: ({ sqft, heightMm }) => ({
      count: heightMm > ft(48) + 1 && sqft >= 10 * M - 1 ? (sqft >= 4 * K - 1 ? 2 : 1) : 0,
      rule: "Above 48' high: 1 on plots under 4 kanal, 2 from 4 kanal (under 10 marla the one stair serves)",
      clause: '5.5.1(f), 6.4.1(g)',
    }),
    ramp: () => ({
      needed: true,
      minWidthMm: ft(4),
      rule: "At least one entrance by a ramp at least 4' wide, no steeper than 1:6",
      clause: '5.2.3',
    }),
    storeyHeight: { minMm: ft(9, 6), maxMm: ft(20), clause: '2.1.2, 3.6.4(x)' },
    basementMinMm: { mm: ft(8), clause: '5.2.1(d)' },
    shops: { minSqFt: 100, minWidthMm: ft(8), clause: '5.2.2(b)' },
    stairs: {
      minWidthMm: ({ storeys, use }) =>
        use === 'apartments' ? (storeys > 5 ? ft(4, 6) : ft(4)) : storeys > 3 ? ft(4) : ft(3, 6),
      maxRiserMm: ft(0, 7.5),
      minTreadMm: ft(0, 10),
      clause: '6.4.1',
    },
  },
};

const ALL: BuildingBylaws[] = [CDA, DHA, LDA];

/** The building bylaws for an authority, if Mimar has them. */
export const buildingBylawsFor = (id: string | undefined): BuildingBylaws | undefined =>
  id ? ALL.find((b) => b.ids.includes(id as AuthorityId)) : undefined;

/** The area a plot is in: the one picked, or the usual one for the building's use. */
export function buildingAreaFor(bylaws: BuildingBylaws, areaId: string | undefined, use: BuildingUse): BuildingArea {
  return (
    bylaws.areas.find((a) => a.id === areaId) ?? bylaws.areas.find((a) => a.uses?.includes(use)) ?? bylaws.areas[0]
  );
}

/** What applies to one building on one plot: the bylaws, the area, the plot's figures and the limits. */
export interface BuildingRule {
  bylaws: BuildingBylaws;
  area: BuildingArea;
  /** The area was picked for the plot (else it is the usual one for the use). */
  picked: boolean;
  measures: BuildingMeasures;
  limits: BuildingLimits;
}

/** A plot's depth from its main road, ft. */
export function plotDepthFt(plot: Plot): number {
  const n = plot.points.length;
  const a = plot.points[plot.front % n];
  const b = plot.points[(plot.front + 1) % n];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / l;
  const ny = (b.x - a.x) / l;
  const d = outlinePoints(plot).map((p) => (p.x - a.x) * nx + (p.y - a.y) * ny);
  return ((Math.max(...d) - Math.min(...d)) * MM_PER_UNIT) / MM_PER_FOOT;
}

/** The building rule for a plot with a building of this use and this many storeys, if Mimar has one. */
export function buildingRuleFor(plot: Plot, use: BuildingUse, storeys: number): BuildingRule | null {
  const bylaws = buildingBylawsFor(plot.authority);
  if (!bylaws) return null;
  const area = buildingAreaFor(bylaws, plot.bylawArea, use);
  const { areaSqFt, frontageFt } = plotMeasures(plot);
  const measures: BuildingMeasures = {
    sqft: areaSqFt,
    frontageFt,
    depthFt: plotDepthFt(plot),
    roadFt: roadWidthFt(plot),
    use,
    storeys,
  };
  return { bylaws, area, picked: area.id === plot.bylawArea, measures, limits: area.limits(measures) };
}

/** The limits' setbacks as a plot rule (none when the plot's own apply). */
export function buildingPlotRule(r: BuildingRule): PlotRule | null {
  const { limits } = r;
  if (!limits.setbacks) return null;
  return {
    label: limits.label,
    setbacks: limits.setbacks,
    frontAsTyped: limits.frontAsTyped,
    altSides: limits.altSides ? [ft(limits.altSides[0]), ft(limits.altSides[1])] : undefined,
    rearAsTyped: limits.rearAsTyped,
    sidesAsTyped: limits.sidesAsTyped,
  };
}
