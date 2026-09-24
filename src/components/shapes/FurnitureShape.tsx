import { FurnitureSymbol } from '../../furniture/FurnitureSymbol';
import type { Furniture } from '../../types';

interface Props {
  item: Furniture;
  color?: string;
  selected: boolean;
  /** Plan units per screen pixel. */
  k: number;
}

export function FurnitureShape({ item, color, selected, k }: Props) {
  const { w, h } = item;
  const showLabel = item.label !== undefined || !item.kind;
  return (
    <g
      data-type="furniture"
      data-id={item.id}
      transform={`translate(${item.x},${item.y}) rotate(${item.rotation ?? 0})`}
    >
      {item.kind ? (
        <FurnitureSymbol kind={item.kind} w={w} h={h} fill={color ?? '#ffffff'} stroke="#374151" sw={1.2 * k} />
      ) : (
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill={color ?? '#e2e8f0'}
          stroke="#94a3b8"
          strokeWidth={k}
          rx={6}
        />
      )}
      {selected && (
        <rect
          x={-w / 2 - 3 * k}
          y={-h / 2 - 3 * k}
          width={w + 6 * k}
          height={h + 6 * k}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2 * k}
          strokeDasharray={`${5 * k} ${3 * k}`}
        />
      )}
      {showLabel && (
        <text
          x={0}
          y={0}
          fontSize={11 * k}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1f2937"
          stroke="#fff"
          strokeWidth={3 * k}
          paintOrder="stroke"
        >
          {item.label ?? 'Furn'}
        </text>
      )}
    </g>
  );
}
