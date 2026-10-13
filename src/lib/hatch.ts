/**
 * Hatching: the patterns drawings use to show what something is made of where it is cut (brick, concrete,
 * stone, timber, earth, glass), which hatch an item takes, and the hatch's lines inside an outline. Pure.
 */
import type { Material, PlanElement } from '../types';

/** The hatches drawings use, for parts that are cut (walls, slabs) and surfaces seen from above (floors, ground). */
export type Hatch =
  | 'brick'
  | 'block'
  | 'concrete'
  | 'rcc'
  | 'stone'
  | 'timber'
  | 'steel'
  | 'insulation'
  | 'plaster'
  | 'glass'
  | 'earth'
  | 'grass'
  | 'gravel'
  | 'sand'
  | 'water'
  | 'asphalt'
  | 'pavers'
  | 'tiles'
  | 'flagstone'
  | 'planks'
  | 'marble'
  | 'terrazzo';

/** Every hatch, named for the materials list. */
export const HATCHES: { id: Hatch; label: string }[] = [
  { id: 'brick', label: 'Brick' },
  { id: 'block', label: 'Concrete block' },
  { id: 'concrete', label: 'Concrete (plain)' },
  { id: 'rcc', label: 'Reinforced concrete (RCC)' },
  { id: 'stone', label: 'Stone masonry' },
  { id: 'timber', label: 'Timber' },
  { id: 'steel', label: 'Steel and metal' },
  { id: 'insulation', label: 'Insulation' },
  { id: 'plaster', label: 'Plaster and render' },
  { id: 'glass', label: 'Glass' },
  { id: 'earth', label: 'Earth and soil' },
  { id: 'grass', label: 'Grass and lawn' },
  { id: 'gravel', label: 'Gravel' },
  { id: 'sand', label: 'Sand' },
  { id: 'water', label: 'Water' },
  { id: 'asphalt', label: 'Asphalt (tarmac)' },
  { id: 'pavers', label: 'Brick paving and pavers' },
  { id: 'tiles', label: 'Tiles' },
  { id: 'flagstone', label: 'Stone paving' },
  { id: 'planks', label: 'Wood flooring' },
  { id: 'marble', label: 'Marble and granite' },
  { id: 'terrazzo', label: 'Terrazzo' },
];

const isHatch = (x: unknown): x is Hatch => HATCHES.some((h) => h.id === x);

/** A material's own hatch choice: a hatch, 'none' (no hatch: a solid fill when cut) or automatic when missing. */
export const parseHatch = (x: unknown): Hatch | 'none' | undefined => (x === 'none' || isHatch(x) ? x : undefined);

/** Words in a material's name that tell its hatch, most specific first. */
const NAMES: [RegExp, Hatch | null][] = [
  [/rcc|reinforced/, 'rcc'],
  [/block/, 'block'],
  [/brick paving|paver|interlock|tuff/, 'pavers'],
  [/brick/, 'brick'],
  [/asphalt|tarmac|bitumen/, 'asphalt'],
  [/concrete|cement/, 'concrete'],
  [/terrazzo/, 'terrazzo'],
  [/marble|granite/, 'marble'],
  [/flag|paving/, 'flagstone'],
  [/stone/, 'stone'],
  [/parquet|laminate|floorboard|wood floor/, 'planks'],
  [/wood|timber|ply/, 'timber'],
  [/tile|ceramic|porcelain/, 'tiles'],
  [/glass|glaz/, 'glass'],
  [/grass|lawn|turf/, 'grass'],
  [/gravel|bajri|crush/, 'gravel'],
  [/sand/, 'sand'],
  [/water|pool|pond/, 'water'],
  [/earth|soil|mud|clay|fill/, 'earth'],
  [/insul|foam|wool|eps|xps/, 'insulation'],
  [/plaster|render|stucco/, 'plaster'],
  [/steel|metal|iron|alum/, 'steel'],
];

/**
 * The hatch a material asks for: its own choice, else its name, else its pattern. `surface` is for floors and
 * ground seen from above (brick there is brick paving, wood is a wood floor). Null: no hatch; undefined: it
 * doesn't say.
 */
export function hatchOfMaterial(
  m: Pick<Material, 'pattern' | 'name' | 'hatch'> | undefined,
  surface = false,
): Hatch | null | undefined {
  if (!m) return undefined;
  if (m.hatch === 'none') return null;
  if (m.hatch) return m.hatch;
  const name = m.name.toLowerCase();
  for (const [re, h] of NAMES)
    if (re.test(name)) {
      if (surface && h === 'brick') return 'pavers';
      if (surface && h === 'timber') return 'planks';
      return h;
    }
  switch (m.pattern) {
    case 'brick':
      return surface ? 'pavers' : 'brick';
    case 'pavers':
      return 'pavers';
    case 'concrete':
      return 'concrete';
    case 'stone':
      return surface ? 'flagstone' : 'stone';
    case 'granite':
    case 'marble':
      return 'marble';
    case 'terrazzo':
      return 'terrazzo';
    case 'wood':
      return surface ? 'planks' : 'timber';
    case 'tiles':
      return 'tiles';
    case 'glass':
      return 'glass';
    case 'grass':
      return 'grass';
    case 'gravel':
      return 'gravel';
    case 'metal':
      return 'steel';
    case 'plain':
    case 'fabric':
      return surface ? null : undefined;
  }
  return undefined;
}

