import type { Opening, Point } from '../../types';
import type { Bend } from '../../lib/arc';
import { MM_PER_UNIT } from '../../lib/scale';
import { PLAN } from '../../theme/plan';
import { bentSymbol, doorKindOf, openingSymbol, type SymbolStroke } from '../../lib/openingKinds';

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
  /** A preview of one about to be placed: not an item on the plan, so it isn't marked as one. */
  ghost?: boolean;
  /** A window on a curved wall: drawn round the curve. */
  bend?: Bend | null;
}

/** Door (leaf + swing arc) or window (double line with glazing) cut into a wall. */
export function OpeningShape({ opening, color, selected, wallThickness, ghost, bend }: Props) {
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
  if (bend) {
    const bent = bentSymbol(opening, t, bend);
    const ptsOf = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      <g
        data-type={ghost ? undefined : opening.type}
        data-id={ghost ? undefined : opening.id}
        data-kind={opening.windowKind ?? 'plain'}
        data-bent
        data-testid={ghost ? undefined : opening.open ? 'open-hole' : undefined}
        transform={`translate(${opening.x},${opening.y}) rotate(${opening.angle})`}
      >
        <polygon points={ptsOf(bent.cover)} style={{ fill: PLAN.paper }} />
        {bent.jambs.map(([a, b], i) => (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} style={stroke} strokeWidth={2} />
        ))}
        {bent.paths.map((path, i) => {
          const look = LOOKS[path.stroke];
          const style = { stroke: path.stroke === 'glass' ? (color ?? PLAN.glass) : stroke.stroke };
          const props = {
            points: ptsOf(path.points),
            style,
            fill: 'none',
            strokeWidth: look.width,
            strokeDasharray: look.dash,
          };
          return path.closed ? <polygon key={i} {...props} /> : <polyline key={i} {...props} />;
        })}
      </g>
    );
  }
  return (
    <g
      data-type={ghost ? undefined : opening.type}
      data-id={ghost ? undefined : opening.id}
      data-kind={opening.type === 'door' ? doorKindOf(opening) : (opening.windowKind ?? 'plain')}
      data-testid={
        ghost ? undefined : opening.gate ? 'gate' : opening.type === 'window' && opening.open ? 'open-hole' : undefined
      }
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
