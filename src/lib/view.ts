import type { Bounds, Point, View } from '../types';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 20;

/** Area shown when the plan is empty (the original Mimar canvas). */
export const DEFAULT_AREA: Bounds = { minX: 0, minY: 0, maxX: 1600, maxY: 1000 };

export interface Size {
  width: number;
  height: number;
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function viewBox(view: View, size: Size): string {
  return `${view.x} ${view.y} ${size.width / view.zoom} ${size.height / view.zoom}`;
}

/** Plan coordinates under a point on screen (relative to the canvas' top-left). */
export function screenToPlan(view: View, screen: Point): Point {
  return { x: view.x + screen.x / view.zoom, y: view.y + screen.y / view.zoom };
}

/** Zoom by factor, keeping the plan point under the cursor fixed. */
export function zoomAt(view: View, screen: Point, factor: number): View {
  const zoom = clampZoom(view.zoom * factor);
  const anchor = screenToPlan(view, screen);
  return { zoom, x: anchor.x - screen.x / zoom, y: anchor.y - screen.y / zoom };
}

/** Move the view by a distance in screen pixels (drag direction). */
export function panBy(view: View, dxScreen: number, dyScreen: number): View {
  return { ...view, x: view.x - dxScreen / view.zoom, y: view.y - dyScreen / view.zoom };
}

/** View that shows the bounds centred with a margin (in screen pixels). */
export function fitView(bounds: Bounds, size: Size, margin = 40): View {
  const w = Math.max(bounds.maxX - bounds.minX, 1);
  const h = Math.max(bounds.maxY - bounds.minY, 1);
  const zoom = clampZoom(Math.min((size.width - 2 * margin) / w, (size.height - 2 * margin) / h, 4));
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { zoom, x: cx - size.width / zoom / 2, y: cy - size.height / zoom / 2 };
}
