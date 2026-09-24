import type { Bounds } from '../types';
import { planSvgMarkup, type PlanImageContent, type PlanImageOptions } from './planImage';
import { MM_PER_UNIT } from './scale';
import watermarkSvg from '../../branding/ui/watermark.svg?raw';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${url}`));
    img.src = url;
  });
}

/** Load SVG markup as an image via a blob URL, which never taints the canvas. */
async function svgToImage(markup: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Draw the Mimar watermark at the bottom-right corner at 20% opacity. */
async function drawWatermark(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
  try {
    const img = await svgToImage(watermarkSvg);
    const w = Math.min(200, canvas.width * 0.25);
    const h = w * (60 / 200);
    ctx.globalAlpha = 0.2;
    ctx.drawImage(img, canvas.width - w - 20, canvas.height - h - 20, w, h);
    ctx.globalAlpha = 1;
  } catch (e) {
    console.warn('watermark failed', e);
  }
}

/** Longest side of the exported image, in pixels. */
const EXPORT_SIZE = 2000;
/** Space around the plan in exports, in real millimetres (fits dimension lines and labels). */
export const EXPORT_PADDING_MM = 1200;

export function padBounds(area: Bounds, pad: number): Bounds {
  return { minX: area.minX - pad, minY: area.minY - pad, maxX: area.maxX + pad, maxY: area.maxY + pad };
}

export function downloadUrl(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/** Draw the plan covering `area` onto a white canvas of the given size. */
export async function renderPlan(
  content: PlanImageContent,
  area: Bounds,
  width: number,
  height: number,
  options: PlanImageOptions & { watermark: boolean },
): Promise<HTMLCanvasElement> {
  const img = await svgToImage(await planSvgMarkup(content, area, width, height, options));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  if (options.watermark) await drawWatermark(ctx, canvas);
  return canvas;
}

/** Render the whole plan to a PNG with grid and watermark, and download it. */
export async function exportPng(content: PlanImageContent, area: Bounds, grid: number, filename: string) {
  const padded = padBounds(area, EXPORT_PADDING_MM / MM_PER_UNIT);
  const w = padded.maxX - padded.minX;
  const h = padded.maxY - padded.minY;
  const pxPerUnit = Math.min(4, Math.max(0.5, EXPORT_SIZE / Math.max(w, h)));
  const canvas = await renderPlan(content, padded, Math.round(w * pxPerUnit), Math.round(h * pxPerUnit), {
    grid,
    k: 1.2 / pxPerUnit,
    watermark: true,
  });
  downloadUrl(canvas.toDataURL('image/png'), filename);
}
