import { HATCH_FAMILIES, type Hatch } from '../../lib/hatch';
import { PLAN } from '../../theme/plan';

/** Plan units per paper millimetre of hatch, for `k` plan units per screen (or output) pixel: 1 mm is 5 pixels. */
const PER_MM = 5;

const patternId = (uid: string, hatch: Hatch, i: number) => `${uid}-hatch-${hatch}-${i}`;

/**
 * The hatches' patterns, one per family of lines, sized for the screen (or the export's paper). They are laid
 * from the plan's origin, so hatches on pieces side by side line up.
 */
export function HatchDefs({ uid, k, hatches }: { uid: string; k: number; hatches: Iterable<Hatch> }) {
  const s = PER_MM * k;
  return (
    <defs>
      {[...new Set(hatches)].flatMap((hatch) =>
        HATCH_FAMILIES[hatch].map((f, i) => {
          const dashes = f.dashes ?? [];
          const period = dashes.reduce((sum, x) => sum + Math.abs(x), 0) || 10;
          const w = period * s;
          const h = f.gap * s;
          const skew = (Math.atan2(f.shift ?? 0, f.gap) * 180) / Math.PI;
          // On the plan y runs down the page: turn the other way, so 45° leans like / as on paper.
          const transform = `rotate(${-f.angle}) skewX(${-skew}) translate(0 ${(f.offset ?? 0) * s})`;
          let x = 0;
          const pieces: [number, number][] = [];
          if (!dashes.length) pieces.push([0, w]);
          for (const dash of dashes) {
            if (dash > 0) pieces.push([x, x + dash * s]);
            x += Math.abs(dash) * s;
          }
          return (
            <pattern
              key={patternId(uid, hatch, i)}
              id={patternId(uid, hatch, i)}
              patternUnits="userSpaceOnUse"
              width={w}
              height={h}
              patternTransform={transform}
            >
              {pieces.map(([a, b], j) => (
                <line
                  key={j}
                  x1={a}
                  y1={h / 2}
                  x2={Math.max(b, a + 0.15 * s)}
                  y2={h / 2}
                  style={{ stroke: PLAN.wallEdge }}
                  strokeWidth={0.6 * k}
                  strokeLinecap="round"
                />
              ))}
            </pattern>
          );
        }),
      )}
    </defs>
  );
}

/** An outline (an SVG path) filled with a hatch's lines; it takes no clicks. */
export function HatchArea({
  uid,
  hatch,
  d,
  opacity = 0.75,
}: {
  uid: string;
  hatch: Hatch;
  d: string;
  opacity?: number;
}) {
  return (
    <g pointerEvents="none" data-hatch={hatch} opacity={opacity}>
      {HATCH_FAMILIES[hatch].map((_, i) => (
        <path key={i} d={d} fill={`url(#${patternId(uid, hatch, i)})`} fillRule="evenodd" stroke="none" />
      ))}
    </g>
  );
}
