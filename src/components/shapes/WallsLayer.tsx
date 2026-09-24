import type { Wall } from '../../types';
import { wallPolygon } from '../../walls';
import { PLAN } from '../../theme/plan';

interface Props {
  walls: Wall[];
  colorOf: (id?: string) => string | undefined;
  selected: ReadonlySet<string>;
  /** Plan units per screen pixel. */
  k: number;
}

const points = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * All walls, drawn in two passes: outlines first, then fills on top. Where walls meet, the fills
 * cover the outlines between them, so joined walls read as one continuous shape.
 */
export function WallsLayer({ walls, colorOf, selected, k }: Props) {
  const polys = walls.map((w) => ({ wall: w, pts: points(wallPolygon(w, walls)) }));
  return (
    <g>
      <g>
        {polys.map(({ wall, pts }) => (
          <polygon
            key={wall.id}
            points={pts}
            style={{ fill: PLAN.wallEdge, stroke: selected.has(wall.id) ? PLAN.selection : PLAN.wallEdge }}
            strokeWidth={(selected.has(wall.id) ? 4 : 2) * k}
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
            style={{ fill: selected.has(wall.id) ? PLAN.selectedWall : (colorOf(wall.material) ?? PLAN.wall) }}
          />
        ))}
      </g>
    </g>
  );
}
