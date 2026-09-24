import { PlanDrawing, type PlanDrawingProps } from '../components/PlanDrawing';
import type { Bounds } from '../types';

/** Font for all plan text, on screen and in exports (SVG images don't inherit the page font). */
export const PLAN_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export type PlanImageContent = Omit<PlanDrawingProps, 'k' | 'selectedId'>;

export interface PlanImageOptions {
  /** Grid spacing in plan units, or null for no grid. */
  grid: number | null;
  /** Plan units per output pixel; sets the size of text and thin lines. */
  k: number;
}

/** The plan as standalone SVG markup covering exactly `area`, at `width` × `height` pixels. */
export async function planSvgMarkup(
  content: PlanImageContent,
  area: Bounds,
  width: number,
  height: number,
  options: PlanImageOptions,
): Promise<string> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const w = area.maxX - area.minX;
  const h = area.maxY - area.minY;
  const { grid, k } = options;
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${area.minX} ${area.minY} ${w} ${h}`}
      width={width}
      height={height}
      fontFamily={PLAN_FONT}
    >
      <rect x={area.minX} y={area.minY} width={w} height={h} fill="#fff" />
      {grid && (
        <>
          <defs>
            <pattern id="export-grid" width={grid} height={grid} patternUnits="userSpaceOnUse">
              <path d={`M ${grid} 0 L 0 0 0 ${grid}`} fill="none" stroke="#e5e7eb" strokeWidth={k} />
            </pattern>
          </defs>
          <rect x={area.minX} y={area.minY} width={w} height={h} fill="url(#export-grid)" />
        </>
      )}
      <PlanDrawing {...content} selectedId={null} k={k} />
    </svg>,
  );
}
