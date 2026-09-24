import { PlanDrawing, type PlanDrawingProps } from '../components/PlanDrawing';
import { PlanGrid } from '../components/PlanGrid';
import type { GridLook } from './grid';
import { PRINT_PALETTE } from '../theme/plan';
import type { Bounds } from '../types';

/** Font for all plan text, on screen and in exports (SVG images don't inherit the page font). */
export const PLAN_FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export type PlanImageContent = Omit<PlanDrawingProps, 'k' | 'selectedId'>;

export interface PlanImageOptions {
  /** Grid spacing in plan units and how it looks, or null for no grid. */
  grid: { step: number; look: GridLook } | null;
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
      // Exports ignore the theme: print colours on white paper.
      style={PRINT_PALETTE}
    >
      <rect x={area.minX} y={area.minY} width={w} height={h} fill="#fff" />
      {grid && <PlanGrid id="export" area={area} step={grid.step} look={grid.look} k={k} />}
      <PlanDrawing {...content} selectedId={null} k={k} />
    </svg>,
  );
}
