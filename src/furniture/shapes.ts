import type { FurnitureKind } from './catalog';

/**
 * Library items drawn from one list of parts, for both the plan symbol and the 3D model. Places are
 * shares of the item's width and depth (0,0 = back left, the wall side); heights are in metres.
 */
export type ShapePart =
  | {
      /** A box: fx, fy, fw, fd. */
      box: [number, number, number, number];
      /** From height y0 for h metres; a box without one is drawn on the plan only. */
      z?: [number, number];
      color?: string;
      /** Keeps its own colour when the item is painted (screens, glass, water). */
      keep?: boolean;
      /** Corner rounding on the plan, as a share of the smaller side. */
      round?: number;
      /** Dashed on the plan (a curtain, a space kept clear). */
      dash?: boolean;
      /** Built in 3D only (legs and panels hidden under a top in plan). */
      plan?: false;
    }
  | {
      /** A circle: fx, fy and its radius as a share of the smaller side. */
      disc: [number, number, number];
      z?: [number, number];
      color?: string;
      keep?: boolean;
      dash?: boolean;
      plan?: false;
    }
  | { line: [number, number, number, number]; dash?: boolean };

export const WOOD = '#9b7653';
export const FABRIC = '#b9a38a';
export const WHITE = '#f8fafc';
export const COUNTER = '#d6d3d1';
const METAL = '#94a3b8';
const DARK = '#374151';
const SCREEN = '#111827';
const GLASS = '#bfdbfe';
const STEEL = '#9ca3af';
const PALE = '#e5e7eb';
const STONE = '#c9c2b8';
const WATER = '#8fc9e8';
const CARPET = '#7f1d1d';

/** A table or desk top at 0.7 m with end panels under it. */
const desk = (fx: number, fy: number, fw: number, fd: number, color = WOOD): ShapePart[] => [
  { box: [fx, fy, 0.04 * fw, fd], z: [0, 0.7], color, plan: false },
  { box: [fx + 0.96 * fw, fy, 0.04 * fw, fd], z: [0, 0.7], color, plan: false },
  { box: [fx, fy, fw, fd], z: [0.7, 0.04], color },
];

/** A screen on a desk, near its back. */
const screen = (fx: number, fy: number, fw: number): ShapePart => ({
  box: [fx, fy, fw, 0.03],
  z: [0.74, 0.4],
  color: SCREEN,
  keep: true,
});

/** A chair `fd` deep across fx..fx+fw, its back to the top (away from the table) or the bottom. */
const chair = (fx: number, fy: number, fw: number, fd: number, back: 'top' | 'bottom', color = FABRIC): ShapePart[] => {
  const bd = fd * 0.2;
  return [
    { box: [fx, fy, fw, fd], z: [0, 0.45], color, round: 0.1 },
    { box: [fx, back === 'top' ? fy : fy + fd - bd, fw, bd], z: [0.45, 0.4], color },
  ];
};

/** `n` chairs along the top and bottom edges between fx0 and fx1, each `fd` deep. */
const chairRows = (n: number, fx0: number, fx1: number, fd: number, color = FABRIC): ShapePart[] => {
  const step = (fx1 - fx0) / n;
  const cw = step * 0.62;
  return Array.from({ length: n }, (_, i) => fx0 + step * (i + 0.5) - cw / 2).flatMap((cx) => [
    ...chair(cx, 0.01, cw, fd, 'top', color),
    ...chair(cx, 0.99 - fd, cw, fd, 'bottom', color),
  ]);
};

/** A chair at each end of a table, `fw` wide (a share of the width) and `fd` deep. */
const endChairs = (fw: number, fd: number): ShapePart[] => [
  { box: [0.005, 0.5 - fd / 2, fw, fd], z: [0, 0.45], color: FABRIC, round: 0.1 },
  { box: [0.995 - fw, 0.5 - fd / 2, fw, fd], z: [0, 0.45], color: FABRIC, round: 0.1 },
];

/** Lines dividing an item into `n` across (doors, shelves, lockers). */
const across = (n: number, fy0 = 0, fy1 = 1): ShapePart[] =>
  Array.from({ length: n - 1 }, (_, i) => ({ line: [(i + 1) / n, fy0, (i + 1) / n, fy1] }));

/** A cabinet or unit from the floor up, divided into `n` across on the plan. */
const unit = (h: number, color: string, n = 1): ShapePart[] => [{ box: [0, 0, 1, 1], z: [0, h], color }, ...across(n)];

