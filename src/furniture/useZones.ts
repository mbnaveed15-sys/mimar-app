import type { Furniture, Point } from '../types';
import { MM_PER_UNIT } from '../lib/scale';
import type { FurnitureKind } from './catalog';

/**
 * Free space an item needs to be used, in mm out from its edges. The front is the side it is used
 * from (away from the wall; a bed's foot), the back is against the wall, the sides are left and right.
 */
export interface UseZone {
  front?: number;
  back?: number;
  sides?: number;
  /** Only one side needs to be free (a single bed against a wall). */
  oneSide?: boolean;
  /** What to call the front and back in hints ("at its foot"). */
  frontName?: string;
  backName?: string;
}

export interface ItemZones {
  zone: UseZone;
  /** Larger space for a wheelchair user, where the 2010 ADA Standards give one. */
  accessible?: UseZone;
  /** Where the figures come from. */
  source: string;
}

const GENERAL = 'General practice';
const BED: UseZone = { front: 600, sides: 600, frontName: 'at its foot' };
/** ADA 804.2.1: 40" between counters in a galley kitchen. */
const KITCHEN: ItemZones = { zone: { front: 1015 }, source: 'ADA 2010, 804.2.1' };

/**
 * Use zones of library items. Figures are public-domain ADA values or common design values
 * ("General practice"); nothing is taken from copyrighted handbooks. Items not listed need none.
 */
export const USE_ZONES: Partial<Record<FurnitureKind, ItemZones>> = {
  'bed-single': { zone: { ...BED, oneSide: true }, source: GENERAL },
  'bed-double': { zone: BED, source: GENERAL },
  'bed-king': { zone: BED, source: GENERAL },
  wardrobe: { zone: { front: 900 }, source: `${GENERAL} (door swing and standing room)` },
  'sofa-3': { zone: { front: 450 }, source: `${GENERAL} (legroom)` },
  'sofa-2': { zone: { front: 450 }, source: `${GENERAL} (legroom)` },
  armchair: { zone: { front: 450 }, source: `${GENERAL} (legroom)` },
  'coffee-table': { zone: { front: 450 }, source: GENERAL },
  'tv-unit': { zone: { front: 600 }, source: GENERAL },
  // The dining sizes take in the chairs: this is room to walk behind them.
  'dining-4': { zone: { front: 600, back: 600, sides: 600 }, source: GENERAL },
  'dining-6': { zone: { front: 600, back: 600, sides: 600 }, source: GENERAL },
  'dining-8': { zone: { front: 600, back: 600, sides: 600 }, source: GENERAL },
  counter: KITCHEN,
  sink: KITCHEN,
  stove: KITCHEN,
  fridge: KITCHEN,
  // ADA 604.2 and 604.3.1: the WC's centre 16"-18" from a side wall, and 60" from that wall by 56"
  // from the back wall kept clear, so about 34" beside it on the open side.
  wc: {
    zone: { front: 600, sides: 200 },
    accessible: { front: 720, sides: 870, oneSide: true },
    source: `${GENERAL}; ADA 604.2, 604.3.1`,
  },
  'wc-indian': { zone: { front: 600, sides: 200 }, source: GENERAL },
  // ADA 305.3 and 606.2: 30" by 48" in front for a forward approach.
  basin: { zone: { front: 600 }, accessible: { front: 1220, sides: 105 }, source: `${GENERAL}; ADA 305.3, 606.2` },
  // ADA 608.2.1: 36" by 48" in front of a transfer shower.
  shower: { zone: { front: 600 }, accessible: { front: 915, sides: 160 }, source: `${GENERAL}; ADA 608.2.1` },
  // ADA 607.2: 30" along the full length of the tub.
  bathtub: { zone: { sides: 760, oneSide: true }, source: 'ADA 2010, 607.2' },
  bench: { zone: { front: 450 }, source: GENERAL },
  fountain: { zone: { front: 600, back: 600, sides: 600 }, source: GENERAL },
  jhoola: { zone: { front: 1000, back: 1000 }, source: `${GENERAL} (room to swing)` },
  stairs: {
    zone: { front: 1000, back: 1000, frontName: 'at one end', backName: 'at the other end' },
    source: `${GENERAL} (a landing as wide as the stair; check the bylaws)`,
  },
  // ADA 502.3.1: a 60" access aisle beside an accessible parking space.
  car: { zone: { sides: 750 }, accessible: { sides: 1525, oneSide: true }, source: `${GENERAL}; ADA 502.3.1` },
};

export type ZoneSide = 'front' | 'back' | 'left' | 'right';

export interface ZoneRect {
  side: ZoneSide;
  /** In the item's own frame: centred on 0,0, back at the top, in plan units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The use zone that applies to a library item. */
export function zoneOf(kind: FurnitureKind | undefined, accessible = false): UseZone | null {
  const z = kind ? USE_ZONES[kind] : undefined;
  if (!z) return null;
  return (accessible && z.accessible) || z.zone;
}

/** An item's use zone as rectangles round it, in its own frame. */
export function zoneRects(zone: UseZone, w: number, h: number): ZoneRect[] {
  const u = (mm = 0) => mm / MM_PER_UNIT;
  const [f, b, s] = [u(zone.front), u(zone.back), u(zone.sides)];
  const out: ZoneRect[] = [];
  if (f > 0) out.push({ side: 'front', x: -w / 2, y: h / 2, w, h: f });
  if (b > 0) out.push({ side: 'back', x: -w / 2, y: -h / 2 - b, w, h: b });
  if (s > 0) {
    out.push({ side: 'left', x: -w / 2 - s, y: -h / 2, w: s, h });
    out.push({ side: 'right', x: w / 2, y: -h / 2, w: s, h });
  }
  return out;
}

/** A point in an item's own frame, placed on the plan (turned about its centre, then moved). */
export function toPlan(item: Pick<Furniture, 'x' | 'y' | 'rotation'>, p: Point): Point {
  const a = ((item.rotation ?? 0) * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  return { x: item.x + p.x * c - p.y * s, y: item.y + p.x * s + p.y * c };
}

/** Most distance between test points going out from the item (5 cm), so thin walls aren't missed. */
const STEP = 50 / MM_PER_UNIT;

/**
 * Lines of test points across a zone, on the plan: five along the item's edge, each running out from
 * the item to nine tenths of the zone's depth (a little short is still fine).
 */
export function zoneSamples(item: Pick<Furniture, 'x' | 'y' | 'rotation'>, r: ZoneRect): Point[][] {
  const across = r.side === 'front' || r.side === 'back';
  const depth = across ? r.h : r.w;
  // Out from the item: down for the front, up for the back, left and right for the sides.
  const out = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }[r.side];
  const start = { front: r.y, back: r.y + r.h, left: r.x + r.w, right: r.x }[r.side];
  const steps = Math.max(2, Math.ceil((depth * 0.9) / STEP));
  return [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
    const line: Point[] = [];
    for (let i = 1; i <= steps; i++) {
      const d = (depth * 0.9 * i) / steps;
      const p = across ? { x: r.x + r.w * f, y: start + out[1] * d } : { x: start + out[0] * d, y: r.y + r.h * f };
      line.push(toPlan(item, p));
    }
    return line;
  });
}

/** "at its foot (2' 0")"-style words for each side, used by the hints and the side panel. */
export function sideName(zone: UseZone, side: ZoneSide): string {
  if (side === 'front') return zone.frontName ?? 'in front';
  if (side === 'back') return zone.backName ?? 'behind';
  return zone.oneSide ? 'at one side' : 'at each side';
}
