import type { BuildingUse, ProjectType } from '../types';

/**
 * Furniture that can be placed from the library, with real sizes in millimetres (w across, d deep), in
 * groups (Home, Office…) and categories within them. Sizes are common ones, or ADA 2010 figures for
 * wheelchair spaces and accessible WCs; nothing is taken from copyrighted handbooks.
 */
export const FURNITURE_CATALOG = {
  'bed-single': { name: 'Single bed', group: 'Home', category: 'Bedroom', w: 900, d: 1950 },
  'bed-double': { name: 'Double bed', group: 'Home', category: 'Bedroom', w: 1370, d: 1950 },
  'bed-king': { name: 'King bed', group: 'Home', category: 'Bedroom', w: 1830, d: 1980 },
  wardrobe: { name: 'Wardrobe', group: 'Home', category: 'Bedroom', w: 1500, d: 600 },
  'side-table': { name: 'Side table', group: 'Home', category: 'Bedroom', w: 450, d: 450 },
  'sofa-3': { name: '3-seat sofa', group: 'Home', category: 'Drawing & lounge', w: 2100, d: 900 },
  'sofa-2': { name: '2-seat sofa', group: 'Home', category: 'Drawing & lounge', w: 1500, d: 900 },
  armchair: { name: 'Armchair', group: 'Home', category: 'Drawing & lounge', w: 900, d: 850 },
  'coffee-table': { name: 'Coffee table', group: 'Home', category: 'Drawing & lounge', w: 1200, d: 600 },
  'tv-unit': { name: 'TV unit', group: 'Home', category: 'Drawing & lounge', w: 1800, d: 450 },
  'dining-4': { name: 'Dining table (4)', group: 'Home', category: 'Dining', w: 1200, d: 1650 },
  'dining-6': { name: 'Dining table (6)', group: 'Home', category: 'Dining', w: 1800, d: 1650 },
  'dining-8': { name: 'Dining table (8)', group: 'Home', category: 'Dining', w: 2700, d: 1650 },
  counter: { name: 'Counter', group: 'Home', category: 'Kitchen', w: 1800, d: 600 },
  sink: { name: 'Sink', group: 'Home', category: 'Kitchen', w: 900, d: 600 },
  stove: { name: 'Stove', group: 'Home', category: 'Kitchen', w: 750, d: 600 },
  fridge: { name: 'Fridge', group: 'Home', category: 'Kitchen', w: 750, d: 750 },
  wc: { name: 'WC (commode)', group: 'Home', category: 'Bath', w: 400, d: 700 },
  'wc-indian': { name: 'Indian WC', group: 'Home', category: 'Bath', w: 450, d: 600 },
  basin: { name: 'Basin', group: 'Home', category: 'Bath', w: 550, d: 450 },
  shower: { name: 'Shower', group: 'Home', category: 'Bath', w: 900, d: 900 },
  bathtub: { name: 'Bathtub', group: 'Home', category: 'Bath', w: 750, d: 1700 },
  'plant-small': { name: 'Potted plant (small)', group: 'Garden & plants', category: 'Plants', w: 400, d: 400 },
  'plant-large': { name: 'Potted plant (large)', group: 'Garden & plants', category: 'Plants', w: 700, d: 700 },
  planter: { name: 'Planter box', group: 'Garden & plants', category: 'Plants', w: 1200, d: 400 },
  'tree-small': { name: 'Tree (small)', group: 'Garden & plants', category: 'Garden', w: 2500, d: 2500 },
  'tree-large': { name: 'Tree (large)', group: 'Garden & plants', category: 'Garden', w: 5000, d: 5000 },
  palm: { name: 'Palm', group: 'Garden & plants', category: 'Garden', w: 3000, d: 3000 },
  shrub: { name: 'Shrub', group: 'Garden & plants', category: 'Garden', w: 1000, d: 1000 },
  hedge: { name: 'Hedge', group: 'Garden & plants', category: 'Garden', w: 3000, d: 600 },
  'flower-bed': { name: 'Flower bed', group: 'Garden & plants', category: 'Garden', w: 2000, d: 800 },
  bench: { name: 'Garden bench', group: 'Garden & plants', category: 'Garden', w: 1500, d: 600 },
  fountain: { name: 'Fountain', group: 'Garden & plants', category: 'Garden', w: 1500, d: 1500 },
  jhoola: { name: 'Jhoola (garden swing)', group: 'Garden & plants', category: 'Garden', w: 2000, d: 1200 },
  stairs: { name: 'Stairs', group: 'General', category: 'Other', w: 1000, d: 3000 },
  car: { name: 'Car', group: 'General', category: 'Other', w: 1800, d: 4500 },
  // Home extras (1.43).
  'dressing-table': { name: 'Dressing table', group: 'Home', category: 'Bedroom', w: 1200, d: 450 },
  'bunk-bed': { name: 'Bunk bed', group: 'Home', category: 'Bedroom', w: 900, d: 1950 },
  'study-desk': { name: 'Study desk', group: 'Home', category: 'Study & laundry', w: 1200, d: 600 },
  bookshelf: { name: 'Bookshelf', group: 'Home', category: 'Study & laundry', w: 900, d: 350 },
  'washing-machine': { name: 'Washing machine', group: 'Home', category: 'Study & laundry', w: 600, d: 600 },
  // Offices.
  'office-desk': { name: 'Desk', group: 'Office', category: 'Desks', w: 1600, d: 800 },
  'l-desk': { name: 'L-shaped desk', group: 'Office', category: 'Desks', w: 1600, d: 1600 },
  'workstation-4': { name: 'Workstations (4)', group: 'Office', category: 'Desks', w: 3200, d: 1600 },
  'office-chair': { name: 'Office chair', group: 'Office', category: 'Desks', w: 650, d: 650 },
  'meeting-6': { name: 'Meeting table (6)', group: 'Office', category: 'Meeting', w: 2000, d: 2100 },
  'meeting-10': { name: 'Meeting table (10)', group: 'Office', category: 'Meeting', w: 3600, d: 2100 },
  'reception-desk': { name: 'Reception desk', group: 'Office', category: 'Reception & storage', w: 2000, d: 900 },
  'filing-cabinet': { name: 'Filing cabinet', group: 'Office', category: 'Reception & storage', w: 470, d: 620 },
  bookcase: { name: 'Bookcase', group: 'Office', category: 'Reception & storage', w: 1000, d: 400 },
  lockers: { name: 'Lockers', group: 'Office', category: 'Reception & storage', w: 900, d: 500 },
  copier: { name: 'Copier', group: 'Office', category: 'Reception & storage', w: 700, d: 700 },
  // Schools.
  'student-desk': { name: 'Student desk', group: 'School', category: 'Classroom', w: 600, d: 1000 },
  'student-desk-2': { name: 'Student desk (2)', group: 'School', category: 'Classroom', w: 1200, d: 1000 },
  'teacher-desk': { name: "Teacher's desk", group: 'School', category: 'Classroom', w: 1400, d: 700 },
  whiteboard: { name: 'Whiteboard', group: 'School', category: 'Classroom', w: 2400, d: 100 },
  'cubby-lockers': { name: 'Cubby lockers', group: 'School', category: 'Classroom', w: 1200, d: 400 },
  'lab-bench': { name: 'Lab bench', group: 'School', category: 'Library & lab', w: 2400, d: 750 },
  'library-shelves': { name: 'Library shelves', group: 'School', category: 'Library & lab', w: 1800, d: 600 },
  'reading-table': { name: 'Reading table (6)', group: 'School', category: 'Library & lab', w: 1800, d: 2000 },
  // Clinics and hospitals.
  'exam-couch': { name: 'Examination couch', group: 'Health', category: 'Clinic', w: 650, d: 1900 },
  'medicine-cabinet': { name: 'Medicine cabinet', group: 'Health', category: 'Clinic', w: 900, d: 450 },
  'scrub-sink': { name: 'Scrub sink', group: 'Health', category: 'Clinic', w: 1500, d: 600 },
  'wheelchair-space': { name: 'Wheelchair space', group: 'Health', category: 'Clinic', w: 760, d: 1220 },
  'hospital-bed': { name: 'Hospital bed', group: 'Health', category: 'Ward', w: 1000, d: 2200 },
  'bedside-cabinet': { name: 'Bedside cabinet', group: 'Health', category: 'Ward', w: 450, d: 450 },
  'waiting-seats': { name: 'Waiting seats (3)', group: 'Health', category: 'Ward', w: 1650, d: 600 },
  // Shops.
  gondola: { name: 'Shelving (two-sided)', group: 'Shop', category: 'Shelving', w: 1200, d: 900 },
  'wall-shelving': { name: 'Wall shelving', group: 'Shop', category: 'Shelving', w: 1000, d: 450 },
  'clothes-rail': { name: 'Clothes rail', group: 'Shop', category: 'Shelving', w: 1500, d: 500 },
  'display-fridge': { name: 'Display fridge', group: 'Shop', category: 'Shelving', w: 1250, d: 750 },
  checkout: { name: 'Checkout counter', group: 'Shop', category: 'Counters', w: 1800, d: 800 },
  'fitting-room': { name: 'Fitting room', group: 'Shop', category: 'Counters', w: 1000, d: 1000 },
  // Mosques and prayer halls.
  'prayer-mat': { name: 'Prayer space (1)', group: 'Prayer', category: 'Prayer hall', w: 700, d: 1200 },
  'prayer-row': { name: 'Prayer row (10)', group: 'Prayer', category: 'Prayer hall', w: 4800, d: 1200 },
  minbar: { name: 'Minbar', group: 'Prayer', category: 'Prayer hall', w: 900, d: 2000 },
  rehal: { name: 'Quran stand', group: 'Prayer', category: 'Prayer hall', w: 350, d: 300 },
  'quran-shelf': { name: 'Quran shelf', group: 'Prayer', category: 'Prayer hall', w: 1200, d: 300 },
  'wudu-taps': { name: 'Wudu taps (5)', group: 'Prayer', category: 'Wudu & shoes', w: 3500, d: 1100 },
  'shoe-rack': { name: 'Shoe rack', group: 'Prayer', category: 'Wudu & shoes', w: 1200, d: 350 },
  // Restaurants and canteens.
  'cafe-2': { name: 'Café table (2)', group: 'Food', category: 'Tables', w: 700, d: 1500 },
  'cafe-4': { name: 'Café table (4)', group: 'Food', category: 'Tables', w: 800, d: 1900 },
  'booth-4': { name: 'Booth (4)', group: 'Food', category: 'Tables', w: 1200, d: 1800 },
  'serving-counter': { name: 'Serving counter', group: 'Food', category: 'Serving', w: 2400, d: 800 },
  // Public toilets.
  urinal: { name: 'Urinal', group: 'Toilets', category: 'Public toilets', w: 400, d: 350 },
  'wc-cubicle': { name: 'WC cubicle', group: 'Toilets', category: 'Public toilets', w: 900, d: 1500 },
  'accessible-wc': { name: 'Accessible WC', group: 'Toilets', category: 'Public toilets', w: 1525, d: 1500 },
  'basin-row': { name: 'Basin row (3)', group: 'Toilets', category: 'Public toilets', w: 1800, d: 550 },
  'baby-change': { name: 'Baby change', group: 'Toilets', category: 'Public toilets', w: 900, d: 600 },
  'hand-dryer': { name: 'Hand dryer', group: 'Toilets', category: 'Public toilets', w: 300, d: 250 },
  // Anywhere.
  'water-cooler': { name: 'Water cooler', group: 'General', category: 'Services', w: 400, d: 400 },
  vending: { name: 'Vending machine', group: 'General', category: 'Services', w: 900, d: 850 },
  'notice-board': { name: 'Notice board', group: 'General', category: 'Services', w: 1200, d: 50 },
  dustbin: { name: 'Dustbin', group: 'General', category: 'Services', w: 400, d: 400 },
  motorbike: { name: 'Motorbike', group: 'General', category: 'Other', w: 800, d: 2000 },
} as const;

