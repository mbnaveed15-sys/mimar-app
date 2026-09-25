import { fromFurnitureLocal } from '../../geometry';
import { PLAN } from '../../theme/plan';
import type { Beam, Block, Column, Point, Slab } from '../../types';

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
