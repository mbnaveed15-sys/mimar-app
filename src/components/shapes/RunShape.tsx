import { RUN_SYSTEMS, runPath, runSizeLabel } from '../../lib/services';
import { PLAN } from '../../theme/plan';
import type { Point, ServiceRun } from '../../types';

/**
 * A wire or pipe run on the plan, in its system's colour and line: wires as gentle arcs, pipes straight
 * with their size on the longest leg. Drains carry an arrow the way they fall (towards the run's end).
 */
export function RunShape({ run, selected, k }: { run: ServiceRun; selected: boolean; k: number }) {
  const sys = RUN_SYSTEMS[run.system];
  const colour = selected ? PLAN.selection : sys.color;
  const d = runPath(run);
  const pts = run.points;
  const leg = longestLeg(pts);
  const label = runSizeLabel(run);
  const falls = run.system === 'drain' || run.system === 'rain';
  return (
    <g data-type="run" data-id={run.id} data-system={run.system} style={{ color: colour }}>
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={(sys.wire ? 1.2 : 2) * (selected ? 1.6 : 1) * k}
        strokeDasharray={sys.dash.map((v) => v * k).join(' ') || undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {pts.map((p, i) =>
        i === 0 || i === pts.length - 1 ? <circle key={i} cx={p.x} cy={p.y} r={1.8 * k} fill="currentColor" /> : null,
      )}
      {leg && falls && <FallArrow a={leg.a} b={leg.b} k={k} />}
      {leg && label && (
        <text
          x={(leg.a.x + leg.b.x) / 2}
          y={(leg.a.y + leg.b.y) / 2}
          dy={-5 * k}
          fontSize={8 * k}
          textAnchor="middle"
          transform={`rotate(${upright(leg.a, leg.b)} ${(leg.a.x + leg.b.x) / 2} ${(leg.a.y + leg.b.y) / 2})`}
          style={{ fill: colour, stroke: PLAN.paper }}
          strokeWidth={2.5 * k}
          paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function longestLeg(pts: Point[]): { a: Point; b: Point } | null {
  let best: { a: Point; b: Point; l: number } | null = null;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (!best || l > best.l) best = { a: pts[i - 1], b: pts[i], l };
  }
  return best && best.l > 0 ? best : null;
}

/** The angle that keeps text along a leg the right way up. */
function upright(a: Point, b: Point): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

/** A small arrowhead at a leg's middle, pointing the way the drain falls. */
function FallArrow({ a, b, k }: { a: Point; b: Point; k: number }) {
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const u = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  const m = { x: (a.x + b.x) / 2 + u.x * 6 * k, y: (a.y + b.y) / 2 + u.y * 6 * k };
  const s = 4 * k;
  const p1 = { x: m.x - u.x * s * 1.6 - u.y * s, y: m.y - u.y * s * 1.6 + u.x * s };
  const p2 = { x: m.x - u.x * s * 1.6 + u.y * s, y: m.y - u.y * s * 1.6 - u.x * s };
  return <polygon points={`${m.x},${m.y} ${p1.x},${p1.y} ${p2.x},${p2.y}`} fill="currentColor" />;
}
