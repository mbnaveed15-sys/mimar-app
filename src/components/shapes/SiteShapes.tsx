import { fromFurnitureLocal } from '../../geometry';
import { outlinePoints, plotSides, sideOutward } from '../../lib/plot';
import { buildableArea, stairLayout } from '../../lib/site';
import { PLAN } from '../../theme/plan';
import type { Plot, Point, Stair } from '../../types';

const LAWN = '#86A95F';

const pts = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ');

/**
 * The plot line (chain-dotted, with any cut corner), the buildable area inside the setbacks
 * (dashed), ROAD beside each road side, and, when selected, each side's number (as in the Sides list).
 */
export function PlotShape({ plot, selected, k }: { plot: Plot; selected: boolean; k: number }) {
  const n = plot.points.length;
  const sides = plotSides(plot);
  const outline = outlinePoints(plot);
  // A mark just outside (or inside) the middle of side i, `off` screen pixels from it.
  const beside = (i: number, off: number) => {
    const a = plot.points[i];
    const b = plot.points[(i + 1) % n];
    const o = sideOutward(plot, i);
    return { x: (a.x + b.x) / 2 + o.x * off * k, y: (a.y + b.y) / 2 + o.y * off * k };
  };
  return (
    <g data-type="plot" data-id={plot.id}>
      {/* A soft grass tint, so the plot reads on top of the grid. */}
      <polygon
        points={pts(outline)}
        style={{ fill: LAWN, stroke: selected ? PLAN.selection : PLAN.ink }}
        fillOpacity={selected ? 0.3 : 0.2}
        strokeWidth={(selected ? 3 : 2) * k}
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
      {sides.map((side, i) => {
        if (side.kind !== 'road') return null;
        // Past the dimension line that runs along the outside of the boundary wall.
        const road = beside(i, 64);
        return (
          <text
            key={i}
            data-testid="road-mark"
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
        );
      })}
      {selected &&
        Array.from({ length: n }, (_, step) => {
          const i = (plot.front + step) % n;
          const at = beside(i, -22);
          return (
            <g key={i} pointerEvents="none" data-testid="side-number">
              <circle
                cx={at.x}
                cy={at.y}
                r={8 * k}
                style={{ fill: PLAN.paper, stroke: PLAN.selection }}
                strokeWidth={1 * k}
              />
              <text
                x={at.x}
                y={at.y}
                fontSize={10 * k}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fill: PLAN.selection }}
              >
                {step + 1}
              </text>
            </g>
          );
        })}
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
