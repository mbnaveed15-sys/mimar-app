import { formatArea, formatMarla } from '../../lib/units';
import { labelPoint, roomAreaSqMm } from '../../rooms';
import type { MarlaSqFt, Room, Units } from '../../types';
import { PLAN } from '../../theme/plan';

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
  const text = { textAnchor: 'middle' as const, strokeWidth: 3 * k, paintOrder: 'stroke' as const };
  return (
    <g data-type="room" data-id={room.id}>
      <polygon
        points={room.points.map((p) => `${p.x},${p.y}`).join(' ')}
        style={{ fill: showFill ? (color ?? PLAN.room) : 'none', stroke: selected ? PLAN.selection : 'none' }}
        fillOpacity={color ? 0.45 : 1}
        strokeWidth={3 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
      />
      {showLabel && (
        <>
          <text
            x={label.x}
            y={label.y - 4 * k}
            fontSize={13 * k}
            fontWeight={600}
            style={{ fill: PLAN.ink, stroke: PLAN.paper }}
            {...text}
          >
            {room.name}
          </text>
          <text
            x={label.x}
            y={label.y + 12 * k}
            fontSize={11 * k}
            style={{ fill: PLAN.inkMuted, stroke: PLAN.paper }}
            {...text}
            data-testid="room-area"
          >
            {formatArea(area, units)} · {formatMarla(area, marlaSqFt)}
          </text>
        </>
      )}
    </g>
  );
}
