import { gridLevels, type GridLook } from '../lib/grid';
import { PLAN } from '../theme/plan';
import type { Bounds } from '../types';

interface Props {
  area: Bounds;
  /** Distance between grid lines, in plan units. */
  step: number;
  look: GridLook;
  /** Plan units per screen (or output) pixel. */
  k: number;
  /** Makes the pattern ids unique on the page. */
  id: string;
}

/** The plan grid as lines or dots, with a heavier line every few steps. */
export function PlanGrid({ area, step, look, k, id }: Props) {
  const levels = gridLevels(step, look.major, k);
  // 50 is the theme's own grid colour; below fades it, above makes the lines thicker.
  const opacity = look.strength >= 50 ? 1 : 0.15 + (0.85 * look.strength) / 50;
  const weight = look.strength <= 50 ? 1 : 1 + (look.strength - 50) / 50;
  const layers: { size: number; color: string; width: number; dot: number }[] = [];
  if (levels.minor) layers.push({ size: levels.minor, color: PLAN.grid, width: k * weight, dot: 1.1 * k * weight });
  if (levels.major)
    layers.push({ size: levels.major, color: PLAN.gridMajor, width: 1.25 * k * weight, dot: 1.8 * k * weight });

  return (
    <g data-testid={`${id}-grid`} opacity={opacity} pointerEvents="none">
      <defs>
        {layers.map((l, i) =>
          look.style === 'dots' ? (
            <pattern
              key={i}
              id={`${id}-${i}`}
              x={-l.size / 2}
              y={-l.size / 2}
              width={l.size}
              height={l.size}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={l.size / 2} cy={l.size / 2} r={l.dot} style={{ fill: l.color }} />
            </pattern>
          ) : (
            <pattern key={i} id={`${id}-${i}`} width={l.size} height={l.size} patternUnits="userSpaceOnUse">
              <path
                d={`M ${l.size} 0 L 0 0 0 ${l.size}`}
                fill="none"
                style={{ stroke: l.color }}
                strokeWidth={l.width}
              />
            </pattern>
          ),
        )}
      </defs>
      {layers.map((_, i) => (
        <rect
          key={i}
          x={area.minX}
          y={area.minY}
          width={area.maxX - area.minX}
          height={area.maxY - area.minY}
          fill={`url(#${id}-${i})`}
        />
      ))}
    </g>
  );
}
