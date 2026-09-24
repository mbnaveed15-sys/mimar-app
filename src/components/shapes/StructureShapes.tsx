import { fromFurnitureLocal } from '../../geometry';
import { PLAN } from '../../theme/plan';
import type { Beam, Column, Slab } from '../../types';

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

/** A slab: its outline with a long-dash-dot line, like a drawing of work above. */
export function SlabShape({ slab, selected, k }: { slab: Slab; selected: boolean; k: number }) {
  return (
    <polygon
      data-type="slab"
      data-id={slab.id}
      points={slab.points.map((p) => `${p.x},${p.y}`).join(' ')}
      style={{ fill: PLAN.selection, stroke: selected ? PLAN.selection : PLAN.inkMuted }}
      fillOpacity={selected ? 0.08 : 0}
      strokeWidth={(selected ? 2.5 : 1) * k}
      strokeDasharray={`${14 * k} ${4 * k} ${2 * k} ${4 * k}`}
    />
  );
}
