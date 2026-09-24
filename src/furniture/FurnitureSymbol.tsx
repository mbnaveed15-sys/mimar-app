import type { ReactNode } from 'react';
import type { FurnitureKind } from './catalog';

interface Props {
  kind: FurnitureKind;
  /** Size in plan units; the symbol is centred on 0,0 with its back (the wall side) at the top. */
  w: number;
  h: number;
  fill: string;
  stroke: string;
  /** Line width in plan units. */
  sw: number;
}

/** Plan-view drawing of a library item, in the style of architectural furniture symbols. */
export function FurnitureSymbol({ kind, w, h, fill, stroke, sw }: Props) {
  const L = -w / 2;
  const T = -h / 2;
  // Colours go in style, so they can be theme variables (SVG attributes don't accept them everywhere).
  const lineStyle = {
    fill: 'none',
    stroke,
    strokeWidth: sw,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
  };
  const line = { style: lineStyle };
  const shape = { style: { ...lineStyle, fill } };
  /** Rectangle from fractions of the item's width and depth (0,0 = back left corner). */
  const r = (fx: number, fy: number, fw: number, fh: number, rx = 0, extra: object = {}) => (
    <rect x={L + fx * w} y={T + fy * h} width={fw * w} height={fh * h} rx={rx} {...shape} {...extra} />
  );
  const ln = (fx1: number, fy1: number, fx2: number, fy2: number, extra: object = {}) => (
    <line x1={L + fx1 * w} y1={T + fy1 * h} x2={L + fx2 * w} y2={T + fy2 * h} {...line} {...extra} />
  );
  const circle = (fx: number, fy: number, radius: number) => (
    <circle cx={L + fx * w} cy={T + fy * h} r={radius} {...shape} />
  );
  const ellipse = (fx: number, fy: number, frx: number, fry: number) => (
    <ellipse cx={L + fx * w} cy={T + fy * h} rx={frx * w} ry={fry * h} {...shape} />
  );
  const small = Math.min(w, h);

  const parts: Record<FurnitureKind, () => ReactNode> = {
    'bed-single': () => bed(1),
    'bed-double': () => bed(2),
    'bed-king': () => bed(2),
    wardrobe: () => (
      <>
        {r(0, 0, 1, 1)}
        {ln(0.5, 0, 0.5, 1)}
        {ln(0.03, 0.5, 0.97, 0.5, { strokeDasharray: `${sw * 4} ${sw * 3}` })}
      </>
    ),
    'side-table': () => (
      <>
        {r(0, 0, 1, 1, small * 0.05)}
        {circle(0.5, 0.5, small * 0.25)}
      </>
    ),
    'sofa-3': () => sofa(3),
    'sofa-2': () => sofa(2),
    armchair: () => sofa(1),
    'coffee-table': () => (
      <>
        {r(0, 0, 1, 1, small * 0.12)}
        {r(0.08, 0.15, 0.84, 0.7, small * 0.08)}
      </>
    ),
    'tv-unit': () => (
      <>
        {r(0, 0, 1, 1)}
        {r(0.2, 0.3, 0.6, 0.18)}
      </>
    ),
    'dining-4': () => dining(2, false),
    'dining-6': () => dining(3, false),
    'dining-8': () => dining(3, true),
    counter: () => (
      <>
        {r(0, 0, 1, 1)}
        {ln(0, 0.85, 1, 0.85)}
      </>
    ),
    sink: () => (
      <>
        {r(0, 0, 1, 1)}
        {r(0.15, 0.15, 0.7, 0.62, small * 0.08)}
        {circle(0.5, 0.46, small * 0.04)}
        {ln(0.5, 0.05, 0.5, 0.15)}
      </>
    ),
    stove: () => (
      <>
        {r(0, 0, 1, 1)}
        {[0.3, 0.7].flatMap((fx) => [0.3, 0.68].map((fy) => <g key={`${fx}-${fy}`}>{circle(fx, fy, small * 0.14)}</g>))}
      </>
    ),
    fridge: () => (
      <>
        {r(0, 0, 1, 1)}
        {ln(0, 0.85, 1, 0.85)}
        <text
          x={0}
          y={-h * 0.05}
          fontSize={small * 0.22}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ fill: stroke }}
        >
          FRIDGE
        </text>
      </>
    ),
    wc: () => (
      <>
        {r(0.05, 0, 0.9, 0.25, small * 0.05)}
        {ellipse(0.5, 0.6, 0.42, 0.36)}
        {ellipse(0.5, 0.62, 0.26, 0.24)}
      </>
    ),
    'wc-indian': () => (
      <>
        {r(0, 0, 1, 1, small * 0.08)}
        {ellipse(0.5, 0.42, 0.22, 0.3)}
        {r(0.08, 0.72, 0.28, 0.2, small * 0.04)}
        {r(0.64, 0.72, 0.28, 0.2, small * 0.04)}
      </>
    ),
    basin: () => (
      <>
        {r(0, 0, 1, 1, small * 0.06)}
        {ellipse(0.5, 0.55, 0.36, 0.32)}
        {circle(0.5, 0.2, small * 0.04)}
      </>
    ),
    shower: () => (
      <>
        {r(0, 0, 1, 1)}
        {ln(0, 0, 1, 1)}
        {ln(1, 0, 0, 1)}
        {circle(0.5, 0.5, small * 0.06)}
      </>
    ),
    bathtub: () => (
      <>
        {r(0, 0, 1, 1, small * 0.06)}
        {r(0.1, 0.06, 0.8, 0.88, small * 0.3)}
        {circle(0.5, 0.15, small * 0.05)}
      </>
    ),
    stairs: () => {
      const steps = Math.max(3, Math.round(h / (w * 0.28)));
      return (
        <>
          {r(0, 0, 1, 1)}
          {Array.from({ length: steps - 1 }, (_, i) => (
            <g key={i}>{ln(0, (i + 1) / steps, 1, (i + 1) / steps)}</g>
          ))}
          {/* Arrow pointing up the stairs, from the bottom (front) to the top. */}
          {ln(0.5, 0.95, 0.5, 0.08)}
          {ln(0.5, 0.08, 0.38, 0.14)}
          {ln(0.5, 0.08, 0.62, 0.14)}
        </>
      );
    },
    car: () => (
      <>
        {r(0, 0, 1, 1, small * 0.22)}
        {r(0.12, 0.28, 0.76, 0.42, small * 0.12)}
        {ln(0.12, 0.36, 0.88, 0.36)}
        {ln(0.12, 0.62, 0.88, 0.62)}
      </>
    ),
  };

  function bed(pillows: 1 | 2) {
    const pw = pillows === 1 ? 0.7 : 0.4;
    return (
      <>
        {r(0, 0, 1, 1, small * 0.03)}
        {pillows === 1
          ? r(0.15, 0.04, pw, 0.12, small * 0.04)
          : [0.06, 0.54].map((fx) => <g key={fx}>{r(fx, 0.04, pw, 0.12, small * 0.04)}</g>)}
        {ln(0, 0.3, 1, 0.3)}
        {ln(0, 0.3, 0.2, 0.42)}
      </>
    );
  }

  function sofa(seats: number) {
    const arm = seats === 1 ? 0.18 : 0.1;
    const back = 0.25;
    const seatW = (1 - 2 * arm) / seats;
    return (
      <>
        {r(0, 0, 1, 1, small * 0.06)}
        {ln(arm, back, 1 - arm, back)}
        {ln(arm, back, arm, 1)}
        {ln(1 - arm, back, 1 - arm, 1)}
        {Array.from({ length: seats - 1 }, (_, i) => (
          <g key={i}>{ln(arm + (i + 1) * seatW, back, arm + (i + 1) * seatW, 0.95)}</g>
        ))}
      </>
    );
  }

  function dining(perSide: number, ends: boolean) {
    const chairD = 0.27; // chair depth as a share of the depth
    const endW = ends ? 450 / 2700 : 0;
    const tableX = endW;
    const tableW = 1 - 2 * endW;
    const chairs: ReactNode[] = [];
    const cw = (tableW / perSide) * 0.62;
    for (let i = 0; i < perSide; i++) {
      const cx = tableX + (tableW / perSide) * (i + 0.5) - cw / 2;
      chairs.push(<g key={`t${i}`}>{r(cx, 0.02, cw, chairD * 0.85, small * 0.03)}</g>);
      chairs.push(<g key={`b${i}`}>{r(cx, 1 - 0.02 - chairD * 0.85, cw, chairD * 0.85, small * 0.03)}</g>);
    }
    if (ends) {
      const ch = 0.26;
      chairs.push(<g key="l">{r(0.01, 0.5 - ch / 2, endW * 0.85, ch, small * 0.03)}</g>);
      chairs.push(<g key="r">{r(1 - 0.01 - endW * 0.85, 0.5 - ch / 2, endW * 0.85, ch, small * 0.03)}</g>);
    }
    return (
      <>
        {chairs}
        {r(tableX, chairD, tableW, 1 - 2 * chairD, small * 0.02)}
      </>
    );
  }

  return <g data-symbol={kind}>{parts[kind]()}</g>;
}