/** Parts of the items added in 1.43; the older ones are drawn by hand in FurnitureSymbol and the 3D model. */
export const SHAPES: Partial<Record<FurnitureKind, ShapePart[]>> = {
  // Home.
  'dressing-table': [
    { box: [0, 0, 1, 1], z: [0, 0.75], color: WOOD },
    { box: [0.25, 0, 0.5, 0.08], z: [0.75, 0.8], color: GLASS, keep: true },
    ...across(3, 0.2, 1),
  ],
  'bunk-bed': [
    { box: [0, 0, 1, 1], z: [0, 0.4], color: FABRIC, round: 0.03 },
    { box: [0, 0, 1, 1], z: [1.3, 0.2], color: FABRIC, plan: false },
    { box: [0.15, 0.04, 0.7, 0.12], z: [1.5, 0.1], color: WHITE, round: 0.04 },
    { box: [0.9, 0.4, 0.1, 0.04], z: [0, 1.6], color: WOOD },
    { line: [0, 0.3, 1, 0.3] },
    { line: [0, 1, 1, 0.3], dash: true },
  ],
  'study-desk': [...desk(0, 0, 1, 1), ...across(3, 0, 1).slice(1)],
  bookshelf: unit(1.8, WOOD, 3),
  'washing-machine': [
    { box: [0, 0, 1, 1], z: [0, 0.85], color: WHITE, round: 0.05 },
    { disc: [0.5, 0.55, 0.3], z: [0.85, 0.01], color: METAL, keep: true },
    { line: [0, 0.15, 1, 0.15] },
  ],
  // Offices.
  'office-desk': [...desk(0, 0, 1, 1), screen(0.35, 0.1, 0.3)],
  'l-desk': [...desk(0, 0, 1, 0.5), ...desk(0, 0.5, 0.5, 0.5), screen(0.3, 0.05, 0.25)],
  'workstation-4': [
    { box: [0, 0.49, 1, 0.02], z: [0, 1.2], color: '#64748b' },
    ...desk(0, 0, 0.5, 0.49),
    ...desk(0.5, 0, 0.5, 0.49),
    ...desk(0, 0.51, 0.5, 0.49),
    ...desk(0.5, 0.51, 0.5, 0.49),
    screen(0.17, 0.42, 0.16),
    screen(0.67, 0.42, 0.16),
    screen(0.17, 0.55, 0.16),
    screen(0.67, 0.55, 0.16),
  ],
  'office-chair': [
    { disc: [0.5, 0.5, 0.5] },
    { box: [0.45, 0.45, 0.1, 0.1], z: [0, 0.4], color: DARK, keep: true, plan: false },
    { box: [0.12, 0.2, 0.76, 0.72], z: [0.4, 0.1], color: FABRIC, round: 0.15 },
    { box: [0.12, 0.06, 0.76, 0.14], z: [0.5, 0.55], color: FABRIC, round: 0.05 },
  ],
  'meeting-6': [...chairRows(3, 0.05, 0.95, 0.22), { box: [0.05, 0.26, 0.9, 0.48], z: [0, 0.75], color: WOOD }],
  'meeting-10': [
    ...chairRows(4, 0.13, 0.87, 0.22),
    ...endChairs(0.11, 0.22),
    { box: [0.13, 0.26, 0.74, 0.48], z: [0, 0.75], color: WOOD },
  ],
  'reception-desk': [{ box: [0, 0.7, 1, 0.3], z: [0, 1.1], color: WOOD }, ...desk(0, 0, 1, 0.7), screen(0.4, 0.4, 0.2)],
  'filing-cabinet': [...unit(1.32, STEEL), { line: [0.1, 0.85, 0.9, 0.85] }],
  bookcase: unit(2, WOOD, 3),
  lockers: unit(1.8, STEEL, 3),
  copier: [
    { box: [0, 0, 1, 1], z: [0, 1.1], color: PALE },
    { box: [0.1, 0.1, 0.8, 0.5], z: [1.1, 0.05], color: SCREEN, keep: true },
  ],
  // Schools.
  'student-desk': [...desk(0, 0, 1, 0.45), ...chair(0.15, 0.55, 0.7, 0.4, 'bottom', WOOD)],
  'student-desk-2': [
    ...desk(0, 0, 1, 0.45),
    ...chair(0.07, 0.55, 0.36, 0.4, 'bottom', WOOD),
    ...chair(0.57, 0.55, 0.36, 0.4, 'bottom', WOOD),
  ],
  'teacher-desk': [...desk(0, 0, 1, 1), ...across(3).slice(1)],
  whiteboard: [
    { box: [0, 0, 1, 1], z: [0.9, 1.2], color: WHITE },
    { box: [0, 0.5, 1, 0.5], z: [0.86, 0.03], color: METAL, plan: false },
    { line: [0.05, 0.5, 0.95, 0.5] },
  ],
  'cubby-lockers': unit(1.2, WOOD, 4),
  'lab-bench': [
    { box: [0, 0, 1, 1], z: [0, 0.9], color: COUNTER },
    { box: [0.45, 0.2, 0.1, 0.5], z: [0.9, 0.01], color: METAL, keep: true },
    { disc: [0.2, 0.15, 0.06], z: [0.9, 0.12], color: METAL, keep: true },
    { disc: [0.8, 0.15, 0.06], z: [0.9, 0.12], color: METAL, keep: true },
  ],
  'library-shelves': [...unit(2, WOOD, 3), { line: [0, 0.5, 1, 0.5] }],
  'reading-table': [...chairRows(3, 0, 1, 0.22, WOOD), { box: [0, 0.25, 1, 0.5], z: [0, 0.75], color: WOOD }],
  // Clinics and hospitals.
  'exam-couch': [
    { box: [0, 0, 1, 1], z: [0, 0.7], color: '#7c9aa8', round: 0.05 },
    { box: [0.1, 0.03, 0.8, 0.12], z: [0.7, 0.08], color: WHITE, round: 0.04 },
    { line: [0, 0.3, 1, 0.3] },
  ],
  'medicine-cabinet': [...unit(1.9, WHITE, 2), { line: [0.03, 0.5, 0.97, 0.5], dash: true }],
  'scrub-sink': [
    { box: [0, 0, 1, 1], z: [0, 0.9], color: METAL },
    { box: [0.06, 0.2, 0.4, 0.62], z: [0.9, 0.01], color: '#64748b', keep: true, round: 0.08 },
    { box: [0.54, 0.2, 0.4, 0.62], z: [0.9, 0.01], color: '#64748b', keep: true, round: 0.08 },
    { disc: [0.26, 0.1, 0.05] },
    { disc: [0.74, 0.1, 0.05] },
  ],
  'wheelchair-space': [
    { box: [0, 0, 1, 1], z: [0, 0.005], color: '#93c5fd', keep: true, dash: true },
    { disc: [0.5, 0.42, 0.25] },
    { line: [0.25, 0.8, 0.75, 0.8] },
  ],
  'hospital-bed': [
    { box: [0.05, 0.03, 0.9, 0.94], z: [0, 0.6], color: WHITE },
    { box: [0, 0, 1, 0.04], z: [0, 1], color: METAL },
    { box: [0, 0.96, 1, 0.04], z: [0, 0.8], color: METAL },
    { box: [0.2, 0.06, 0.6, 0.1], z: [0.6, 0.1], color: WHITE, round: 0.04 },
    { line: [0.05, 0.3, 0.95, 0.3] },
    { box: [0, 0.3, 0.04, 0.4], z: [0.6, 0.35], color: METAL },
    { box: [0.96, 0.3, 0.04, 0.4], z: [0.6, 0.35], color: METAL },
  ],
  'bedside-cabinet': [...unit(0.75, WHITE), { line: [0, 0.85, 1, 0.85] }],
  'waiting-seats': [
    { box: [0, 0.4, 1, 0.1], z: [0, 0.4], color: DARK, keep: true, plan: false },
    ...[0, 1, 2].flatMap((i): ShapePart[] => [
      { box: [i / 3 + 0.02, 0.18, 0.29, 0.78], z: [0.4, 0.06], color: FABRIC, round: 0.08 },
      { box: [i / 3 + 0.02, 0.02, 0.29, 0.16], z: [0.4, 0.45], color: FABRIC },
    ]),
  ],
  // Shops.
  gondola: [...unit(1.6, PALE, 2), { line: [0, 0.5, 1, 0.5] }],
  'wall-shelving': unit(2, PALE, 3),
  'clothes-rail': [
    { box: [0, 0.3, 0.03, 0.4], z: [0, 1.45], color: METAL, plan: false },
    { box: [0.97, 0.3, 0.03, 0.4], z: [0, 1.45], color: METAL, plan: false },
    { box: [0.04, 0.1, 0.92, 0.8], z: [0.5, 0.9], color: FABRIC, round: 0.1 },
    { box: [0, 0.47, 1, 0.06], z: [1.4, 0.04], color: METAL, keep: true },
    ...[0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((fx): ShapePart => ({ line: [fx - 0.05, 0.15, fx, 0.85] })),
  ],
  'display-fridge': [
    { box: [0, 0, 1, 1], z: [0, 2], color: PALE },
    { box: [0.04, 0.9, 0.92, 0.1], z: [0.1, 1.8], color: GLASS, keep: true },
    { line: [0.5, 0.9, 0.5, 1] },
  ],
  checkout: [
    { box: [0, 0, 1, 1], z: [0, 0.9], color: COUNTER },
    { box: [0.05, 0.1, 0.25, 0.35], z: [0.9, 0.25], color: SCREEN, keep: true },
    { box: [0.38, 0.2, 0.58, 0.6], z: [0.9, 0.02], color: DARK, keep: true },
  ],
  'fitting-room': [
    { box: [0, 0, 1, 0.03], z: [0, 2.1], color: WHITE },
    { box: [0, 0, 0.03, 1], z: [0, 2.1], color: WHITE },
    { box: [0.97, 0, 0.03, 1], z: [0, 2.1], color: WHITE },
    { box: [0.03, 0.97, 0.94, 0.03], z: [0.3, 1.8], color: FABRIC, dash: true },
    { box: [0.1, 0.05, 0.5, 0.25], z: [0, 0.45], color: WOOD },
  ],
  // Mosques and prayer halls.
  'prayer-mat': [
    { box: [0.05, 0.02, 0.9, 0.96], z: [0, 0.01], color: CARPET, round: 0.05 },
    { box: [0.2, 0.08, 0.6, 0.22], round: 0.3 },
    { line: [0.05, 0.75, 0.95, 0.75] },
  ],
  'prayer-row': [
    ...Array.from({ length: 10 }, (_, i): ShapePart => ({
      box: [i / 10 + 0.004, 0.02, 0.092, 0.96],
      z: [0, 0.01],
      color: CARPET,
    })),
    { line: [0, 0.3, 1, 0.3] },
  ],
  minbar: [
    ...Array.from({ length: 6 }, (_, i): ShapePart => ({
      box: [0, 1 - (i + 1) / 6, 1, 1 / 6],
      z: [0, (i + 1) * 0.25],
      color: WOOD,
    })),
    { box: [0, 0, 1, 1 / 6], z: [1.5, 1.2], color: WOOD, plan: false },
  ],
  rehal: [{ box: [0, 0, 1, 1], z: [0, 0.25], color: WOOD }, { line: [0, 0.5, 1, 0.5] }],
  'quran-shelf': unit(1.2, WOOD, 3),
  'wudu-taps': [
    { box: [0, 0, 1, 0.1], z: [0, 0.9], color: STONE },
    { box: [0, 0.1, 1, 0.3], z: [0, 0.4], color: STONE },
    { box: [0.01, 0.13, 0.98, 0.24], z: [0.4, 0.01], color: WATER, keep: true },
    ...Array.from({ length: 5 }, (_, i): ShapePart[] => [
      { disc: [(i + 0.5) / 5, 0.05, 0.04], z: [0.75, 0.05], color: METAL, keep: true },
      { box: [(i + 0.5) / 5 - 0.05, 0.6, 0.1, 0.25], z: [0, 0.35], color: STONE },
    ]).flat(),
  ],
  'shoe-rack': unit(1, WOOD, 4),
  // Restaurants and canteens.
  'cafe-2': [...chairRows(1, 0.05, 0.95, 0.28), { box: [0.07, 0.33, 0.86, 0.34], z: [0, 0.75], color: WOOD }],
  'cafe-4': [...chairRows(2, 0, 1, 0.24), { box: [0, 0.27, 1, 0.46], z: [0, 0.75], color: WOOD }],
  'booth-4': [
    { box: [0, 0, 1, 0.3], z: [0, 0.45], color: FABRIC },
    { box: [0, 0, 1, 0.08], z: [0.45, 0.65], color: FABRIC },
    { box: [0, 0.7, 1, 0.3], z: [0, 0.45], color: FABRIC },
    { box: [0, 0.92, 1, 0.08], z: [0.45, 0.65], color: FABRIC },
    { box: [0.05, 0.32, 0.9, 0.36], z: [0, 0.75], color: WOOD },
  ],
  'serving-counter': [
    { box: [0, 0, 1, 1], z: [0, 0.9], color: COUNTER },
    ...[0, 1, 2, 3].map((i): ShapePart => ({
      box: [i / 4 + 0.03, 0.15, 0.19, 0.4],
      z: [0.9, 0.01],
      color: METAL,
      keep: true,
    })),
    { box: [0, 0.65, 1, 0.03], z: [0.9, 0.45], color: GLASS, keep: true },
  ],
  // Public toilets.
  urinal: [
    { box: [0.1, 0, 0.8, 0.2], z: [0.3, 0.7], color: WHITE },
    { disc: [0.5, 0.5, 0.45], z: [0.35, 0.4], color: WHITE },
    { disc: [0.5, 0.55, 0.25] },
  ],
  'wc-cubicle': [
    { box: [0, 0, 0.03, 1], z: [0.15, 1.8], color: '#64748b' },
    { box: [0.97, 0, 0.03, 1], z: [0.15, 1.8], color: '#64748b' },
    { box: [0.03, 0.97, 0.94, 0.03], z: [0.15, 1.8], color: '#64748b', dash: true },
    { box: [0.28, 0, 0.44, 0.13], z: [0, 0.75], color: WHITE, round: 0.05 },
    { disc: [0.5, 0.3, 0.17], z: [0, 0.4], color: WHITE },
  ],
  'accessible-wc': [
    { box: [0, 0, 1, 1], dash: true },
    { box: [0.14, 0, 0.28, 0.13], z: [0, 0.75], color: WHITE, round: 0.05 },
    { disc: [0.28, 0.33, 0.17], z: [0, 0.45], color: WHITE },
    { box: [0, 0.2, 0.02, 0.6], z: [0.85, 0.04], color: METAL, keep: true },
    { box: [0.05, 0, 0.5, 0.02], z: [0.85, 0.04], color: METAL, keep: true },
    { box: [0.68, 0, 0.27, 0.3], z: [0.75, 0.15], color: WHITE, round: 0.05 },
    { disc: [0.6, 0.55, 0.45], dash: true },
  ],
  'basin-row': [
    { box: [0, 0, 1, 0.1], z: [0, 0.8], color: COUNTER, plan: false },
    { box: [0, 0, 1, 1], z: [0.8, 0.1], color: COUNTER },
    ...[0, 1, 2].map((i): ShapePart => ({ disc: [(i + 0.5) / 3, 0.55, 0.3], z: [0.9, 0.01], color: PALE, keep: true })),
  ],
  'baby-change': [
    { box: [0, 0, 1, 1], z: [0.85, 0.1], color: WHITE },
    { box: [0.1, 0.12, 0.8, 0.76], round: 0.15 },
  ],
  'hand-dryer': [{ box: [0, 0, 1, 1], z: [1, 0.3], color: WHITE, round: 0.2 }, { disc: [0.5, 0.6, 0.25] }],
  // Anywhere.
  'water-cooler': [
    { box: [0, 0, 1, 1], z: [0, 1], color: PALE },
    { disc: [0.5, 0.5, 0.35], z: [1, 0.45], color: GLASS, keep: true },
  ],
  vending: [
    { box: [0, 0, 1, 1], z: [0, 1.85], color: '#b91c1c' },
    { box: [0.05, 0.94, 0.6, 0.06], z: [0.6, 1.1], color: GLASS, keep: true },
  ],
  'notice-board': [{ box: [0, 0, 1, 1], z: [1, 0.9], color: '#d6b88a' }, { line: [0.02, 0.5, 0.98, 0.5] }],
  dustbin: [{ disc: [0.5, 0.5, 0.5], z: [0, 0.7], color: DARK }, { disc: [0.5, 0.5, 0.3] }],
  motorbike: [
    { box: [0.42, 0, 0.16, 0.25], z: [0, 0.6], color: DARK, keep: true },
    { box: [0.42, 0.75, 0.16, 0.25], z: [0, 0.6], color: DARK, keep: true },
    { box: [0.3, 0.12, 0.4, 0.76], z: [0.3, 0.6], color: SCREEN, round: 0.3 },
    { box: [0, 0.2, 1, 0.04], z: [1, 0.04], color: METAL, keep: true },
  ],
};