/**
 * The hatch where a plan item is cut (walls and columns on the plan, everything on a section): its material's
 * when that says, else by what it is (walls brick, a retaining wall and the structure reinforced concrete, a
 * glass wall glass). Null: a solid fill.
 */
export function hatchOf(el: PlanElement | undefined, materials: Material[]): Hatch | null {
  if (!el) return 'rcc';
  const material = 'material' in el ? materials.find((m) => m.id === el.material) : undefined;
  const own = hatchOfMaterial(material);
  if (own !== undefined) return own;
  switch (el.type) {
    case 'wall':
      if (el.kind === 'curtain') return 'glass';
      return el.kind === 'retaining' ? 'rcc' : 'brick';
    case 'column':
    case 'beam':
    case 'slab':
    case 'stair':
    case 'roof':
      return 'rcc';
    default:
      return null;
  }
}

/** The hatch on a surface seen from above (a room's floor, a levelled area, a path): only when its material says. */
export function surfaceHatchOf(materialId: string | undefined, materials: Material[]): Hatch | null {
  const material = materials.find((m) => m.id === materialId);
  return hatchOfMaterial(material, true) ?? null;
}

/**
 * One family of parallel lines in a hatch, as in an AutoCAD pattern: lines at `angle` degrees, `gap` apart
 * (the first `offset` off the origin), each shifted `shift` along from the one before, drawn in dashes
 * (on, -off, ...) or whole. Sizes are paper millimetres.
 */
export interface HatchFamily {
  angle: number;
  gap: number;
  offset?: number;
  shift?: number;
  dashes?: number[];
}

const dots = (angle: number, gap: number, shift: number, every: number, dot = 0.2): HatchFamily => ({
  angle,
  gap,
  shift,
  dashes: [dot, -(every - dot)],
});

/** Each hatch's lines, sized for paper (at 1:100 a 1.5 mm gap is 150 mm on site). */
export const HATCH_FAMILIES: Record<Hatch, HatchFamily[]> = {
  brick: [{ angle: 45, gap: 1.5 }],
  block: [
    { angle: 45, gap: 1.5 },
    { angle: 135, gap: 3, dashes: [1.2, -1.8] },
  ],
  concrete: [
    dots(0, 1.9, 1.1, 2.75, 0.35),
    dots(60, 2.1, 0.7, 2.95, 0.35),
    dots(120, 2.3, 1.5, 2.5, 0.3),
    { angle: 30, gap: 3.1, shift: 2.3, dashes: [0.9, -3.9] },
  ],
  rcc: [
    { angle: 45, gap: 3 },
    dots(0, 1.9, 1.1, 2.75, 0.35),
    dots(60, 2.1, 0.7, 2.95, 0.35),
    { angle: 120, gap: 3.1, shift: 2.3, dashes: [0.8, -3.6] },
  ],
  stone: [
    { angle: 45, gap: 1.5 },
    { angle: 135, gap: 1.5 },
  ],
  timber: [{ angle: 0, gap: 0.9, shift: 1.7, dashes: [3, -0.7] }],
  steel: [
    { angle: 45, gap: 2 },
    { angle: 45, gap: 2, offset: 0.4 },
  ],
  insulation: [
    { angle: 60, gap: 2.4, dashes: [1.4, -1.4] },
    { angle: 120, gap: 2.4, shift: 1.4, dashes: [1.4, -1.4] },
  ],
  plaster: [dots(0, 0.9, 0.45, 0.9, 0.15), dots(90, 1.3, 0.6, 1.1, 0.15)],
  glass: [],
  earth: [
    { angle: 45, gap: 1.2, dashes: [1.4, -1] },
    { angle: 135, gap: 2.4, shift: 1.2, dashes: [0.7, -1.7] },
  ],
  grass: [
    { angle: 90, gap: 3, shift: 1.3, dashes: [0.9, -3.1] },
    { angle: 70, gap: 3, offset: 0.35, shift: 1.3, dashes: [0.8, -3.2] },
    { angle: 110, gap: 3, offset: -0.35, shift: 1.3, dashes: [0.8, -3.2] },
  ],
  gravel: [dots(0, 1.3, 0.7, 1.6, 0.5), dots(60, 1.7, 0.4, 2.1, 0.45), dots(120, 1.9, 1.1, 1.8, 0.4)],
  sand: [dots(0, 0.8, 0.5, 1.1, 0.12), dots(45, 1.1, 0.3, 1.3, 0.12), dots(100, 1.4, 0.9, 1.6, 0.12)],
  water: [
    { angle: 0, gap: 2, shift: 2.6, dashes: [3.5, -1.8] },
    { angle: 0, gap: 2, offset: 0.6, shift: 1.3, dashes: [1.2, -4.1] },
  ],
  asphalt: [dots(0, 0.7, 0.35, 0.9, 0.15), dots(60, 1.5, 0.8, 1.7, 0.3), dots(120, 1.8, 0.5, 2.3, 0.35)],
  pavers: [
    { angle: 0, gap: 1.2 },
    { angle: 90, gap: 1.2, shift: 1.2, dashes: [1.2, -1.2] },
  ],
  tiles: [
    { angle: 0, gap: 3 },
    { angle: 90, gap: 3 },
  ],
  flagstone: [
    { angle: 0, gap: 3 },
    { angle: 90, gap: 2.25, shift: 3, dashes: [3, -3] },
  ],
  planks: [
    { angle: 0, gap: 1.5 },
    { angle: 90, gap: 6, shift: 1.5, dashes: [1.5, -4.5] },
  ],
  marble: [
    { angle: 45, gap: 6, shift: 2, dashes: [4, -3] },
    { angle: 30, gap: 7.5, offset: 2, shift: 3, dashes: [2.5, -5] },
  ],
  terrazzo: [dots(0, 1.2, 0.7, 1.7, 0.3), dots(60, 1.6, 0.4, 2.2, 0.45), dots(150, 2.4, 1.3, 2.6, 0.6)],
};

