import { SNAP_LABELS, type Inference } from '../lib/inference';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT } from '../store/plannerStore';
import { PLAN } from '../theme/plan';
import { protractor } from '../lib/protractor';
import { draftOutline } from '../lib/shapes';
import type { Draft, Point, Units } from '../types';
import { OpeningShape } from './shapes/OpeningShape';

/** An outline with its first point repeated at the end, when it should be drawn closed. */
const closedShape = (points: Point[], closed: boolean) => (closed && points.length ? [...points, points[0]] : points);

interface Props {
  draft: Draft;
  inference: Inference | null;
  axisLock: 'x' | 'y' | 'z' | null;
  /** The face Push/Pull would take hold of, lit up. */
  hoverEdge?: [Point, Point] | null;
  units: Units;
  /** Plan units per screen pixel. */
  k: number;
}

const SNAP_COLORS: Partial<Record<Inference['kind'], string>> = {
  endpoint: 'var(--snap-end)',
  midpoint: 'var(--snap-mid)',
  'on-wall': 'var(--snap-edge)',
  'on-line': 'var(--snap-edge)',
  'building-line': 'var(--snap-edge)',
  'on-face': 'var(--snap-edge)',
  corner: 'var(--snap-end)',
  perpendicular: 'var(--snap-mid)',
  intersection: 'var(--snap-end)',
  'axis-x': 'var(--axis-x)',
  'axis-y': 'var(--axis-y)',
  locked: 'var(--selection)',
  'wall-centre': 'var(--snap-mid)',
  'half-centre': 'var(--snap-mid)',
  'corner-gap': 'var(--snap-end)',
  'from-corner': 'var(--snap-edge)',
  aligned: 'var(--selection)',
};

/** Colour of a rubber band: red or green when it runs along an axis, like SketchUp. */
function bandColor(inference: Inference | null, axisLock: 'x' | 'y' | 'z' | null) {
  if (axisLock === 'x' || inference?.kind === 'axis-x') return 'var(--axis-x)';
  if (axisLock === 'y' || inference?.kind === 'axis-y') return 'var(--axis-y)';
  return PLAN.draft;
}

/** Text with a halo, so it reads over anything. */
function Label({ p, k, children, color = PLAN.ink }: { p: Point; k: number; children: string; color?: string }) {
  return (
    <text
      x={p.x}
      y={p.y}
      fontSize={12 * k}
      fontWeight={600}
      style={{ fill: color, stroke: PLAN.paper }}
      strokeWidth={3 * k}
      paintOrder="stroke"
    >
      {children}
    </text>
  );
}

