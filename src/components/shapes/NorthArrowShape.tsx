import { PLAN } from '../../theme/plan';
import type { Point } from '../../types';

/** The north arrow on the plan: a circle with a half-filled arrow and an N, pointing `deg` clockwise from up. */
export function NorthArrowShape({
  at,
  deg,
  k,
  ghost,
  testId = 'north-arrow',
}: {
  at: Point;
  deg: number;
  k: number;
  ghost?: boolean;
  testId?: string;
}) {
  const r = 20 * k;
  const color = ghost ? PLAN.draft : PLAN.ink;
  return (
    <g
      data-testid={testId}
      transform={`translate(${at.x} ${at.y}) rotate(${deg})`}
      style={{ stroke: color }}
      strokeWidth={1.2 * k}
      fill="none"
      pointerEvents="none"
    >
      <circle r={r} />
      <path d={`M0 ${-r} L${-0.4 * r} ${0.6 * r} L0 ${0.25 * r}Z`} style={{ fill: color }} />
      <path d={`M0 ${-r} L${0.4 * r} ${0.6 * r} L0 ${0.25 * r}`} />
      <text y={-r - 5 * k} fontSize={12 * k} textAnchor="middle" stroke="none" style={{ fill: color }} fontWeight={700}>
        N
      </text>
    </g>
  );
}
