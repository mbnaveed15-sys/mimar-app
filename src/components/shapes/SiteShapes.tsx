import { fromFurnitureLocal } from '../../geometry';
import { buildableArea, stairLayout } from '../../lib/site';
import { PLAN } from '../../theme/plan';
import type { Plot, Point, Stair } from '../../types';

const pts = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ');

/** The plot line (chain-dotted), the buildable area inside the setbacks (dashed), and the road side. */
export function PlotShape({ plot, selected, k }: { plot: Plot; selected: boolean; k: number }) {
  const n = plot.points.length;
  const a = plot.points[plot.front % n];
  const b = plot.points[(plot.front + 1) % n];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // Label the road just outside the front edge.
  const e = { x: b.x - a.x, y: b.y - a.y };
  const l = Math.hypot(e.x, e.y) || 1;
  const cx = plot.points.reduce((s, p) => s + p.x, 0) / n;
  const cy = plot.points.reduce((s, p) => s + p.y, 0) / n;
  let nx = e.y / l;
  let ny = -e.x / l;
  if (nx * (mid.x - cx) + ny * (mid.y - cy) < 0) [nx, ny] = [-nx, -ny];
  // Past the dimension line that runs along the outside of the boundary wall.
  const road = { x: mid.x + nx * 64 * k, y: mid.y + ny * 64 * k };
  return (
    <g data-type="plot" data-id={plot.id}>
      <polygon
        points={pts(plot.points)}
        style={{ fill: PLAN.selection, stroke: selected ? PLAN.selection : PLAN.ink }}
        fillOpacity={selected ? 0.06 : 0}
        strokeWidth={(selected ? 3 : 1.5) * k}
        strokeDasharray={`${18 * k} ${4 * k} ${3 * k} ${4 * k}`}
      />
      <polygon
        data-testid="buildable-area"
        points={pts(buildableArea(plot))}
        fill="none"
        style={{ stroke: PLAN.dim }}
        strokeWidth={1 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
        pointerEvents="none"
      />
      <text
        x={road.x}
        y={road.y}
        fontSize={12 * k}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: PLAN.inkMuted, letterSpacing: `${2 * k}px` }}
        pointerEvents="none"
      >
        ROAD
      </text>
    </g>
  );
}

/** A stair in plan: treads, landings, the walking line and an UP arrow; a ramp shows its slope. */
export function StairShape({ stair, selected, k }: { stair: Stair; selected: boolean; k: number }) {
  const layout = stairLayout(stair);
  const world = (p: Point) => fromFurnitureLocal(stair, p);
  const stroke = { stroke: selected ? PLAN.selection : PLAN.wallEdge };
  const path = layout.path.map(world);
  const end = path[path.length - 1];
  const prev = path[path.length - 2];
  const dir = { x: end.x - prev.x, y: end.y - prev.y };
  const dl = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / dl;
  const uy = dir.y / dl;
  const head = 10 * k;
  const arrow = [
    { x: end.x - ux * head - uy * head * 0.5, y: end.y - uy * head + ux * head * 0.5 },
    end,
    { x: end.x - ux * head + uy * head * 0.5, y: end.y - uy * head - ux * head * 0.5 },
  ];
  const start = path[0];
  return (
    <g data-type="stair" data-id={stair.id}>
      {layout.parts.map((part, i) => (
        <polygon
          key={i}
          points={pts(
            [
              { x: part.x, y: part.y },
              { x: part.x + part.w, y: part.y },
              { x: part.x + part.w, y: part.y + part.h },
              { x: part.x, y: part.y + part.h },
            ].map(world),
          )}
          style={{ fill: PLAN.paper, ...stroke }}
          strokeWidth={(selected ? 2 : 1) * k}
        />
      ))}
      <polyline points={pts(path)} fill="none" style={stroke} strokeWidth={1 * k} pointerEvents="none" />
      <polyline points={pts(arrow)} fill="none" style={stroke} strokeWidth={1 * k} pointerEvents="none" />
      <circle cx={start.x} cy={start.y} r={3 * k} style={{ fill: PLAN.wallEdge }} pointerEvents="none" />
      <text
        x={start.x}
        y={start.y - 8 * k}
        fontSize={10 * k}
        textAnchor="middle"
        style={{ fill: PLAN.inkMuted }}
        pointerEvents="none"
      >
        {stair.shape === 'ramp' ? 'RAMP 1:12' : 'UP'}
      </text>
    </g>
  );
}
