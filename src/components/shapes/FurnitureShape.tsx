import type { Furniture } from '../../types';

interface Props {
  item: Furniture;
  color?: string;
  selected: boolean;
}

export function FurnitureShape({ item, color, selected }: Props) {
  return (
    <g
      data-type="furniture"
      data-id={item.id}
      transform={`translate(${item.x},${item.y}) rotate(${item.rotation ?? 0})`}
    >
      <rect
        x={-item.w / 2}
        y={-item.h / 2}
        width={item.w}
        height={item.h}
        fill={color ?? '#e2e8f0'}
        stroke={selected ? '#2563eb' : '#94a3b8'}
        strokeWidth={selected ? 3 : 1}
        rx={6}
      />
      <text x={0} y={4} fontSize={10} textAnchor="middle">
        {item.label ?? 'Furn'}
      </text>
    </g>
  );
}
