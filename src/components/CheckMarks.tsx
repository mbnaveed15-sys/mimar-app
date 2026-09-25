import { elementOutline } from '../geometry';
import { PLAN } from '../theme/plan';
import type { PlanElement, Point, Room } from '../types';
import { thicknessOf } from '../walls';
import { usePlanCheck, usePlanHints } from '../store/usePlanCheck';

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
 * dashed amber where it needs checking (a porch or open stair in a setback may be allowed), and
 * dotted amber for rooms a plan hint is about.
 */
export function CheckMarks({ elements, rooms, k }: { elements: PlanElement[]; rooms: Room[]; k: number }) {
  const check = usePlanCheck();
  const hints = usePlanHints();
  const marks = [
    ...(check?.rows ?? []).flatMap((r) =>
      (r.ids ?? []).map((id) => ({ id, look: r.status === 'fail' ? 'fail' : 'check' })),
    ),
    ...hints.flatMap((h) => h.ids.map((id) => ({ id, look: 'hint' }))),
  ];
  const seen = new Set<string>();
  const shown = marks.filter((m) => {
    const key = `${m.id}-${m.look}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!shown.length) return null;
  return (
    <g pointerEvents="none" data-testid="check-marks">
      {shown.map(({ id, look }) => {
        const el = elements.find((e) => e.id === id);
        const room = el ? undefined : rooms.find((r) => r.id === id);
        const pts = el ? outline(el) : room?.points;
        if (!pts) return null;
        const fail = look === 'fail';
        return (
          <polygon
            key={`${id}-${look}`}
            data-check-mark={look}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={fail ? 'var(--danger)' : 'none'}
            fillOpacity={0.15}
            style={{ stroke: fail ? 'var(--danger)' : PLAN.draft }}
            strokeWidth={(look === 'hint' ? 1.5 : 2) * k}
            strokeDasharray={fail ? undefined : look === 'hint' ? `${1.5 * k} ${3 * k}` : `${5 * k} ${3 * k}`}
          />
        );
      })}
    </g>
  );
}
