import type { DoorKind, Opening, WindowKind } from '../types';

/** Door types, in the order the tool offers them. */
export const DOOR_KINDS: DoorKind[] = ['single', 'double', 'sliding', 'folding', 'shutter', 'opening'];
export const DOOR_KIND_NAMES: Record<DoorKind, string> = {
  single: 'Single',
  double: 'Double',
  sliding: 'Sliding',
  folding: 'Folding',
  shutter: 'Rolling shutter',
  opening: 'Opening only',
};
/** A new door's width (mm) by type. */
export const DOOR_WIDTH_MM: Record<DoorKind, number> = {
  single: 900,
  double: 1500,
  sliding: 1800,
  folding: 1800,
  shutter: 2700,
  opening: 900,
};

/** Window types, in the order the tool offers them. */
export const WINDOW_KINDS: WindowKind[] = ['sliding', 'casement', 'casement2', 'fixed', 'vent'];
export const WINDOW_KIND_NAMES: Record<WindowKind, string> = {
  sliding: 'Sliding',
  casement: 'Casement',
  casement2: 'Double casement',
  fixed: 'Fixed',
  vent: 'Ventilator',
};
/** A new window's width, sill and height (mm) by type: a ventilator is small and high, for baths and kitchens. */
export const WINDOW_SIZE_MM: Record<WindowKind, { width: number; sillMm?: number; heightMm?: number }> = {
  sliding: { width: 1200 },
  casement: { width: 900 },
  casement2: { width: 1200 },
  fixed: { width: 1200 },
  vent: { width: 600, sillMm: 1830, heightMm: 610 },
};

/** The door's type ("single" for doors made before there were types; a gate is a double). */
export const doorKindOf = (o: Opening): DoorKind => (o.gate ? 'double' : (o.doorKind ?? 'single'));

/**
 * How a line of a door or window symbol is drawn: a door leaf or casement sash, its swing, the
 * window frame, the glass, or something above the cut (dashed).
 */
export type SymbolStroke = 'leaf' | 'swing' | 'frame' | 'glass' | 'hidden';

export interface SymbolPath {
  points: [number, number][];
  stroke: SymbolStroke;
  closed?: boolean;
}

const ARC_STEPS = 12;

/** A quarter circle about (cx, 0) from the open leaf (pointing along -y·side) round to the wall line. */
function arc(cx: number, r: number, dir: 1 | -1, side: 1 | -1): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= ARC_STEPS; i++) {
    const th = (i / ARC_STEPS) * (Math.PI / 2);
    pts.push([cx + dir * r * Math.sin(th), -side * r * Math.cos(th)]);
  }
  return pts;
}

/** A swinging leaf hinged at x = hinge, `r` long, opening to the -y side (side 1) or +y (side -1). */
function swing(hinge: number, r: number, dir: 1 | -1, side: 1 | -1 = 1, stroke: SymbolStroke = 'leaf'): SymbolPath[] {
  return [line(hinge, 0, hinge, -side * r, stroke), { points: arc(hinge, r, dir, side), stroke: 'swing' }];
}

const line = (x1: number, y1: number, x2: number, y2: number, stroke: SymbolStroke): SymbolPath => ({
  points: [
    [x1, y1],
    [x2, y2],
  ],
  stroke,
});

const rect = (x1: number, y1: number, x2: number, y2: number, stroke: SymbolStroke): SymbolPath => ({
  points: [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ],
  stroke,
  closed: true,
});

/**
 * The plan symbol of a door or window, inside its gap in the wall, in the opening's own frame: x
 * along the wall from the centre, y across it (doors open to -y), in plan units. `t` is half the
 * wall's thickness. The jambs and the cleared gap are drawn by the caller.
 */
export function openingSymbol(o: Opening, t: number): SymbolPath[] {
  const w = o.width;
  const h = w / 2;
  if (o.type === 'door') {
    switch (doorKindOf(o)) {
      case 'double':
        return [...swing(-h, h, 1), ...swing(h, h, -1)];
      case 'sliding': {
        // Two panels, one sliding past the other.
        const p = Math.max(1, Math.min(4, t / 3));
        return [
          rect(-h, -t / 3 - p / 2, w / 10, -t / 3 + p / 2, 'leaf'),
          rect(-w / 10, t / 3 - p / 2, h, t / 3 + p / 2, 'leaf'),
        ];
      }
      case 'folding': {
        // Panels folded part way open, as a zigzag.
        const n = w > 120 ? 4 : 2;
        const depth = (w / n) * 0.6;
        return [
          {
            points: Array.from({ length: n + 1 }, (_, i): [number, number] => [-h + (i * w) / n, i % 2 ? -depth : 0]),
            stroke: 'leaf',
          },
        ];
      }
      case 'shutter':
        // The shutter's line, and its box above on the inside (dashed: above the cut).
        return [line(-h, -(t - 1), h, -(t - 1), 'leaf'), rect(-h, -t - Math.max(4, t / 2), h, -t, 'hidden')];
      case 'opening':
        return [line(-h, 0, h, 0, 'hidden')];
      default:
        return swing(-h, w, 1);
    }
  }
  if (o.open) return [line(-h, 0, h, 0, 'hidden')];
  const frame = [line(-h, -(t - 1), h, -(t - 1), 'frame'), line(-h, t - 1, h, t - 1, 'frame')];
  switch (o.windowKind) {
    case 'sliding':
      return [...frame, line(-h, -t / 4, w / 10, -t / 4, 'glass'), line(-w / 10, t / 4, h, t / 4, 'glass')];
    case 'casement':
      // The sash opens outwards (+y).
      return [...frame, line(-h, 0, h, 0, 'glass'), ...swing(-h, w, 1, -1)];
    case 'casement2':
      return [...frame, line(-h, 0, h, 0, 'glass'), ...swing(-h, h, 1, -1), ...swing(h, h, -1, -1)];
    case 'vent':
      // High up, above the plan's cut: dashed.
      return [
        line(-h, -(t - 1), h, -(t - 1), 'hidden'),
        line(-h, t - 1, h, t - 1, 'hidden'),
        line(-h, 0, h, 0, 'hidden'),
      ];
    default:
      return [...frame, line(-h, 0, h, 0, 'glass')];
  }
}
