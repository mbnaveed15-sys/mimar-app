import type { Wall } from '../../types';
import { thicknessOf, wallPolygon } from '../../walls';
import { directionAlong, pointAlong, wallPath } from '../../lib/arc';
import { isCurtain, mullionStops } from '../../lib/curtain';
import { PLAN } from '../../theme/plan';
import { ringsPath, type Hatch } from '../../lib/hatch';
import { HatchArea } from './Hatching';

interface Props {
  walls: Wall[];
  colorOf: (id?: string) => string | undefined;
  selected: ReadonlySet<string>;
  /** Plan units per screen pixel. */
  k: number;
  /** Metric project: curtain walls' mullions default to 1.2 m rather than 4'. */
  metric?: boolean;
  /** Hatch each wall (by its material) over its fill: the patterns' id and each wall's hatch. */
  hatch?: { uid: string; of: (w: Wall) => Hatch | null };
}

const points = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * All walls, drawn in two passes: outlines first, then fills on top. Where walls meet, the fills
 * cover the outlines between them, so joined walls read as one continuous shape.
 */
export function WallsLayer({ walls, colorOf, selected, k, metric = false, hatch }: Props) {
  const polys = walls.map((w) => {
    const outline = wallPolygon(w, walls);
    return { wall: w, pts: points(outline), outline };
  });
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
            style={{
              fill: selected.has(wall.id)
                ? PLAN.selectedWall
                : isCurtain(wall)
                  ? PLAN.paper
                  : (colorOf(wall.material) ?? PLAN.wall),
            }}
          />
        ))}
      </g>
      {hatch &&
        polys.map(({ wall, outline }) => {
          const h = isCurtain(wall) ? null : hatch.of(wall);
          return h ? <HatchArea key={`h-${wall.id}`} uid={hatch.uid} hatch={h} d={ringsPath([outline])} /> : null;
        })}
      {walls.filter(isCurtain).map((w) => (
        <CurtainMarks key={`cw-${w.id}`} wall={w} k={k} metric={metric} />
      ))}
    </g>
  );
}

/** A glass curtain wall on the plan: the glass down its middle, and a mark across it at each mullion. */
function CurtainMarks({ wall, k, metric }: { wall: Wall; k: number; metric: boolean }) {
  const half = thicknessOf(wall) / 2;
  return (
    <g data-testid="curtain-wall" pointerEvents="none">
      <polyline points={points(wallPath(wall))} fill="none" style={{ stroke: PLAN.glass }} strokeWidth={1.5 * k} />
      {mullionStops(wall, metric).map((t) => {
        const p = pointAlong(wall, t);
        const d = directionAlong(wall, t);
        return (
          <line
            key={t}
            data-testid="mullion"
            x1={p.x - d.y * half}
            y1={p.y + d.x * half}
            x2={p.x + d.y * half}
            y2={p.y - d.x * half}
            style={{ stroke: PLAN.wallEdge }}
            strokeWidth={3 * k}
          />
        );
      })}
    </g>
  );
}
