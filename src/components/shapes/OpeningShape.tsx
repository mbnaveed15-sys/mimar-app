import type { Opening } from '../../types';
import { PLAN } from '../../theme/plan';

interface Props {
  opening: Opening;
  color?: string;
  selected: boolean;
  /** Thickness of the host wall, so the opening cuts cleanly through it. */
  wallThickness: number;
}

/** Door (leaf + swing arc) or window (double line with glazing) cut into a wall. */
export function OpeningShape({ opening, color, selected, wallThickness }: Props) {
  const w = opening.width;
  const stroke = { stroke: selected ? PLAN.selection : PLAN.wallEdge };
  const t = wallThickness / 2 + 1;
  return (
    <g
      data-type={opening.type}
      data-id={opening.id}
      transform={`translate(${opening.x},${opening.y}) rotate(${opening.angle}) scale(${opening.flipHinge ? -1 : 1},${opening.flipSide ? -1 : 1})`}
    >
      <rect x={-w / 2} y={-t} width={w} height={2 * t} style={{ fill: PLAN.paper }} />
      <line x1={-w / 2} y1={-t} x2={-w / 2} y2={t} style={stroke} strokeWidth={2} />
      <line x1={w / 2} y1={-t} x2={w / 2} y2={t} style={stroke} strokeWidth={2} />
      {opening.type === 'door' && opening.gate ? (
        <g data-testid="gate">
          {/* Two leaves, each half the width, swinging open from either jamb. */}
          <line x1={-w / 2} y1={0} x2={-w / 2} y2={-w / 2} style={stroke} strokeWidth={2} />
          <line x1={w / 2} y1={0} x2={w / 2} y2={-w / 2} style={stroke} strokeWidth={2} />
          <path
            d={`M ${-w / 2} ${-w / 2} A ${w / 2} ${w / 2} 0 0 1 0 0 A ${w / 2} ${w / 2} 0 0 1 ${w / 2} ${-w / 2}`}
            fill="none"
            style={stroke}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </g>
      ) : opening.type === 'door' ? (
        <g>
          <line x1={-w / 2} y1={0} x2={-w / 2} y2={-w} style={stroke} strokeWidth={2} />
          <path
            d={`M ${-w / 2} ${-w} A ${w} ${w} 0 0 1 ${w / 2} 0`}
            fill="none"
            style={stroke}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </g>
      ) : (
        <g>
          <line x1={-w / 2} y1={-(t - 1)} x2={w / 2} y2={-(t - 1)} style={stroke} strokeWidth={1.5} />
          <line x1={-w / 2} y1={t - 1} x2={w / 2} y2={t - 1} style={stroke} strokeWidth={1.5} />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} style={{ stroke: color ?? PLAN.glass }} strokeWidth={2} />
        </g>
      )}
    </g>
  );
}
