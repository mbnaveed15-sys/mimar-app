import type { Opening } from '../../types';
import { MM_PER_UNIT } from '../../lib/scale';
import { PLAN } from '../../theme/plan';
import { doorKindOf, openingSymbol, type SymbolStroke } from '../../lib/openingKinds';

/** Line weight and dashes for each part of a door or window symbol. */
const LOOKS: Record<SymbolStroke, { width: number; dash?: string }> = {
  leaf: { width: 2 },
  swing: { width: 1, dash: '4 3' },
  frame: { width: 1.5 },
  glass: { width: 2 },
  hidden: { width: 1, dash: '4 3' },
};

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
  if (opening.flat) {
    // Not cut through: a line along the face it's drawn on, or the outline of a niche (into the wall)
    // or a projection (out from it), dashed as it is above or below the plan's cut.
    const face = opening.face ?? 1;
    const y = face * (wallThickness / 2);
    const depth = (opening.depthMm ?? 0) / MM_PER_UNIT;
    const style = { stroke: selected ? PLAN.selection : depth ? PLAN.wallEdge : PLAN.draft };
    return (
      <g
        data-type={opening.type}
        data-id={opening.id}
        data-flat
        data-depth={depth ? (depth < 0 ? 'niche' : 'projection') : undefined}
        transform={`translate(${opening.x},${opening.y}) rotate(${opening.angle})`}
      >
        {depth ? (
          <polygon
            points={`${-w / 2},${y} ${-w / 2},${y + face * depth} ${w / 2},${y + face * depth} ${w / 2},${y}`}
            style={{ ...style, fill: depth < 0 ? PLAN.paper : 'none' }}
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
        ) : (
          <line x1={-w / 2} y1={y} x2={w / 2} y2={y} style={style} strokeWidth={3} strokeDasharray="6 3" />
        )}
      </g>
    );
  }
  return (
    <g
      data-type={opening.type}
      data-id={opening.id}
      data-kind={opening.type === 'door' ? doorKindOf(opening) : (opening.windowKind ?? 'plain')}
      data-testid={opening.gate ? 'gate' : opening.type === 'window' && opening.open ? 'open-hole' : undefined}
      transform={`translate(${opening.x},${opening.y}) rotate(${opening.angle}) scale(${opening.flipHinge ? -1 : 1},${opening.flipSide ? -1 : 1})`}
    >
      <rect x={-w / 2} y={-t} width={w} height={2 * t} style={{ fill: PLAN.paper }} />
      <line x1={-w / 2} y1={-t} x2={-w / 2} y2={t} style={stroke} strokeWidth={2} />
      <line x1={w / 2} y1={-t} x2={w / 2} y2={t} style={stroke} strokeWidth={2} />
      {openingSymbol(opening, t).map((path, i) => {
        const points = path.points.map(([x, y]) => `${x},${y}`).join(' ');
        const look = LOOKS[path.stroke];
        const style = { stroke: path.stroke === 'glass' ? (color ?? PLAN.glass) : stroke.stroke };
        const props = { points, style, fill: 'none', strokeWidth: look.width, strokeDasharray: look.dash };
        return path.closed ? <polygon key={i} {...props} /> : <polyline key={i} {...props} />;
      })}
    </g>
  );
}
