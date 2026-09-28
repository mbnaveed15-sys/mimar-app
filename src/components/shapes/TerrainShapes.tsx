import { formatLevel } from '../../lib/drawings/levels';
import type { ContourLine, CutFill } from '../../lib/terrain/groundView';
import { PLAN } from '../../theme/plan';
import type { Contour, ContextItem, Pad, Point, SpotLevel, Units } from '../../types';

/** Contours in brown, as on a survey sheet. */
const EARTH = '#8A6A3B';
const CUT = '#D64541';
const FILL = '#3C7DD9';
const CONTEXT = '#9A9A9A';

const pts = (list: Point[]) => list.map((p) => `${p.x},${p.y}`).join(' ');
const pathOf = (tris: Point[][]) =>
  tris.map((t) => `M${t[0].x} ${t[0].y}L${t[1].x} ${t[1].y}L${t[2].x} ${t[2].y}Z`).join('');

/** A label on the page that stays readable over lines: haloed in the paper colour. */
function Tag({
  at,
  k,
  color,
  children,
  testId,
}: {
  at: Point;
  k: number;
  color: string;
  children: string;
  testId?: string;
}) {
  return (
    <text
      data-testid={testId}
      x={at.x}
      y={at.y}
      fontSize={9 * k}
      textAnchor="middle"
      dominantBaseline="middle"
      style={{ fill: color, stroke: PLAN.paper }}
      strokeWidth={3 * k}
      paintOrder="stroke"
      pointerEvents="none"
    >
      {children}
    </text>
  );
}

/** A spot level: a small cross with its height beside it, as on a survey sheet. */
export function SpotLevelShape({
  level,
  selected,
  units,
  k,
}: {
  level: SpotLevel;
  selected: boolean;
  units: Units;
  k: number;
}) {
  const r = 4 * k;
  const color = selected ? PLAN.selection : level.approx ? PLAN.inkMuted : EARTH;
  return (
    <g data-type="level" data-id={level.id}>
      <path
        d={`M${level.x - r} ${level.y - r}L${level.x + r} ${level.y + r}M${level.x - r} ${level.y + r}L${level.x + r} ${level.y - r}`}
        style={{ stroke: color }}
        strokeWidth={(selected ? 2 : 1.2) * k}
      />
      <Tag at={{ x: level.x + 6 * k, y: level.y - 8 * k }} k={k} color={color} testId="spot-level-text">
        {`${level.approx ? '≈' : ''}${formatLevel(level.zMm, units)}`}
      </Tag>
    </g>
  );
}

/** A contour line drawn by hand or imported: dashed brown, its height at its middle. */
export function ContourShape({
  contour,
  selected,
  units,
  k,
}: {
  contour: Contour;
  selected: boolean;
  units: Units;
  k: number;
}) {
  const mid = contour.points[Math.floor(contour.points.length / 2)] ?? contour.points[0];
  const color = selected ? PLAN.selection : EARTH;
  return (
    <g data-type="contour" data-id={contour.id}>
      <polyline
        points={pts(contour.points)}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={(selected ? 2.5 : 1.5) * k}
        strokeDasharray={`${10 * k} ${4 * k}`}
      />
      {mid && (
        <Tag at={mid} k={k} color={color}>
          {formatLevel(contour.zMm, units)}
        </Tag>
      )}
    </g>
  );
}

/** A levelled area: chain-dashed outline with its finished height. */
export function PadShape({ pad, selected, units, k }: { pad: Pad; selected: boolean; units: Units; k: number }) {
  const n = pad.points.length || 1;
  const c = pad.points.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
  const color = selected ? PLAN.selection : PLAN.inkMuted;
  return (
    <g data-type="pad" data-id={pad.id}>
      <polygon
        points={pts(pad.points)}
        fill="transparent"
        style={{ stroke: color }}
        strokeWidth={(selected ? 2.5 : 1.2) * k}
        strokeDasharray={`${12 * k} ${3 * k} ${2 * k} ${3 * k}`}
      />
      <Tag at={c} k={k} color={color} testId="pad-level">
        {`FGL ${formatLevel(pad.zMm, units)}`}
      </Tag>
    </g>
  );
}

/** A neighbouring building (grey block) or road (grey strip) fetched from the map. */
export function ContextShape({ item, selected, k }: { item: ContextItem; selected: boolean; k: number }) {
  const stroke = selected ? PLAN.selection : CONTEXT;
  if (item.kind === 'road')
    return (
      <g data-type="context" data-id={item.id}>
        <polyline
          points={pts(item.points)}
          fill="none"
          style={{ stroke: CONTEXT }}
          strokeOpacity={0.35}
          strokeWidth={(item.widthMm ?? 6000) / 10}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {selected && <polyline points={pts(item.points)} fill="none" style={{ stroke }} strokeWidth={2 * k} />}
      </g>
    );
  return (
    <g data-type="context" data-id={item.id}>
      <polygon
        points={pts(item.points)}
        style={{ fill: CONTEXT, stroke }}
        fillOpacity={0.25}
        strokeWidth={(selected ? 2 : 1) * k}
      />
    </g>
  );
}

/** The ground worked out from the levels: contour lines, and where earth is cut (red) and filled (blue). */
export function GroundOverlay({
  contours,
  cutFill,
  units,
  k,
}: {
  contours: ContourLine[];
  cutFill: CutFill | null;
  units: Units;
  k: number;
}) {
  return (
    <g data-testid="ground-overlay" pointerEvents="none">
      {cutFill && cutFill.cut.length > 0 && (
        <path data-testid="cut-tint" d={pathOf(cutFill.cut)} style={{ fill: CUT }} fillOpacity={0.18} />
      )}
      {cutFill && cutFill.fill.length > 0 && (
        <path data-testid="fill-tint" d={pathOf(cutFill.fill)} style={{ fill: FILL }} fillOpacity={0.18} />
      )}
      {cutFill && cutFill.daylight.length > 0 && (
        <path
          data-testid="daylight-line"
          d={cutFill.daylight.map(([a, b]) => `M${a.x} ${a.y}L${b.x} ${b.y}`).join('')}
          fill="none"
          style={{ stroke: PLAN.ink }}
          strokeWidth={1 * k}
          strokeDasharray={`${4 * k} ${3 * k}`}
        />
      )}
      {contours.map((c) =>
        c.lines.map((line, i) => (
          <polyline
            key={`${c.zMm}-${i}`}
            data-testid={c.major ? 'contour-major' : 'contour-minor'}
            points={pts(line)}
            fill="none"
            style={{ stroke: EARTH }}
            strokeOpacity={c.major ? 0.9 : 0.55}
            strokeWidth={(c.major ? 1.4 : 0.7) * k}
          />
        )),
      )}
      {contours
        .filter((c) => c.major)
        .flatMap((c) =>
          c.lines.map((line, i) => {
            const at = line[Math.floor(line.length / 2)];
            return at ? (
              <Tag key={`t${c.zMm}-${i}`} at={at} k={k} color={EARTH}>
                {formatLevel(c.zMm, units)}
              </Tag>
            ) : null;
          }),
        )}
    </g>
  );
}