/** Rubber bands, previews and the snap marker for the drawing tools. */
export function DrawingOverlay({ draft: d, inference, axisLock, units, k, hoverEdge }: Props) {
  const dash = `${6 * k} ${4 * k}`;
  const len = (a: Point, b: Point) => formatLength(Math.hypot(b.x - a.x, b.y - a.y) * MM_PER_UNIT, units);
  const band = bandColor(inference, axisLock);

  return (
    <g pointerEvents="none" data-testid="drawing-overlay">
      {d?.type === 'wall' && (
        <>
          <line
            data-testid="wall-draft"
            x1={d.x1}
            y1={d.y1}
            x2={d.x2}
            y2={d.y2}
            style={{ stroke: band }}
            strokeWidth={2 * k}
            strokeDasharray={dash}
          />
          <Label p={{ x: d.x2 + 10 * k, y: d.y2 - 10 * k }} k={k} color={PLAN.draft}>
            {len({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 })}
          </Label>
        </>
      )}

      {d?.type === 'offset' && (
        <line
          data-testid="offset-preview"
          x1={d.x1}
          y1={d.y1}
          x2={d.x2}
          y2={d.y2}
          style={{ stroke: PLAN.draft }}
          strokeWidth={3 * k}
          strokeDasharray={dash}
        />
      )}

      {d?.type === 'mirror' && (
        <g style={{ stroke: PLAN.selection }} strokeWidth={1.5 * k}>
          <line
            x1={d.a.x - (d.b.x - d.a.x) * 20}
            y1={d.a.y - (d.b.y - d.a.y) * 20}
            x2={d.a.x + (d.b.x - d.a.x) * 20}
            y2={d.a.y + (d.b.y - d.a.y) * 20}
            strokeDasharray={`${8 * k} ${3 * k} ${2 * k} ${3 * k}`}
          />
          <circle cx={d.a.x} cy={d.a.y} r={3 * k} style={{ fill: PLAN.selection }} />
        </g>
      )}

      {d?.type === 'pick' && (
        <circle
          data-testid="picked-wall"
          cx={d.point.x}
          cy={d.point.y}
          r={6 * k}
          fill="none"
          style={{ stroke: PLAN.selection }}
          strokeWidth={2 * k}
        />
      )}

      {d?.type === 'stretch' && (
        <>
          <rect
            data-testid="stretch-box"
            x={Math.min(d.x1, d.x2)}
            y={Math.min(d.y1, d.y2)}
            width={Math.abs(d.x2 - d.x1)}
            height={Math.abs(d.y2 - d.y1)}
            style={{ fill: PLAN.selection, stroke: PLAN.selection }}
            fillOpacity={0.06}
            strokeWidth={1.25 * k}
            strokeDasharray={`${5 * k} ${4 * k}`}
          />
          {d.base && d.to && (
            <line
              x1={d.base.x}
              y1={d.base.y}
              x2={d.to.x}
              y2={d.to.y}
              style={{ stroke: band }}
              strokeWidth={1.5 * k}
              strokeDasharray={dash}
            />
          )}
        </>
      )}

      {d?.type === 'scale' && (
        <g style={{ stroke: PLAN.selection }} fill="none" strokeWidth={1.5 * k}>
          <circle cx={d.base.x} cy={d.base.y} r={4 * k} style={{ fill: PLAN.selection }} />
          {d.ref && <line x1={d.base.x} y1={d.base.y} x2={d.ref.x} y2={d.ref.y} strokeDasharray={dash} />}
          {d.ref && (
            <Label p={{ x: d.base.x + 10 * k, y: d.base.y - 10 * k }} k={k} color={PLAN.selection}>
              {`${d.factor.toFixed(2)}×`}
            </Label>
          )}
        </g>
      )}

      {d?.type === 'marquee' && (
        <rect
          data-testid="selection-box"
          x={Math.min(d.x1, d.x2)}
          y={Math.min(d.y1, d.y2)}
          width={Math.abs(d.x2 - d.x1)}
          height={Math.abs(d.y2 - d.y1)}
          // Left to right (window): solid; right to left (crossing): dashed, like SketchUp.
          style={{ fill: PLAN.selection, stroke: PLAN.selection }}
          fillOpacity={0.08}
          strokeWidth={1.25 * k}
          strokeDasharray={d.x2 < d.x1 ? `${5 * k} ${4 * k}` : undefined}
        />
      )}

      {d?.type === 'line' && (
        <line
          data-testid="line-draft"
          x1={d.x1}
          y1={d.y1}
          x2={d.x2}
          y2={d.y2}
          style={{ stroke: PLAN.draft }}
          strokeWidth={1.5 * k}
          strokeLinecap="round"
        />
      )}

      {d?.type === 'beam' && (
        <line
          data-testid="beam-draft"
          x1={d.x1}
          y1={d.y1}
          x2={d.x2}
          y2={d.y2}
          style={{ stroke: PLAN.draft }}
          strokeWidth={2 * k}
          strokeDasharray={`${8 * k} ${4 * k}`}
        />
      )}

      {(d?.type === 'rectangle' || d?.type === 'slab' || d?.type === 'plot') && (
        <>
          <rect
            data-testid={`${d.type}-draft`}
            x={Math.min(d.x1, d.x2)}
            y={Math.min(d.y1, d.y2)}
            width={Math.abs(d.x2 - d.x1)}
            height={Math.abs(d.y2 - d.y1)}
            fill="none"
            style={{ stroke: PLAN.draft }}
            strokeWidth={2 * k}
            strokeDasharray={dash}
          />
          <Label p={{ x: (d.x1 + d.x2) / 2, y: Math.min(d.y1, d.y2) - 8 * k }} k={k} color={PLAN.draft}>
            {len({ x: d.x1, y: 0 }, { x: d.x2, y: 0 })}
          </Label>
          <Label p={{ x: Math.max(d.x1, d.x2) + 8 * k, y: (d.y1 + d.y2) / 2 }} k={k} color={PLAN.draft}>
            {len({ x: 0, y: d.y1 }, { x: 0, y: d.y2 })}
          </Label>
        </>
      )}

      {d?.type === 'plotPoly' && (
        <>
          <polyline
            data-testid="plot-draft"
            points={[...d.points, d.cursor].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            style={{ stroke: PLAN.draft }}
            strokeWidth={2 * k}
            strokeDasharray={dash}
          />
          {d.points.length >= 2 && (
            // Where the plot would close.
            <line
              x1={d.cursor.x}
              y1={d.cursor.y}
              x2={d.points[0].x}
              y2={d.points[0].y}
              style={{ stroke: PLAN.draft }}
              strokeWidth={1 * k}
              strokeDasharray={`${2 * k} ${4 * k}`}
              opacity={0.6}
            />
          )}
          {d.points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={(i === 0 && d.points.length >= 3 ? 6 : 3) * k}
              style={{ fill: i === 0 ? PLAN.paper : PLAN.draft, stroke: PLAN.draft }}
              strokeWidth={1.5 * k}
            />
          ))}
          {[...d.points, d.cursor].slice(1).map((b, i) => {
            const a = d.points[i];
            return (
              <Label key={i} p={{ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 8 * k }} k={k} color={PLAN.draft}>
                {len(a, b)}
              </Label>
            );
          })}
          {d.points.length >= 2 && (
            <Label
              p={{ x: (d.points[0].x + d.points[1].x) / 2, y: (d.points[0].y + d.points[1].y) / 2 + 12 * k }}
              k={k}
              color={PLAN.draft}
            >
              ROAD
            </Label>
          )}
        </>
      )}

      {hoverEdge && (
        <line
          data-testid="face-highlight"
          x1={hoverEdge[0].x}
          y1={hoverEdge[0].y}
          x2={hoverEdge[1].x}
          y2={hoverEdge[1].y}
          stroke="#f59e0b"
          strokeWidth={5 * k}
          strokeLinecap="round"
          opacity={0.85}
        />
      )}

      {d?.type === 'shape' && d.surface.on === 'floor' && (
        <polyline
          data-testid="shape-draft"
          points={closedShape(draftOutline(d.kind, d.points, d.cursor), d.kind !== 'polygon')
            .map((p) => `${p.x},${p.y}`)
            .join(' ')}
          fill="none"
          style={{ stroke: PLAN.draft }}
          strokeWidth={2 * k}
          strokeDasharray={dash}
        />
      )}

      {d?.type === 'tape' && (
        <>
          <line
            data-testid="tape-line"
            x1={d.a.x}
            y1={d.a.y}
            x2={d.b.x}
            y2={d.b.y}
            style={{ stroke: band }}
            strokeWidth={1.5 * k}
            strokeDasharray={`${2 * k} ${3 * k}`}
          />
          {[d.a, d.b].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3 * k} style={{ fill: PLAN.draft }} />
          ))}
          <Label p={{ x: (d.a.x + d.b.x) / 2 + 8 * k, y: (d.a.y + d.b.y) / 2 - 8 * k }} k={k}>
            {len(d.a, d.b)}
          </Label>
        </>
      )}

      {d?.type === 'move' && (
        <line
          x1={d.base.x}
          y1={d.base.y}
          x2={d.to.x}
          y2={d.to.y}
          style={{ stroke: band }}
          strokeWidth={1.5 * k}
          strokeDasharray={dash}
        />
      )}

      {d?.type === 'rotate' && (
        <g style={{ stroke: PLAN.selection }} fill="none" strokeWidth={1.5 * k} data-testid="protractor">
          {(() => {
            const { ring, ticks, arc } = protractor(d.center, 40 * k, d.start, d.angle);
            const pts = (ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(' ');
            return (
              <>
                <polygon points={pts(ring)} strokeWidth={k} />
                {ticks.map(([a, b], i) => (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={k} />
                ))}
                {arc.length > 1 && <polyline points={pts([d.center, ...arc, d.center])} strokeWidth={1.5 * k} />}
              </>
            );
          })()}
          <circle cx={d.center.x} cy={d.center.y} r={3 * k} style={{ fill: PLAN.selection }} />
          {d.start && <line x1={d.center.x} y1={d.center.y} x2={d.start.x} y2={d.start.y} />}
          {d.start && (
            <Label p={{ x: d.center.x + 36 * k, y: d.center.y - 36 * k }} k={k} color={PLAN.selection}>
              {`${Math.round(d.angle)}°`}
            </Label>
          )}
        </g>
      )}

      {d?.type === 'opening' && d.ghost && (
        <g data-testid="opening-ghost" opacity={0.8}>
          <OpeningShape opening={d.ghost} selected wallThickness={d.thickness ?? 0} ghost />
          {(d.dims ?? []).map(([a, b], i) => {
            // The clear distance from the corner to the edge, beside the wall on the pointer's side.
            const side = d.side ?? { x: 0, y: 1 };
            const off = (d.thickness ?? 0) / 2 + 12 * k;
            const p = { x: a.x + side.x * off, y: a.y + side.y * off };
            const q = { x: b.x + side.x * off, y: b.y + side.y * off };
            const tick = (c: Point) => (
              <line
                x1={c.x - side.x * 4 * k}
                y1={c.y - side.y * 4 * k}
                x2={c.x + side.x * 4 * k}
                y2={c.y + side.y * 4 * k}
              />
            );
            return (
              <g key={i} data-testid="opening-dim" style={{ stroke: PLAN.selection }} strokeWidth={k}>
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                {tick(p)}
                {tick(q)}
                <Label
                  p={{ x: (p.x + q.x) / 2 + side.x * 12 * k - 12 * k, y: (p.y + q.y) / 2 + side.y * 12 * k + 4 * k }}
                  k={k}
                  color={PLAN.selection}
                >
                  {len(a, b)}
                </Label>
              </g>
            );
          })}
        </g>
      )}

      {d?.type === 'opening' && d.error && (
        <g data-testid="opening-error">
          <Label p={{ x: d.cursor.x + 14 * k, y: d.cursor.y - 14 * k }} k={k} color={PLAN.draft}>
            {d.error}
          </Label>
        </g>
      )}

      {inference?.guides?.map(([a, b], i) => (
        // What the point lines up with: a dotted guide from it.
        <line
          key={i}
          data-testid="snap-guide"
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          style={{ stroke: SNAP_COLORS[inference.kind] }}
          strokeWidth={k}
          strokeDasharray={`${2 * k} ${3 * k}`}
        />
      ))}

      {inference && SNAP_COLORS[inference.kind] && (
        <g data-testid="snap-marker" data-snap={inference.kind}>
          <circle
            cx={inference.point.x}
            cy={inference.point.y}
            r={5 * k}
            style={{ fill: SNAP_COLORS[inference.kind], stroke: PLAN.paper }}
            strokeWidth={1.5 * k}
          />
          <Label
            p={{ x: inference.point.x + 10 * k, y: inference.point.y + 20 * k }}
            k={k}
            color={SNAP_COLORS[inference.kind]}
          >
            {SNAP_LABELS[inference.kind]}
          </Label>
        </g>
      )}
    </g>
  );
}
