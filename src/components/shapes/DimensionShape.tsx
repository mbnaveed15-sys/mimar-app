import { dimLine } from '../../lib/dimLine';
import { formatLength } from '../../lib/units';
import { MM_PER_UNIT } from '../../lib/scale';
import { PLAN } from '../../theme/plan';
import type { Dimension, Units } from '../../types';
import { DEFAULT_DIM_STYLE, DIM_TEXT_SCALE, endMark, type DimStyle } from '../../lib/dimStyle';
import { DimEnd } from './DimEnd';

interface Props {
  dim: Omit<Dimension, 'id'> & { id?: string };
  units: Units;
  selected: boolean;
  /** Plan units per screen (or output) pixel, so the line and text keep the same size at any zoom. */
  k: number;
  /** Being placed: drawn in the drafting colour and not picked. */
  ghost?: boolean;
  /** Text size and end marks (Medium text and ticks when missing). */
  look?: DimStyle;
}

/**
 * A placed dimension, as on a drawing: extension lines from the points measured to the dimension
 * line (with a small gap at the points), a tick (or an arrow or a dot) at each end, and the length above the line,
 * never upside down. A radius is a line from the centre to the curve, an arrow on the curve and
 * "R" before its length.
 */
export function DimensionShape({ dim, units, selected, k, ghost, look = DEFAULT_DIM_STYLE }: Props) {
  const { p1, p2, a, b, u, n, value } = dimLine(dim);
  const t = DIM_TEXT_SCALE[look.text];
  const colour = ghost ? PLAN.draft : selected ? PLAN.selection : PLAN.dim;
  const text = formatLength(value * MM_PER_UNIT, units);
  const common = {
    'data-type': ghost ? undefined : 'dim',
    'data-id': ghost ? undefined : dim.id,
    'data-testid': ghost ? 'dimension-draft' : 'placed-dimension',
    style: { stroke: colour },
    strokeWidth: (selected ? 1.6 : 1) * k,
    pointerEvents: ghost ? ('none' as const) : undefined,
  };
  const label = (x: number, y: number, deg: number, body: string) => (
    <text
      x={x}
      y={y}
      transform={`rotate(${deg} ${x} ${y})`}
      fontSize={11 * t * k}
      textAnchor="middle"
      dominantBaseline="middle"
      style={{ fill: colour, stroke: PLAN.paper }}
      strokeWidth={3 * k}
      paintOrder="stroke"
    >
      {body}
    </text>
  );
  // Text reads along the line, never upside down.
  const readable = (dx: number, dy: number) => {
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg > 90 || deg <= -90) deg += 180;
    return deg;
  };

  if (dim.radius) {
    const len = value || 1;
    const d = { x: (p2.x - p1.x) / len, y: (p2.y - p1.y) / len };
    const arrow = 7 * k;
    const w = { x: -d.y * arrow * 0.35, y: d.x * arrow * 0.35 };
    const base = { x: p2.x - d.x * arrow, y: p2.y - d.y * arrow };
    const deg = readable(d.x, d.y);
    // The text sits beside the line, halfway along it.
    const side = deg === (Math.atan2(d.y, d.x) * 180) / Math.PI ? 1 : -1;
    const mid = { x: (p1.x + p2.x) / 2 + d.y * 7 * t * k * side, y: (p1.y + p2.y) / 2 - d.x * 7 * t * k * side };
    return (
      <g {...common} data-radius>
        <line x1={p1.x} y1={p1.y} x2={base.x} y2={base.y} />
        <path
          d={`M ${p2.x} ${p2.y} L ${base.x + w.x} ${base.y + w.y} L ${base.x - w.x} ${base.y - w.y} Z`}
          style={{ fill: colour }}
          stroke="none"
        />
        <circle cx={p1.x} cy={p1.y} r={1.8 * k} style={{ fill: colour }} stroke="none" />
        {label(mid.x, mid.y, readable(d.x, d.y), `R ${text}`)}
      </g>
    );
  }

  const tick = 4 * k;
  const gap = 3 * k;
  const past = 4 * k;
  // Each extension line runs from just off its point to just past the dimension line.
  const ext = (p: typeof p1, q: typeof a) => {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < gap) return null;
    const e = { x: dx / len, y: dy / len };
    return { x1: p.x + e.x * gap, y1: p.y + e.y * gap, x2: q.x + e.x * past, y2: q.y + e.y * past };
  };
  const e1 = ext(p1, a);
  const e2 = ext(p2, b);
  const deg = readable(u.x, u.y);
  // The text above the line as it reads (on the side its "up" points to).
  const flip = deg === (Math.atan2(u.y, u.x) * 180) / Math.PI ? 1 : -1;
  const mid = { x: (a.x + b.x) / 2 + n.x * 7 * t * k * -flip, y: (a.y + b.y) / 2 + n.y * 7 * t * k * -flip };
  return (
    <g {...common}>
      {e1 && <line {...e1} />}
      {e2 && <line {...e2} />}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {[a, b].map((p, i) => (
        <DimEnd key={i} mark={endMark(look.ends, p, u, n, i ? -1 : 1, tick)} colour={colour} width={1.5 * k} />
      ))}
      {/* A wide invisible line along the dimension, so it is easy to click. */}
      {!ghost && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={10 * k} />}
      {label(mid.x, mid.y, deg, text)}
    </g>
  );
}
