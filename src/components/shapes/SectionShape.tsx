import { sectionLook } from '../../lib/drawings/refs';
import { PLAN } from '../../theme/plan';
import type { SectionLine } from '../../types';

/**
 * A section line as architects draw it: a chain line across the plan with a heavy stroke at each
 * end, an arrow at each end pointing the way it looks, and its letter by each arrow.
 */
export function SectionShape({
  line,
  selected,
  k,
  ghost,
  testId = 'section',
}: {
  line: Pick<SectionLine, 'id' | 'x1' | 'y1' | 'x2' | 'y2' | 'label' | 'flip'>;
  selected: boolean;
  k: number;
  /** Drawn on another floor: faint, and not picked. */
  ghost?: boolean;
  testId?: string;
}) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const look = sectionLook(line);
  const colour = selected ? PLAN.selection : PLAN.ink;
  const ends = [
    { x: line.x1, y: line.y1, s: 1 },
    { x: line.x2, y: line.y2, s: -1 },
  ];
  const tick = Math.min(14 * k, len / 3);
  const arrow = 12 * k;
  return (
    <g
      data-type={ghost ? undefined : 'section'}
      data-id={ghost ? undefined : line.id}
      data-testid={testId}
      style={{ color: colour }}
      opacity={ghost ? 0.45 : 1}
      pointerEvents={ghost ? 'none' : undefined}
    >
      <line
        x1={line.x1}
        y1={line.y1}
        x2={line.x2}
        y2={line.y2}
        stroke="currentColor"
        strokeWidth={(selected ? 1.8 : 1) * k}
        strokeDasharray={`${14 * k} ${3 * k} ${2 * k} ${3 * k}`}
      />
      {ends.map((e, i) => {
        // The heavy stroke along the line at its end, the arrow off it, and the letter past the arrow.
        const t = { x: e.x + ux * tick * e.s, y: e.y + uy * tick * e.s };
        const tip = { x: e.x + look.x * arrow * 1.6, y: e.y + look.z * arrow * 1.6 };
        const w = { x: -look.z * arrow * 0.45, y: look.x * arrow * 0.45 };
        const base = { x: e.x + look.x * arrow * 0.5, y: e.y + look.z * arrow * 0.5 };
        const text = { x: tip.x + look.x * 9 * k - ux * e.s * 2 * k, y: tip.y + look.z * 9 * k - uy * e.s * 2 * k };
        return (
          <g key={i}>
            <line x1={e.x} y1={e.y} x2={t.x} y2={t.y} stroke="currentColor" strokeWidth={3 * k} strokeLinecap="butt" />
            <line x1={e.x} y1={e.y} x2={base.x} y2={base.y} stroke="currentColor" strokeWidth={1.2 * k} />
            <path
              d={`M ${tip.x} ${tip.y} L ${base.x + w.x} ${base.y + w.y} L ${base.x - w.x} ${base.y - w.y} Z`}
              fill="currentColor"
            />
            <text
              x={text.x}
              y={text.y}
              fontSize={13 * k}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="central"
              fill="currentColor"
            >
              {line.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
