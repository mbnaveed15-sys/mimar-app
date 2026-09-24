import { wallLength } from '../../geometry';
import { formatLength } from '../../lib/units';
import { MM_PER_UNIT } from '../../store/plannerStore';
import type { Units, Wall } from '../../types';

interface Props {
  wall: Wall;
  units: Units;
  /** Plan units per screen pixel, so the line keeps the same on-screen size at any zoom. */
  k: number;
}

const COLOR = '#475569';

/** Architectural dimension line drawn beside a wall, with its real length. */
export function WallDimension({ wall, units, k }: Props) {
  const len = wallLength(wall);
  if (len * (1 / k) < 24) return null; // too short on screen to label
  const ux = (wall.x2 - wall.x1) / len;
  const uy = (wall.y2 - wall.y1) / len;
  const nx = uy;
  const ny = -ux;
  const off = 20 * k;
  const a = { x: wall.x1 + nx * off, y: wall.y1 + ny * off };
  const b = { x: wall.x2 + nx * off, y: wall.y2 + ny * off };
  const tick = 4 * k;
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  const mid = { x: (a.x + b.x) / 2 + nx * 6 * k, y: (a.y + b.y) / 2 + ny * 6 * k };

  return (
    <g data-type="dimension" stroke={COLOR} strokeWidth={k}>
      <line x1={wall.x1 + nx * 4 * k} y1={wall.y1 + ny * 4 * k} x2={a.x + nx * tick} y2={a.y + ny * tick} />
      <line x1={wall.x2 + nx * 4 * k} y1={wall.y2 + ny * 4 * k} x2={b.x + nx * tick} y2={b.y + ny * tick} />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {[a, b].map((p, i) => (
        <line
          key={i}
          x1={p.x - (ux + nx) * tick}
          y1={p.y - (uy + ny) * tick}
          x2={p.x + (ux + nx) * tick}
          y2={p.y + (uy + ny) * tick}
          strokeWidth={1.5 * k}
        />
      ))}
      <text
        x={mid.x}
        y={mid.y}
        transform={`rotate(${angle} ${mid.x} ${mid.y})`}
        fontSize={11 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={COLOR}
        stroke="#fff"
        strokeWidth={3 * k}
        paintOrder="stroke"
      >
        {formatLength(len * MM_PER_UNIT, units)}
      </text>
    </g>
  );
}
