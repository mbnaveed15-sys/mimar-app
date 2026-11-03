/**
 * Room minimums: the least sizes Mimar checks a house plan against (corridors, doors, stairs),
 * each with where it comes from. Figures are millimetres; ADA figures are the 2010 ADA Standards
 * (US government work, public domain), "General practice" ones are common design values to check
 * against local practice. Nothing is taken from copyrighted handbooks.
 */
import type { Point } from '../types';

export interface RoomMinimum {
  id: 'corridor' | 'door' | 'entrance' | 'stair' | 'wc' | 'kitchen-galley' | 'kitchen-u' | 'turning';
  /** What it is the least size of. */
  what: string;
  mm: number;
  /** For a wheelchair user (the ADA figure), where it differs. */
  accessibleMm?: number;
  source: string;
  /** How Mimar uses it. */
  checked: string;
}

const GENERAL = 'General practice';

export const ROOM_MINIMUMS: RoomMinimum[] = [
  {
    id: 'corridor',
    what: 'Corridor or passage, clear width',
    mm: 900,
    accessibleMm: 915,
    source: `${GENERAL}; ADA 403.5.1 (36")`,
    checked: 'Rooms named Corridor, Passage or Lobby',
  },
  {
    id: 'door',
    what: 'Door into a room, leaf width',
    mm: 750,
    accessibleMm: 915,
    source: `${GENERAL}; ADA 404.2.3 (32" clear, about a 3' leaf)`,
    checked: 'Swing, sliding and folding doors',
  },
  {
    id: 'entrance',
    what: 'Front door, leaf width',
    mm: 900,
    accessibleMm: 915,
    source: `${GENERAL}; ADA 404.2.3`,
    checked: 'Doors from outside into the house',
  },
  {
    id: 'stair',
    what: 'Stair, width',
    mm: 900,
    source: `${GENERAL} (check the bylaws)`,
    checked: 'Stairs and ramps',
  },
  {
    id: 'wc',
    what: 'Toilet room, inside width',
    mm: 900,
    accessibleMm: 1525,
    source: `${GENERAL}; ADA 604.3.1 (60")`,
    checked: 'Bathrooms (with Good sizes)',
  },
  {
    id: 'kitchen-galley',
    what: 'Kitchen aisle between counters (galley)',
    mm: 1015,
    source: 'ADA 2010, 804.2.1 (40")',
    checked: 'The counters’ use zone',
  },
  {
    id: 'kitchen-u',
    what: 'Kitchen aisle, U-shaped',
    mm: 1525,
    source: 'ADA 2010, 804.2.2 (60")',
    checked: 'Reference only',
  },
  {
    id: 'turning',
    what: 'Wheelchair turning space',
    mm: 1525,
    source: 'ADA 2010, 304.3.1 (60" circle)',
    checked: 'Reference only',
  },
];

export const minimumOf = (id: RoomMinimum['id'], accessible = false): number => {
  const row = ROOM_MINIMUMS.find((r) => r.id === id)!;
  return (accessible && row.accessibleMm) || row.mm;
};

/** Rooms that are ways through: corridors, passages, lobbies. */
export const PASSAGE = /corridor|passage|lobby|gallery|hallway/i;

/**
 * How wide a room is at its narrowest, square to its own sides (so a corridor drawn at an angle is
 * measured across, not by its box): the least spread across any of its edges' directions.
 */
export function narrowWidth(points: Point[]): number {
  return Math.min(hullWidth(points), legWidth(points));
}

/**
 * The narrowest leg of a room: from the middle of each side, straight across to the side facing it, counting
 * only sides at least as long as that (so a shallow recess or a nib doesn't count, but each leg of an L does).
 */
function legWidth(points: Point[]): number {
  const n = points.length;
  const area = points.reduce((t, p, i) => t + p.x * points[(i + 1) % n].y - points[(i + 1) % n].x * p.y, 0);
  const inward = area > 0 ? 1 : -1;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    // Into the room: left of a→b when the outline runs counter-clockwise (in plan x, y).
    const d = { x: (-(b.y - a.y) / len) * inward, y: ((b.x - a.x) / len) * inward };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let across = Infinity;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const c = points[j];
      const e = points[(j + 1) % n];
      // Ray m + t·d against segment c→e.
      const ex = e.x - c.x;
      const ey = e.y - c.y;
      const den = d.x * ey - d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((c.x - m.x) * ey - (c.y - m.y) * ex) / den;
      const u = ((c.x - m.x) * d.y - (c.y - m.y) * d.x) / den;
      if (t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9) across = Math.min(across, t);
    }
    if (across <= len + 1e-6) best = Math.min(best, across);
  }
  return best;
}

/** Width across the narrowest way of the room's outline as a whole (a turned room measured square to it). */
function hullWidth(points: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const d = points.map((p) => p.x * n.x + p.y * n.y);
    best = Math.min(best, Math.max(...d) - Math.min(...d));
  }
  return Number.isFinite(best) ? best : 0;
}
