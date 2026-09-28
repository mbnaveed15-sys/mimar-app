import { centroid, fromFurnitureLocal } from '../../geometry';
import { roofShape, slopedFaces } from '../../lib/roof/roof';
import { PLAN } from '../../theme/plan';
import type { Beam, Block, Column, Point, Roof, Slab } from '../../types';

/** A column: solid, as it is cut by the plan. */
export function ColumnShape({
  col,
  selected,
  color,
  k,
}: {
  col: Column;
  selected: boolean;
  color?: string;
  k: number;
}) {
  const style = { fill: color ?? PLAN.wallEdge, stroke: selected ? PLAN.selection : PLAN.wallEdge };
  return (
    <g data-type="column" data-id={col.id}>
      {col.shape === 'round' ? (
        <circle cx={col.x} cy={col.y} r={col.w / 2} style={style} strokeWidth={(selected ? 3 : 1) * k} />
      ) : (
        <polygon
          points={[
            { x: -col.w / 2, y: -col.h / 2 },
            { x: col.w / 2, y: -col.h / 2 },
            { x: col.w / 2, y: col.h / 2 },
            { x: -col.w / 2, y: col.h / 2 },
          ]
            .map((c) => fromFurnitureLocal(col, c))
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          style={style}
          strokeWidth={(selected ? 3 : 1) * k}
        />
      )}
    </g>
  );
}

/** A beam: dashed outline, as it is above the plan's cut line. */
export function BeamShape({ beam, selected, k }: { beam: Beam; selected: boolean; k: number }) {
  const dx = beam.x2 - beam.x1;
  const dy = beam.y2 - beam.y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (beam.width / 2);
  const ny = (dx / len) * (beam.width / 2);
  const pts = [
    { x: beam.x1 + nx, y: beam.y1 + ny },
    { x: beam.x2 + nx, y: beam.y2 + ny },
    { x: beam.x2 - nx, y: beam.y2 - ny },
    { x: beam.x1 - nx, y: beam.y1 - ny },
  ];
  return (
    <polygon
      data-type="beam"
      data-id={beam.id}
      points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
      fill="none"
      style={{ stroke: selected ? PLAN.selection : PLAN.dim }}
      strokeWidth={(selected ? 2.5 : 1.25) * k}
      strokeDasharray={`${8 * k} ${4 * k}`}
    />
  );
}

const pts = (points: Point[]) => points.map((p) => `${p.x},${p.y}`).join(' ');
const ring = (points: Point[]) => `M ${pts(points).replace(/ /g, ' L ')} Z`;

/** A slab: its outline with a long-dash-dot line, like a drawing of work above; voids crossed through. */
export function SlabShape({ slab, selected, k }: { slab: Slab; selected: boolean; k: number }) {
  const stroke = { stroke: selected ? PLAN.selection : PLAN.inkMuted };
  const holes = slab.holes ?? [];
  return (
    <g data-type="slab" data-id={slab.id}>
      <path
        d={[slab.points, ...holes].map(ring).join(' ')}
        fillRule="evenodd"
        style={{ fill: PLAN.selection, ...stroke }}
        fillOpacity={selected ? 0.08 : 0}
        strokeWidth={(selected ? 2.5 : 1) * k}
        strokeDasharray={`${14 * k} ${4 * k} ${2 * k} ${4 * k}`}
      />
      {holes.map((h, i) => {
        // A void is drawn with a cross from corner to corner, as on a drawing.
        const xs = h.map((p) => p.x);
        const ys = h.map((p) => p.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        return (
          <g key={i} data-testid="slab-void" style={stroke} strokeWidth={0.75 * k}>
            <line x1={x0} y1={y0} x2={x1} y2={y1} />
            <line x1={x0} y1={y1} x2={x1} y2={y0} />
          </g>
        );
      })}
    </g>
  );
}

/** A block drawn solid-edged with a light fill; a flat shape (not pulled up yet) dashed in blue. */
export function BlockShape({
  block,
  selected,
  color,
  k,
}: {
  block: Block;
  selected: boolean;
  color?: string;
  k: number;
}) {
  const flat = block.heightMm <= 0;
  return (
    <polygon
      data-type="block"
      data-id={block.id}
      data-flat={flat || undefined}
      points={pts(block.points)}
      style={{
        fill: flat ? PLAN.draft : (color ?? PLAN.furniture),
        stroke: selected ? PLAN.selection : flat ? PLAN.draft : PLAN.furnitureEdge,
      }}
      fillOpacity={flat ? 0.12 : 0.85}
      strokeWidth={(selected ? 2.5 : 1.25) * k}
      strokeDasharray={flat ? `${6 * k} ${3 * k}` : undefined}
    />
  );
}

/**
 * A roof seen from under the plan's cut: its eaves dashed, as work above; its ridges, hips and valleys; and an
 * arrow down each slope. When picked, its sides are numbered (for the gable ends and low side).
 */
export function RoofShape({ roof, selected, k }: { roof: Roof; selected: boolean; k: number }) {
  const stroke = { stroke: selected ? PLAN.selection : PLAN.inkMuted };
  const shape = roofShape(roof);
  const pitched = roof.shape !== 'flat';
  const n = roof.points.length;
  const inside = centroid(roof.points);
  return (
    <g data-type="roof" data-id={roof.id} data-shape={roof.shape}>
      <path
        d={ring(roof.points)}
        style={{ fill: PLAN.selection, ...stroke }}
        fillOpacity={selected ? 0.08 : 0}
        strokeWidth={(selected ? 2.5 : 1.25) * k}
        strokeDasharray={`${10 * k} ${5 * k}`}
      />
      {pitched &&
        shape.lines
          .filter((l) => l.kind === 'ridge' || l.kind === 'hip' || l.kind === 'valley')
          .map((l, i) => (
            <line
              key={i}
              data-kind={l.kind}
              x1={l.a.x}
              y1={l.a.y}
              x2={l.b.x}
              y2={l.b.y}
              style={stroke}
              strokeWidth={(l.kind === 'ridge' ? 1.5 : 1) * k}
              strokeDasharray={l.kind === 'valley' ? `${6 * k} ${3 * k}` : undefined}
            />
          ))}
      {pitched &&
        slopedFaces(roof).map((f, i) => {
          const [a, b] = f.points;
          const c = centroid(f.points);
          const ex = b.x - a.x;
          const ey = b.y - a.y;
          const len = Math.hypot(ex, ey);
          if (len < 1e-9) return null;
          let nx = ey / len;
          let ny = -ex / len;
          const reach = (a.x - c.x) * nx + (a.y - c.y) * ny;
          if (reach < 0) [nx, ny] = [-nx, -ny];
          const arrow = Math.min(Math.abs(reach) * 0.7, 91.44);
          if (arrow < 6 * k) return null;
          const tip = { x: c.x + nx * arrow, y: c.y + ny * arrow };
          const head = 6 * k;
          return (
            <g key={i} data-testid="roof-arrow" style={stroke} strokeWidth={1 * k}>
              <line x1={c.x} y1={c.y} x2={tip.x} y2={tip.y} />
              <path
                d={`M ${tip.x} ${tip.y} L ${tip.x - nx * head * 1.6 + ny * head} ${tip.y - ny * head * 1.6 - nx * head} L ${tip.x - nx * head * 1.6 - ny * head} ${tip.y - ny * head * 1.6 + nx * head} Z`}
                style={{ fill: stroke.stroke }}
              />
            </g>
          );
        })}
      {selected &&
        roof.points.map((a, i) => {
          const b = roof.points[(i + 1) % n];
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const d = Math.hypot(mid.x - inside.x, mid.y - inside.y) || 1;
          const at = { x: mid.x + ((mid.x - inside.x) / d) * 14 * k, y: mid.y + ((mid.y - inside.y) / d) * 14 * k };
          return (
            <text
              key={i}
              data-testid="roof-side"
              x={at.x}
              y={at.y}
              fontSize={11 * k}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fill: PLAN.selection }}
            >
              {i + 1}
            </text>
          );
        })}
    </g>
  );
}
