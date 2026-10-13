import { FurnitureSymbol } from '../../furniture/FurnitureSymbol';
import type { Furniture } from '../../types';
import { PLAN } from '../../theme/plan';
import { isPlant } from '../../furniture/catalog';
import { zoneOf, zoneRects } from '../../furniture/useZones';
import { serviceOf, TRADE_COLORS } from '../../lib/services';

/** Plants and garden greenery on the plan, unless painted. */
const PLANT_FILL = '#cfe3c1';

interface Props {
  item: Furniture;
  color?: string;
  selected: boolean;
  /** Plan units per screen pixel. */
  k: number;
  /** Show the wheelchair (ADA) use zone where the item has one. */
  accessible?: boolean;
  /** The see-through copy that follows the pointer before placing (not a plan item). */
  ghost?: boolean;
  /** Show its use zone even when it isn't selected (exports with use zones on). */
  showZone?: boolean;
}

export function FurnitureShape({ item, color, selected, k, accessible, ghost, showZone }: Props) {
  const { w, h } = item;
  const showLabel = item.label !== undefined || !item.kind;
  const service = serviceOf(item);
  // The free space it needs to be used, shown while it is selected or being placed.
  const zone = selected || ghost || showZone ? zoneOf(item.kind, accessible) : null;
  return (
    <g
      data-type={ghost ? 'furniture-ghost' : 'furniture'}
      data-id={item.id}
      transform={`translate(${item.x},${item.y}) rotate(${item.rotation ?? 0})`}
    >
      {item.kind ? (
        <FurnitureSymbol
          kind={item.kind}
          w={w}
          h={h}
          fill={color ?? (isPlant(item.kind) ? PLANT_FILL : PLAN.furniture)}
          // Services are drawn in their trade's colour (red for electrical, blue for water…).
          stroke={service ? TRADE_COLORS[service.trade] : PLAN.furnitureEdge}
          sw={(service ? 1.4 : 1.2) * k}
        />
      ) : (
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          style={{ fill: color ?? PLAN.furniture, stroke: PLAN.furnitureEdge }}
          strokeWidth={k}
          rx={6}
        />
      )}
      {zone &&
        zoneRects(zone, w, h).map((r) => (
          <rect
            key={r.side}
            data-testid="use-zone"
            x={r.x}
            y={r.y}
            width={r.w}
            height={r.h}
            pointerEvents="none"
            style={{ fill: PLAN.selection, stroke: PLAN.selection }}
            fillOpacity={0.08}
            strokeOpacity={0.6}
            strokeWidth={k}
            strokeDasharray={`${3 * k} ${3 * k}`}
          />
        ))}
      {selected && (
        <rect
          x={-w / 2 - 3 * k}
          y={-h / 2 - 3 * k}
          width={w + 6 * k}
          height={h + 6 * k}
          fill="none"
          style={{ stroke: PLAN.selection }}
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
          style={{ fill: PLAN.ink, stroke: PLAN.paper }}
          strokeWidth={3 * k}
          paintOrder="stroke"
        >
          {item.label ?? 'Furn'}
        </text>
      )}
    </g>
  );
}
