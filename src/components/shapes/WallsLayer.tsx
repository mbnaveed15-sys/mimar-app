import type { Wall } from '../../types';
import { wallPolygon } from '../../walls';

interface Props {
  walls: Wall[];
  colorOf: (id?: string) => string | undefined;
  selectedId: string | null;
  /** Plan units per screen pixel. */
  k: number;
}

const points = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * All walls, drawn in two passes: outlines first, then fills on top. Where walls meet, the fills
 * cover the outlines between them, so joined walls read as one continuous shape.
 */
export function WallsLayer({ walls, colorOf, selectedId, k }: Props) {
  const polys = walls.map((w) => ({ wall: w, pts: points(wallPolygon(w, walls)) }));
  return (
    <g>
      <g>
        {polys.map(({ wall, pts }) => (
          <polygon
            key={wall.id}
            points={pts}
            fill="#1f2937"
            stroke={wall.id === selectedId ? '#2563eb' : '#1f2937'}
            strokeWidth={(wall.id === selectedId ? 4 : 2) * k}
            strokeLinejoin="miter"
          />
        ))}
      </g>
      <g>
        {polys.map(({ wall, pts }) => (
          <polygon
            key={wall.id}
            data-type="wall"
            data-id={wall.id}
            points={pts}
            fill={wall.id === selectedId ? '#bfdbfe' : (colorOf(wall.material) ?? '#d1d5db')}
          />
        ))}
      </g>
    </g>
  );
}
