import type { Material, Pattern } from '../types';

const texture = (name: string) => `${import.meta.env.BASE_URL}assets/textures/${name}.png`;

export const PATTERNS: Pattern[] = [
  'plain',
  'tiles',
  'brick',
  'wood',
  'marble',
  'granite',
  'terrazzo',
  'stone',
  'concrete',
  'grass',
  'pavers',
  'gravel',
  'metal',
  'glass',
  'fabric',
];

export function defaultMaterials(): Material[] {
  return [
    {
      id: 'mat_concrete',
      name: 'Concrete',
      color: '#D1D5DB',
      texture: texture('concrete'),
      type: 'structure',
      pattern: 'concrete',
      sizeMm: 1000,
    },
    {
      id: 'mat_brick',
      name: 'Brick',
      color: '#B7410E',
      texture: texture('brick'),
      type: 'masonry',
      pattern: 'brick',
      sizeMm: 228.6,
    },
    {
      id: 'mat_wood',
      name: 'Wood',
      color: '#C29B6C',
      texture: texture('wood'),
      type: 'finish',
      pattern: 'wood',
      sizeMm: 180,
    },
    {
      id: 'mat_marble',
      name: 'Marble',
      color: '#F3F4F6',
      texture: texture('marble'),
      type: 'finish',
      pattern: 'marble',
      sizeMm: 609.6,
    },
    { id: 'mat_glass', name: 'Glass', color: '#D0F0FF', texture: '', type: 'glazing', pattern: 'glass' },
  ];
}

export const COLLECTIONS = [
  'Floors',
  'Walls & paint',
  'Outside & site',
  'Timber',
  'Metal',
  'Glass',
  'Structure',
  'Fabric & leather',
] as const;
export type Collection = (typeof COLLECTIONS)[number];

export interface LibraryMaterial extends Material {
  collection: Collection;
}

/** [name, colour, pattern, repeat size in mm] */
type Row = [string, string, Pattern, number];

const TILE_24 = 609.6;
const TILE_12 = 304.8;

