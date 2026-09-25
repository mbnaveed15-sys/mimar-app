import { elementOutline } from '../geometry';
import { PLAN } from '../theme/plan';
import type { PlanElement, Point } from '../types';
import { thicknessOf } from '../walls';
import { usePlanCheck } from '../store/usePlanCheck';

/** A wall's outline with its thickness; any other item's outline. */
function outline(el: PlanElement): Point[] {
  if (el.type !== 'wall') return elementOutline(el);
  const len = Math.hypot(el.x2 - el.x1, el.y2 - el.y1) || 1;
  const h = thicknessOf(el) / 2;
  const n = { x: (-(el.y2 - el.y1) / len) * h, y: ((el.x2 - el.x1) / len) * h };
  return [
    { x: el.x1 + n.x, y: el.y1 + n.y },
    { x: el.x2 + n.x, y: el.y2 + n.y },
    { x: el.x2 - n.x, y: el.y2 - n.y },
    { x: el.x1 - n.x, y: el.y1 - n.y },
  ];
}

/**
 * Items the plan check finds against the bylaws, outlined on the plan: red where a rule isn't met,
 * dashed amber where it needs checking (a porch or open stair in a setback may be allowed).
 */
export function CheckMarks({ elements, k }: { elements: PlanElement[]; k: number }) {
  const check = usePlanCheck();
  if (!check) return null;
  const marks = check.rows.flatMap((r) => (r.ids ?? []).map((id) => ({ id, fail: r.status === 'fail' })));
  return (
    <g pointerEvents="none" data-testid="check-marks">
      {marks.map(({ id, fail }) => {
        const el = elements.find((e) => e.id === id);
        if (!el) return null;
        const pts = outline(el);
        return (
          <polygon
            key={`${id}-${fail}`}
            data-check-mark={fail ? 'fail' : 'check'}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={fail ? 'var(--danger)' : 'none'}
            fillOpacity={0.15}
            style={{ stroke: fail ? 'var(--danger)' : PLAN.draft }}
            strokeWidth={2 * k}
            strokeDasharray={fail ? undefined : `${5 * k} ${3 * k}`}
          />
        );
      })}
    </g>
  );
}
