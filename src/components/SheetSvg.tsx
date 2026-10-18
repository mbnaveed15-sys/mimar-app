import { useEffect, useState } from 'react';
import { PlanDrawing } from './PlanDrawing';
import type { PlanImageContent } from '../lib/planImage';
import { PLAN_FONT } from '../lib/planImage';
import { MM_PER_UNIT } from '../lib/scale';
import type { PlanServices, Prim } from '../lib/drawings/sheet';

/** A floor's plan content, with none, one trade's or all of its services. */
type PlanContent = (levelId: string, services?: PlanServices) => PlanImageContent;
import { PRINT_PALETTE } from '../theme/plan';
import type { SavedCamera } from '../types';

const ANCHOR = { left: 'start', center: 'middle', right: 'end' } as const;

/**
 * Drawing instructions on paper (millimetres) as SVG: the Drawings view shows sections,
 * elevations and whole sheets with this, exactly as they print.
 */
export function PrimsSvg({
  prims,
  plan,
  picture,
}: {
  prims: Prim[];
  plan?: PlanContent;
  /** Draws the coloured 3D picture at a size in pixels. */
  picture?: (width: number, height: number, camera?: SavedCamera) => Promise<string | null>;
}) {
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
                transform={p.angle ? `rotate(${-p.angle} ${p.x} ${p.y})` : undefined}
                fill="#111"
              >
                {p.text}
              </text>
            );
          case 'picture':
            return <Picture key={i} box={p} make={picture} />;
          case 'plan': {
            const content = plan?.(p.levelId, p.services);
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

/** The coloured 3D picture on a sheet: drawn once it is ready (a note while it is, or when it can't be). */
function Picture({
  box,
  make,
}: {
  box: { x: number; y: number; w: number; h: number; camera?: SavedCamera };
  make?: (width: number, height: number, camera?: SavedCamera) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const px = (mm: number) => Math.max(2, Math.round((mm / 25.4) * 110));
  const [w, h] = [px(box.w), px(box.h)];
  useEffect(() => {
    let live = true;
    // Drawn after the sheet shows, so the page doesn't wait for it.
    const t = setTimeout(() => {
      (make?.(w, h, box.camera) ?? Promise.resolve(null)).then(
        (u) => live && setUrl(u),
        () => live && setUrl(null),
      );
    }, 50);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [make, w, h, box.camera]);
  if (url)
    return (
      <image
        href={url}
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        preserveAspectRatio="xMidYMid meet"
        data-testid="sheet-picture"
      />
    );
  return (
    <text x={box.x + box.w / 2} y={box.y + box.h / 2} fontSize={3} textAnchor="middle" fill="#777">
      {url === null ? 'The 3D picture needs 3D graphics on this computer' : 'Drawing the 3D picture…'}
    </text>
  );
}