const ROWS: Record<Collection, Row[]> = {
  Floors: [
    ['Porcelain tile 2×2, white', '#EEEAE3', 'tiles', TILE_24],
    ['Porcelain tile 2×2, grey', '#B9B6B0', 'tiles', TILE_24],
    ['Porcelain tile 2×2, beige', '#D8C8AE', 'tiles', TILE_24],
    ['Ceramic tile 1×1, cream', '#E4D6BC', 'tiles', TILE_12],
    ['Ceramic tile 1×1, terracotta', '#B86B48', 'tiles', TILE_12],
    ['Ziarat white marble', '#F2F0EC', 'marble', TILE_24],
    ['Botticino marble', '#E3D5BC', 'marble', TILE_24],
    ['Sunny grey marble', '#C9C3B8', 'marble', TILE_24],
    ['Badal marble', '#BDBDBA', 'marble', TILE_24],
    ['Black & gold marble', '#2E2B28', 'marble', TILE_24],
    ['Black granite', '#2B2B2E', 'granite', TILE_24],
    ['Chips floor (terrazzo), white', '#E5E1D8', 'terrazzo', 1219.2],
    ['Chips floor (terrazzo), grey', '#A9A7A2', 'terrazzo', 1219.2],
    ['Oak wooden floor', '#B98B5E', 'wood', 180],
    ['Walnut wooden floor', '#6E4B33', 'wood', 180],
    ['Laminate, light', '#D2B48C', 'wood', 200],
    ['Vinyl plank, grey', '#9C958B', 'wood', 180],
    ['Polished concrete', '#A8A8A6', 'concrete', 2000],
  ],
  'Walls & paint': [
    ['Plaster, white', '#F5F3EE', 'plain', 1000],
    ['Paint, off-white', '#EFE8DA', 'plain', 1000],
    ['Paint, beige', '#E1CFAE', 'plain', 1000],
    ['Paint, light grey', '#D3D3D0', 'plain', 1000],
    ['Paint, sage green', '#B7C4A5', 'plain', 1000],
    ['Paint, sky blue', '#B9D2E3', 'plain', 1000],
    ['Paint, terracotta', '#C9764F', 'plain', 1000],
    ['Paint, charcoal', '#4A4A4C', 'plain', 1000],
    ['Textured plaster', '#E7DFD0', 'concrete', 800],
    ['Exposed red brick', '#A8502F', 'brick', 228.6],
    ['Fair-face (gutka) brick', '#B5532E', 'brick', 228.6],
    ['Stone cladding', '#A89F91', 'stone', 400],
    ['Slate cladding', '#6B6D6E', 'stone', 300],
    ['Wall tile 1×2, white', '#F1F1EE', 'tiles', TILE_12],
  ],
  'Outside & site': [
    ['Grass', '#86A95F', 'grass', 500],
    ['Artificial turf', '#6FA34A', 'grass', 300],
    ['Tuff pavers, grey', '#9A9690', 'pavers', 200],
    ['Tuff pavers, red', '#A3563E', 'pavers', 200],
    ['Concrete paving', '#C0BDB6', 'concrete', 1500],
    ['Gravel', '#B3AB9D', 'gravel', 150],
    ['Asphalt road', '#4B4B4D', 'concrete', 3000],
    ['Sandstone (Kota)', '#C8B08A', 'stone', TILE_24],
    ['Granite paving', '#8C8883', 'granite', TILE_24],
  ],
  Timber: [
    ['Sheesham', '#6B4226', 'wood', 150],
    ['Deodar', '#C79A63', 'wood', 150],
    ['Teak', '#A0703F', 'wood', 150],
    ['Ash', '#D8C3A0', 'wood', 150],
    ['Plywood', '#D4B27E', 'wood', 300],
    ['MDF, white lacquer', '#F4F2EE', 'plain', 1000],
  ],
  Metal: [
    ['MS steel, black paint', '#2E2F31', 'metal', 500],
    ['Galvanised steel', '#A7ABAE', 'metal', 500],
    ['Aluminium', '#C4C7CA', 'metal', 500],
    ['Stainless steel, brushed', '#B9BCBE', 'metal', 300],
    ['Brass', '#B8913F', 'metal', 300],
    ['Wrought iron', '#3A3533', 'metal', 500],
  ],
  Glass: [
    ['Clear glass', '#D0F0FF', 'glass', 1000],
    ['Tinted grey glass', '#7E8A91', 'glass', 1000],
    ['Tinted green glass', '#8FB8A6', 'glass', 1000],
    ['Frosted glass', '#E8EEF0', 'glass', 1000],
    ['Reflective blue glass', '#5F8AA6', 'glass', 1000],
  ],
  Structure: [
    ['RCC concrete', '#C9C6BF', 'concrete', 1000],
    ['Fair-face concrete', '#B5B2AC', 'concrete', 1200],
    ['Cement plaster', '#B8B5AE', 'concrete', 800],
    ['Rubble stone', '#9E9486', 'stone', 350],
    ['Concrete block', '#A9A69F', 'brick', 406.4],
  ],
  'Fabric & leather': [
    ['Fabric, beige', '#CDB99A', 'fabric', 50],
    ['Fabric, grey', '#8E8D8A', 'fabric', 50],
    ['Fabric, navy', '#2F3E5C', 'fabric', 50],
    ['Leather, tan', '#8A5A36', 'fabric', 100],
    ['Leather, black', '#27262A', 'fabric', 100],
  ],
};

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The built-in materials, ready to add to a plan. */
export const MATERIAL_LIBRARY: LibraryMaterial[] = COLLECTIONS.flatMap((collection) =>
  ROWS[collection].map(([name, color, pattern, sizeMm]) => ({
    id: `lib_${slug(name)}`,
    name,
    color,
    texture: '',
    pattern,
    sizeMm,
    collection,
  })),
);

/** Library materials whose name or collection contains every word typed. */
export function searchLibrary(query: string): LibraryMaterial[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return MATERIAL_LIBRARY;
  return MATERIAL_LIBRARY.filter((m) => {
    const text = `${m.name} ${m.collection} ${m.pattern}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

/** A library material as stored in a plan (without its collection). */
export function planMaterial(m: LibraryMaterial): Material {
  return { id: m.id, name: m.name, color: m.color, texture: m.texture, pattern: m.pattern, sizeMm: m.sizeMm };
}