type XY = [number, number];

/**
 * The hatch's lines inside an outline and its holes (even-odd), in the outline's own units; `scale` is how many
 * of those units make one paper millimetre. The lines line up from the origin, so neighbouring pieces match.
 */
export function hatchSegments(hatch: Hatch, rings: XY[][], scale: number): [XY, XY][] {
  const out: [XY, XY][] = [];
  if (!rings.length || !rings[0] || rings[0].length < 3 || scale <= 0) return out;
  for (const f of HATCH_FAMILIES[hatch]) {
    const rad = (f.angle * Math.PI) / 180;
    const d: XY = [Math.cos(rad), Math.sin(rad)];
    const n: XY = [-d[1], d[0]];
    const gap = f.gap * scale;
    const offset = (f.offset ?? 0) * scale;
    const shift = (f.shift ?? 0) * scale;
    const dashes = f.dashes?.map((x) => x * scale);
    const period = dashes?.reduce((s, x) => s + Math.abs(x), 0) ?? 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const ring of rings)
      for (const p of ring) {
        const t = p[0] * n[0] + p[1] * n[1] - offset;
        lo = Math.min(lo, t);
        hi = Math.max(hi, t);
      }
    // Keep a big outline from making millions of lines.
    if ((hi - lo) / gap > 20_000) continue;
    for (let i = Math.ceil(lo / gap); i * gap <= hi; i++) {
      const off = i * gap + offset;
      // The line: points base + s·d, with base on the normal at `off`, shifted along for this line.
      const base: XY = [n[0] * off + d[0] * shift * i, n[1] * off + d[1] * shift * i];
      const hits: number[] = [];
      for (const ring of rings)
        for (let j = 0; j < ring.length; j++) {
          const a = ring[j];
          const b = ring[(j + 1) % ring.length];
          const ta = a[0] * n[0] + a[1] * n[1] - off;
          const tb = b[0] * n[0] + b[1] * n[1] - off;
          if (ta > 0 === tb > 0) continue;
          const u = ta / (ta - tb);
          const x = a[0] + (b[0] - a[0]) * u;
          const y = a[1] + (b[1] - a[1]) * u;
          hits.push((x - base[0]) * d[0] + (y - base[1]) * d[1]);
        }
      hits.sort((a, b) => a - b);
      for (let j = 0; j + 1 < hits.length; j += 2) {
        const at = (s: number): XY => [base[0] + d[0] * s, base[1] + d[1] * s];
        const [s0, s1] = [hits[j], hits[j + 1]];
        if (s1 - s0 < 1e-9) continue;
        if (!dashes || !period) {
          out.push([at(s0), at(s1)]);
          continue;
        }
        // Walk the dashes from the repeat before s0.
        let s = Math.floor(s0 / period) * period;
        for (let guard = 0; s < s1 && guard < 100_000; guard++)
          for (const dash of dashes) {
            const len = Math.abs(dash);
            if (dash > 0) {
              const a = Math.max(s, s0);
              const b = Math.min(s + len, s1);
              if (b > a) out.push([at(a), at(b)]);
            }
            s += len;
            if (s >= s1) break;
          }
      }
    }
  }
  return out;
}

/** An SVG path through closed outlines. */
export const ringsPath = (rings: { x: number; y: number }[][]) =>
  rings
    .filter((r) => r.length >= 3)
    .map((r) => `M${r.map((p) => `${p.x} ${p.y}`).join('L')}Z`)
    .join(' ');
