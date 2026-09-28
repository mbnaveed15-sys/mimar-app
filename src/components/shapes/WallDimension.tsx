import { wallLength } from '../../geometry';
import { directionAlong, isArc, offsetPath, pointAlong } from '../../lib/arc';
import { formatLength } from '../../lib/units';
import { MM_PER_UNIT } from '../../store/plannerStore';
import type { Units, Wall } from '../../types';
import { thicknessOf } from '../../walls';
import { PLAN } from '../../theme/plan';

interface Props {
  wall: Wall;
  units: Units;
  /** Plan units per screen pixel, so the line keeps the same on-screen size at any zoom. */
  k: number;
  /** Which side of the wall the dimension goes on: 1 = left of the drawing direction, -1 = right. */
  side: 1 | -1;
}

/** Architectural dimension line drawn beside a wall, with its real length. */
export function WallDimension({ wall, units, k, side }: Props) {
  const len = wallLength(wall);
  if (len * (1 / k) < 24) return null; // too short on screen to label
  if (isArc(wall)) return <ArcDimension wall={wall} units={units} k={k} side={side} />;
  const ux = (wall.x2 - wall.x1) / len;
  const uy = (wall.y2 - wall.y1) / len;
  const nx = uy * side;
  const ny = -ux * side;
  const face = thicknessOf(wall) / 2;
  const off = face + 16 * k;
  const a = { x: wall.x1 + nx * off, y: wall.y1 + ny * off };
  const b = { x: wall.x2 + nx * off, y: wall.y2 + ny * off };
  const tick = 4 * k;
  let angle = (Math.atan2(uy, ux) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  const mid = { x: (a.x + b.x) / 2 + nx * 6 * k, y: (a.y + b.y) / 2 + ny * 6 * k };

  return (
    <g data-type="dimension" style={{ stroke: PLAN.dim }} strokeWidth={k}>
      <line
        x1={wall.x1 + nx * (face + 4 * k)}
        y1={wall.y1 + ny * (face + 4 * k)}
        x2={a.x + nx * tick}
        y2={a.y + ny * tick}
      />
      <line
        x1={wall.x2 + nx * (face + 4 * k)}
        y1={wall.y2 + ny * (face + 4 * k)}
        x2={b.x + nx * tick}
        y2={b.y + ny * tick}
      />
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      {[a, b].map((p, i) => (
        <line
          key={i}
          x1={p.x - (ux + nx) * tick}
          y1={p.y - (uy + ny) * tick}
          x2={p.x + (ux + nx) * tick}
          y2={p.y + (uy + ny) * tick}
          strokeWidth={1.5 * k}
        />
      ))}
      <text
        x={mid.x}
        y={mid.y}
        transform={`rotate(${angle} ${mid.x} ${mid.y})`}
        fontSize={11 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: PLAN.dim, stroke: PLAN.paper }}
        strokeWidth={3 * k}
        paintOrder="stroke"
      >
        {formatLength(len * MM_PER_UNIT, units)}
      </text>
    </g>
  );
}

/** A curved wall's dimension: an arc beside it, with its length along the curve. */
function ArcDimension({ wall, units, k, side }: Props) {
  const face = thicknessOf(wall) / 2;
  const off = face + 16 * k;
  // The dimension's side (1 = right of the drawing direction) is the wall's side B.
  const line = offsetPath(wall, -side * off);
  const tick = 4 * k;
  const ends = [0, 1].map((t, i) => {
    const d = directionAlong(wall, t);
    const n = { x: d.y * side, y: -d.x * side };
    const p = pointAlong(wall, t);
    return { d, n, p, q: line[i === 0 ? 0 : line.length - 1] };
  });
  const md = directionAlong(wall, 0.5);
  const mn = { x: md.y * side, y: -md.x * side };
  const mp = pointAlong(wall, 0.5);
  const mid = { x: mp.x + mn.x * (off + 6 * k), y: mp.y + mn.y * (off + 6 * k) };
  let angle = (Math.atan2(md.y, md.x) * 180) / Math.PI;
  if (angle > 90 || angle <= -90) angle += 180;
  return (
    <g data-type="dimension" data-arc style={{ stroke: PLAN.dim }} strokeWidth={k}>
      {ends.map(({ n, p, q }, i) => (
        <line
          key={`e${i}`}
          x1={p.x + n.x * (face + 4 * k)}
          y1={p.y + n.y * (face + 4 * k)}
          x2={q.x + n.x * tick}
          y2={q.y + n.y * tick}
        />
      ))}
      <polyline points={line.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" />
      {ends.map(({ d, n, q }, i) => (
        <line
          key={`t${i}`}
          x1={q.x - (d.x + n.x) * tick}
          y1={q.y - (d.y + n.y) * tick}
          x2={q.x + (d.x + n.x) * tick}
          y2={q.y + (d.y + n.y) * tick}
          strokeWidth={1.5 * k}
        />
      ))}
      <text
        x={mid.x}
        y={mid.y}
        transform={`rotate(${angle} ${mid.x} ${mid.y})`}
        fontSize={11 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: PLAN.dim, stroke: PLAN.paper }}
        strokeWidth={3 * k}
        paintOrder="stroke"
      >
        {formatLength(wallLength(wall) * MM_PER_UNIT, units)}
      </text>
    </g>
  );
}
