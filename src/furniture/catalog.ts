/** Furniture that can be placed from the library, with real sizes in millimetres (w across, d deep). */
export const FURNITURE_CATALOG = {
  'bed-single': { name: 'Single bed', category: 'Bedroom', w: 900, d: 1950 },
  'bed-double': { name: 'Double bed', category: 'Bedroom', w: 1370, d: 1950 },
  'bed-king': { name: 'King bed', category: 'Bedroom', w: 1830, d: 1980 },
  wardrobe: { name: 'Wardrobe', category: 'Bedroom', w: 1500, d: 600 },
  'side-table': { name: 'Side table', category: 'Bedroom', w: 450, d: 450 },
  'sofa-3': { name: '3-seat sofa', category: 'Drawing & lounge', w: 2100, d: 900 },
  'sofa-2': { name: '2-seat sofa', category: 'Drawing & lounge', w: 1500, d: 900 },
  armchair: { name: 'Armchair', category: 'Drawing & lounge', w: 900, d: 850 },
  'coffee-table': { name: 'Coffee table', category: 'Drawing & lounge', w: 1200, d: 600 },
  'tv-unit': { name: 'TV unit', category: 'Drawing & lounge', w: 1800, d: 450 },
  'dining-4': { name: 'Dining table (4)', category: 'Dining', w: 1200, d: 1650 },
  'dining-6': { name: 'Dining table (6)', category: 'Dining', w: 1800, d: 1650 },
  'dining-8': { name: 'Dining table (8)', category: 'Dining', w: 2700, d: 1650 },
  counter: { name: 'Counter', category: 'Kitchen', w: 1800, d: 600 },
  sink: { name: 'Sink', category: 'Kitchen', w: 900, d: 600 },
  stove: { name: 'Stove', category: 'Kitchen', w: 750, d: 600 },
  fridge: { name: 'Fridge', category: 'Kitchen', w: 750, d: 750 },
  wc: { name: 'WC (commode)', category: 'Bath', w: 400, d: 700 },
  'wc-indian': { name: 'Indian WC', category: 'Bath', w: 450, d: 600 },
  basin: { name: 'Basin', category: 'Bath', w: 550, d: 450 },
  shower: { name: 'Shower', category: 'Bath', w: 900, d: 900 },
  bathtub: { name: 'Bathtub', category: 'Bath', w: 750, d: 1700 },
  stairs: { name: 'Stairs', category: 'Other', w: 1000, d: 3000 },
  car: { name: 'Car', category: 'Other', w: 1800, d: 4500 },
} as const;

export type FurnitureKind = keyof typeof FURNITURE_CATALOG;

export const FURNITURE_KINDS = Object.keys(FURNITURE_CATALOG) as FurnitureKind[];

export const FURNITURE_CATEGORIES = [...new Set(FURNITURE_KINDS.map((k) => FURNITURE_CATALOG[k].category))];

export const isFurnitureKind = (v: unknown): v is FurnitureKind =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(FURNITURE_CATALOG, v);

export const DEFAULT_FURNITURE_KIND: FurnitureKind = 'bed-double';
