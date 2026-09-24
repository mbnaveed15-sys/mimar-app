import type { Opening } from '../../types';

interface Props {
  opening: Opening;
  color?: string;
  selected: boolean;
}

/** Door (leaf + swing arc) or window (double line with glazing) cut into a wall. */
export function OpeningShape({ opening, color, selected }: Props) {
  const w = opening.width;
  const stroke = selected ? '#2563eb' : '#333';
  return (
    <g
      data-type={opening.type}
      data-id={opening.id}
      transform={`translate(${opening.x},${opening.y}) rotate(${opening.angle}) scale(${opening.flipHinge ? -1 : 1},${opening.flipSide ? -1 : 1})`}
    >
      <rect x={-w / 2} y={-5} width={w} height={10} fill="#fff" />
      <line x1={-w / 2} y1={-6} x2={-w / 2} y2={6} stroke={stroke} strokeWidth={2} />
      <line x1={w / 2} y1={-6} x2={w / 2} y2={6} stroke={stroke} strokeWidth={2} />
      {opening.type === 'door' ? (
        <g>
          <line x1={-w / 2} y1={0} x2={-w / 2} y2={-w} stroke={stroke} strokeWidth={2} />
          <path
            d={`M ${-w / 2} ${-w} A ${w} ${w} 0 0 1 ${w / 2} 0`}
            fill="none"
            stroke={stroke}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        </g>
      ) : (
        <g>
          <line x1={-w / 2} y1={-3} x2={w / 2} y2={-3} stroke={stroke} strokeWidth={1.5} />
          <line x1={-w / 2} y1={3} x2={w / 2} y2={3} stroke={stroke} strokeWidth={1.5} />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={color ?? '#D0F0FF'} strokeWidth={2} />
        </g>
      )}
    </g>
  );
}
