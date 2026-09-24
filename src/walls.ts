import { pointToSegmentDistance } from './geometry';
import { MM_PER_UNIT } from './lib/scale';
import type { PlanElement, Point, Units, Wall } from './types';

/** Standard brick wall: 9 inches. */
export const DEFAULT_WALL_THICKNESS_MM = 228.6;
export const DEFAULT_WALL_THICKNESS = DEFAULT_WALL_THICKNESS_MM / MM_PER_UNIT;

/** Common wall thicknesses: half brick (partition), one brick, one and a half bricks. */
export const WALL_PRESETS_MM: Record<Units, { label: string; mm: number }[]> = {
  imperial: [
    { label: `4½" partition`, mm: 114.3 },
    { label: `9" brick`, mm: 228.6 },
    { label: `13½" brick`, mm: 342.9 },
  ],
  metric: [
    { label: '115 mm partition', mm: 115 },
    { label: '230 mm brick', mm: 230 },
    { label: '345 mm brick', mm: 345 },
  ],
};

export const thicknessOf = (w: Wall) => w.thickness ?? DEFAULT_WALL_THICKNESS;

const JOIN_EPS = 0.5;

/** True when another wall ends at, or runs through, this point. */
function isJoined(p: Point, self: Wall, walls: Wall[]): boolean {
  return walls.some(
    (w) => w.id !== self.id && pointToSegmentDistance(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) <= JOIN_EPS,
  );
}

/**
 * Outline of a wall with its thickness. Ends that meet another wall are extended by half the
 * thickness so corners close; the extension is hidden inside the neighbouring wall.
 */
export function wallPolygon(wall: Wall, walls: Wall[]): Point[] {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const half = thicknessOf(wall) / 2;
  const start = isJoined({ x: wall.x1, y: wall.y1 }, wall, walls) ? half : 0;
  const end = isJoined({ x: wall.x2, y: wall.y2 }, wall, walls) ? half : 0;
  const a = { x: wall.x1 - ux * start, y: wall.y1 - uy * start };
  const b = { x: wall.x2 + ux * end, y: wall.y2 + uy * end };
  const nx = -uy * half;
  const ny = ux * half;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

export const wallsOf = (elements: PlanElement[]) => elements.filter((el): el is Wall => el.type === 'wall');
