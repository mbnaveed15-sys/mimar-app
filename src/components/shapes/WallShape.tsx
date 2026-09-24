import { wallLength } from '../../geometry';
import type { Wall } from '../../types';

interface Props {
  wall: Wall;
  color?: string;
  selected: boolean;
}

export function WallShape({ wall, color, selected }: Props) {
  const { x1, y1, x2, y2 } = wall;
  return (
    <g data-type="wall" data-id={wall.id}>
      {selected && (
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#2563eb"
          strokeOpacity={0.35}
          strokeWidth={16}
          strokeLinecap="round"
        />
      )}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#333" strokeWidth={6} strokeLinecap="round" />
      {color && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={3} strokeLinecap="round" />}
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} fontSize={12} textAnchor="middle">
        {Math.round(wallLength(wall))} px
      </text>
    </g>
  );
}
