import type { Point } from '../types';

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boxOf(pts: Point[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const inBox = (p: Point, b: Box) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

/** Items covering more cells than this are kept in a list checked every time, not in the grid. */
const MAX_CELLS = 256;

/**
 * A grid of buckets for finding the items near a point quickly. Items come back in the order they
 * were added (so add them sorted if the first match should win).
 */
export class GridIndex<T> {
  private cells = new Map<string, { item: T; box: Box; order: number }[]>();
  private big: { item: T; box: Box; order: number }[] = [];
  private count = 0;

  constructor(private cell: number) {}

  add(item: T, box: Box) {
    const entry = { item, box, order: this.count++ };
    const x0 = Math.floor(box.minX / this.cell);
    const x1 = Math.floor(box.maxX / this.cell);
    const y0 = Math.floor(box.minY / this.cell);
    const y1 = Math.floor(box.maxY / this.cell);
    if (!Number.isFinite(x0 + x1 + y0 + y1) || (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_CELLS) {
      this.big.push(entry);
      return;
    }
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++) {
        const key = `${x},${y}`;
        const list = this.cells.get(key);
        if (list) list.push(entry);
        else this.cells.set(key, [entry]);
      }
  }

  /** Items whose box holds p, in the order they were added. */
  at(p: Point): T[] {
    const list = this.cells.get(`${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`) ?? [];
    const hits = [...list, ...this.big].filter((e) => inBox(p, e.box));
    if (this.big.length) hits.sort((a, b) => a.order - b.order);
    return hits.map((e) => e.item);
  }
}

/** A cell size suited to items of these boxes: about the typical item's size. */
export function cellFor(boxes: Box[]): number {
  if (!boxes.length) return 100;
  const sizes = boxes.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)).sort((a, b) => a - b);
  return Math.max(10, sizes[Math.floor(sizes.length / 2)] || 100);
}
