import type { Bounds } from '../types';
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

/**
 * Render the given area of the plan to a PNG (white background, watermark) and download it.
 * Selection handles and in-progress drawing are left out.
 */
export async function exportPng(svg: SVGSVGElement, area: Bounds, filename = 'mimar-plan.png') {
  const pad = 40;
  const x = area.minX - pad;
  const y = area.minY - pad;
  const w = area.maxX - area.minX + 2 * pad;
  const h = area.maxY - area.minY + 2 * pad;
  const scale = Math.min(4, Math.max(0.5, EXPORT_SIZE / Math.max(w, h)));
  const width = Math.round(w * scale);
  const height = Math.round(h * scale);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="skip"]').forEach((n) => n.remove());
  const grid = clone.querySelector('[data-grid]');
  grid?.setAttribute('x', String(x));
  grid?.setAttribute('y', String(y));
  grid?.setAttribute('width', String(w));
  grid?.setAttribute('height', String(h));
  clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const img = await svgToImage(new XMLSerializer().serializeToString(clone));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  await drawWatermark(ctx, canvas);

  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}
