import { PlanDrawing } from './PlanDrawing';
import type { PlanImageContent } from '../lib/planImage';
import { PLAN_FONT } from '../lib/planImage';
import { MM_PER_UNIT } from '../lib/scale';
import type { Prim } from '../lib/drawings/sheet';
import { PRINT_PALETTE } from '../theme/plan';

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

/**
 * Drawing instructions on paper (millimetres) as SVG: the Drawings view shows sections,
 * elevations and whole sheets with this, exactly as they print.
 */
export function PrimsSvg({ prims, plan }: { prims: Prim[]; plan?: (levelId: string) => PlanImageContent }) {
  return (
    <g fontFamily={PLAN_FONT}>
      {prims.map((p, i) => {
        switch (p.t) {
          case 'line':
            return (
              <line
                key={i}
                x1={p.a[0]}
                y1={p.a[1]}
                x2={p.b[0]}
                y2={p.b[1]}
                stroke="#111"
                strokeWidth={p.w}
                strokeDasharray={p.dash?.join(' ')}
                strokeLinecap="round"
              />
            );
          case 'fill':
            return (
              <path
                key={i}
                d={p.rings.map((r) => `M${r.map(([x, y]) => `${x},${y}`).join('L')}Z`).join('')}
                fill="#111"
                fillRule="evenodd"
              />
            );
          case 'tri':
            return <path key={i} d={`M${p.pts.map(([x, y]) => `${x},${y}`).join('L')}Z`} fill="#111" />;
          case 'rect':
            return (
              <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill="none" stroke="#111" strokeWidth={p.lw} />
            );
          case 'circle':
            return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="none" stroke="#111" strokeWidth={p.lw} />;
          case 'text':
            return (
              <text
                key={i}
                x={p.x}
                y={p.y}
                fontSize={p.size}
                fontWeight={p.bold ? 700 : 400}
                textAnchor={ANCHOR[p.align ?? 'left']}
                fill="#111"
              >
                {p.text}
              </text>
            );
          case 'plan': {
            const content = plan?.(p.levelId);
            if (!content) return null;
            const a = p.area;
            // Text and thin lines sized as on paper: 1 "pixel" of the screen design is 0.2 mm.
            const k = (0.2 * p.scale) / MM_PER_UNIT;
            return (
              <svg
                key={i}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                viewBox={`${a.minX} ${a.minY} ${a.maxX - a.minX} ${a.maxY - a.minY}`}
                style={PRINT_PALETTE}
                data-testid="sheet-plan"
              >
                <PlanDrawing {...content} selectedIds={[]} k={k} />
              </svg>
            );
          }
        }
      })}
    </g>
  );
}
