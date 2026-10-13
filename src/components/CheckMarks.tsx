import { memo } from 'react';
import { PLAN } from '../theme/plan';
import type { PlanElement, Room } from '../types';
import { wallsOf } from '../walls';
import { visibleShapes } from '../lib/itemShape';
import { usePlanCheck, usePlanHints } from '../store/usePlanCheck';

/**
 * Items the plan check finds against the bylaws, outlined on the plan: red where a rule isn't met,
 * dashed amber where it needs checking (a porch or open stair in a setback may be allowed), and
 * dotted amber for rooms a plan hint is about.
 */
export const CheckMarks = memo(function CheckMarks({
  elements,
  rooms,
  k,
}: {
  elements: PlanElement[];
  rooms: Room[];
  k: number;
}) {
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
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  const walls = wallsOf(elements);
  const roomById = new Map(rooms.map((r) => [r.id, r] as const));
  return (
    <g pointerEvents="none" data-testid="check-marks">
      {shown.map(({ id, look }) => {
        const el = byId.get(id);
        const room = el ? undefined : roomById.get(id);
        // What the item shows (a curved wall round its curve, a stair's steps), not the box round it.
        const shapes = el ? visibleShapes(el, walls) : room ? [room.points] : [];
        const fail = look === 'fail';
        return shapes.map((pts, i) => (
          <polygon
            key={`${id}-${look}-${i}`}
            data-check-mark={look}
            points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
            fill={fail ? 'var(--danger)' : 'none'}
            fillOpacity={0.15}
            style={{ stroke: fail ? 'var(--danger)' : PLAN.draft }}
            strokeWidth={(look === 'hint' ? 1.5 : 2) * k}
            strokeDasharray={fail ? undefined : look === 'hint' ? `${1.5 * k} ${3 * k}` : `${5 * k} ${3 * k}`}
          />
        ));
      })}
    </g>
  );
});
