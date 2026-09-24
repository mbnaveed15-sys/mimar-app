import { formatArea, formatMarla } from '../../lib/units';
import { labelPoint, roomAreaSqMm } from '../../rooms';
import type { MarlaSqFt, Room, Units } from '../../types';

interface Props {
  room: Room;
  color?: string;
  selected: boolean;
  units: Units;
  marlaSqFt: MarlaSqFt;
  showLabel: boolean;
  showFill: boolean;
  k: number;
}

export function RoomShape({ room, color, selected, units, marlaSqFt, showLabel, showFill, k }: Props) {
  const label = labelPoint(room.points);
  const area = roomAreaSqMm(room);
  const text = { textAnchor: 'middle' as const, stroke: '#fff', strokeWidth: 3 * k, paintOrder: 'stroke' as const };
  return (
    <g data-type="room" data-id={room.id}>
      <polygon
        points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
        fill={showFill ? (color ?? '#f1f5f9') : 'none'}
        fillOpacity={color ? 0.45 : 1}
        stroke={selected ? '#2563eb' : 'none'}
        strokeWidth={3 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
      />
      {showLabel && (
        <>
          <text x={label.x} y={label.y - 4 * k} fontSize={13 * k} fontWeight={600} fill="#1e293b" {...text}>
            {room.name}
          </text>
          <text x={label.x} y={label.y + 12 * k} fontSize={11 * k} fill="#475569" {...text} data-testid="room-area">
            {formatArea(area, units)} · {formatMarla(area, marlaSqFt)}
          </text>
        </>
      )}
    </g>
  );
}
