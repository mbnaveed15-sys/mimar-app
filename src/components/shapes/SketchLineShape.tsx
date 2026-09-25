import { PLAN } from '../../theme/plan';
import type { SketchLine } from '../../types';

/** A small, repeatable wobble for each line, so it looks drawn by hand but stays still. */
function wobble(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((h % 1000) / 1000) * 2 - 1;
}

/**
 * A layout line in pencil: it runs a little past its ends like a drafter's line, bows very
 * slightly, and has a dot at each end to snap to.
 */
export function SketchLineShape({ line, selected, k }: { line: SketchLine; selected: boolean; k: number }) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const over = 7 * k;
  const a = { x: line.x1 - ux * over, y: line.y1 - uy * over };
  const b = { x: line.x2 + ux * over, y: line.y2 + uy * over };
  const bow = wobble(line.id) * Math.min(1.6 * k, len * 0.01);
  const mid = { x: (line.x1 + line.x2) / 2 - uy * bow, y: (line.y1 + line.y2) / 2 + ux * bow };
  const colour = selected ? PLAN.selection : PLAN.inkMuted;
  const path = `M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`;
  return (
    <g data-type="line" data-id={line.id} style={{ color: colour }}>
      {/* A second, fainter pass slightly off the first, like pencil gone over twice. */}
      <path
        d={`M ${a.x + uy * 0.6 * k} ${a.y - ux * 0.6 * k} Q ${mid.x} ${mid.y} ${b.x - uy * 0.4 * k} ${b.y + ux * 0.4 * k}`}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.35}
        strokeWidth={0.8 * k}
        strokeLinecap="round"
      />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={(selected ? 2 : 1.1) * k} strokeLinecap="round" />
      {[
        { x: line.x1, y: line.y1 },
        { x: line.x2, y: line.y2 },
      ].map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.2 * k} fill="currentColor" />
      ))}
    </g>
  );
}