export type FurnitureKind = keyof typeof FURNITURE_CATALOG;

export const FURNITURE_KINDS = Object.keys(FURNITURE_CATALOG) as FurnitureKind[];

/** The library's top groups, in the order shown. */
export const FURNITURE_GROUPS = [
  'Home',
  'Office',
  'School',
  'Health',
  'Shop',
  'Prayer',
  'Food',
  'Toilets',
  'Garden & plants',
  'General',
] as const;

export type FurnitureGroup = (typeof FURNITURE_GROUPS)[number];

/** Categories in the order shown: by group, then as listed. */
export const FURNITURE_CATEGORIES = [
  ...new Set(
    FURNITURE_GROUPS.flatMap((g) => FURNITURE_KINDS.filter((k) => FURNITURE_CATALOG[k].group === g)).map(
      (k) => FURNITURE_CATALOG[k].category,
    ),
  ),
];

/** A group's categories, in order. */
export const categoriesOf = (group: FurnitureGroup) => [
  ...new Set(
    FURNITURE_KINDS.filter((k) => FURNITURE_CATALOG[k].group === group).map((k) => FURNITURE_CATALOG[k].category),
  ),
];

export const isFurnitureKind = (v: unknown): v is FurnitureKind =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE_CATALOG, v);

export const DEFAULT_FURNITURE_KIND: FurnitureKind = 'bed-double';

/** Living things: drawn green on the plan unless painted. */
export const isPlant = (kind?: FurnitureKind) =>
  !!kind &&
  [
    'plant-small',
    'plant-large',
    'planter',
    'tree-small',
    'tree-large',
    'palm',
    'shrub',
    'hedge',
    'flower-bed',
  ].includes(kind);

/** The library group a project opens on: its building's use, or Home. */
export function groupForProject(type: ProjectType, use?: BuildingUse): FurnitureGroup {
  if (type !== 'building') return 'Home';
  const byUse: Record<BuildingUse, FurnitureGroup> = {
    office: 'Office',
    school: 'School',
    clinic: 'Health',
    hospital: 'Health',
    shop: 'Shop',
    restaurant: 'Food',
    hotel: 'Home',
    apartments: 'Home',
    hall: 'Food',
    mosque: 'Prayer',
    factory: 'General',
    warehouse: 'General',
    other: 'General',
  };
  return byUse[use ?? 'other'];
}
