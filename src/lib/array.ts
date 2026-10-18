/**
 * Arrays, as in AutoCAD: copies of a selection in rows and columns, round a centre, or spaced along a
 * wall, layout line or wire or pipe. Each copy is an ordinary item (groups stay groups). Pure.
 */
import { rotatePoint } from '../geometry';
import { directionAlong, pointAlong, runLength } from './arc';
import { curvedRunPoints, runCurved } from './services';
import { boundsCentre, copyItems, rotateItems, selectionBounds } from './selection';
import type { ArraySettings, Id, PlanDoc, PlanElement, Point } from '../types';

export const DEFAULT_ARRAY: ArraySettings = { mode: 'grid', cols: 4, rows: 1, count: 6, fillDeg: 360, turn: true };
/** The most copies one array makes. */
export const MAX_ARRAY = 400;

type Out = { doc: PlanDoc; ids: Id[] };

/** Keep a count to a whole number from `min` to MAX_ARRAY. */
export const arrayCount = (n: number, min = 1) => Math.max(min, Math.min(MAX_ARRAY, Math.round(n) || min));

/**
 * Rows and columns. `step` is base→pointer: with both rows and columns it is one cell (across, then
 * down); with one row or one column it is the gap between copies, at any angle.
 */
export function gridArray(doc: PlanDoc, ids: Id[], cols: number, rows: number, step: Point): Out {
  cols = arrayCount(cols);
  rows = arrayCount(rows);
  const grid = cols > 1 && rows > 1;
  const across = grid || rows === 1 ? (grid ? { x: step.x, y: 0 } : step) : { x: 0, y: 0 };
  const down = grid ? { x: 0, y: step.y } : rows > 1 ? step : { x: 0, y: 0 };
  let out: Out = { doc, ids: [] };
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if ((!r && !c) || out.ids.length >= MAX_ARRAY * 50) continue;
      const dx = across.x * c + down.x * r;
      const dy = across.y * c + down.y * r;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) continue;
      const made = copyItems(out.doc, ids, dx, dy);
      out = { doc: made.doc, ids: [...out.ids, ...made.ids] };
    }
  return out;
}

/**
 * Round a centre: `count` in all (the originals one of them) over `fillDeg` degrees counter-clockwise
 * on the plan, evenly round a full circle. With `turn` off the copies keep their way round.
 */
export function polarArray(doc: PlanDoc, ids: Id[], centre: Point, count: number, fillDeg: number, turn: boolean): Out {
  count = arrayCount(count, 2);
  const fill = Math.max(-360, Math.min(360, fillDeg)) || 360;
  const step = Math.abs(fill) >= 360 ? fill / count : fill / (count - 1);
  const mid = middleOf(doc, ids);
  let out: Out = { doc, ids: [] };
  for (let i = 1; i < count; i++) {
    // Counter-clockwise as seen (the plan's y points down).
    const deg = -step * i;
    let made: Out;
    if (turn) {
      made = copyItems(out.doc, ids, 0, 0);
      made = { doc: rotateItems(made.doc, made.ids, centre, deg), ids: made.ids };
    } else {
      const to = rotatePoint(mid, centre, deg);
      made = copyItems(out.doc, ids, to.x - mid.x, to.y - mid.y);
    }
    out = { doc: made.doc, ids: [...out.ids, ...made.ids] };
  }
  return out;
}

/** A path an array can follow: walls and layout lines (straight or curved) and wire and pipe runs. */
export function isArrayPath(el: PlanElement): boolean {
  return el.type === 'wall' || el.type === 'line' || el.type === 'run';
}

/** Where along a path (0 at its start, 1 at its end) and which way it heads there. */
function pathOf(el: PlanElement): ((t: number) => { at: Point; dir: Point }) | null {
  if (el.type === 'wall' || el.type === 'line')
    return runLength(el) > 0 ? (t) => ({ at: pointAlong(el, t), dir: directionAlong(el, t) }) : null;
  if (el.type !== 'run') return null;
  const pts = runCurved(el) ? curvedRunPoints(el.points) : el.points;
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  if (!total) return null;
  return (t) => {
    let left = t * total;
    for (let i = 0; i < lens.length; i++) {
      if (left <= lens[i] || i === lens.length - 1) {
        const k = lens[i] ? Math.min(1, left / lens[i]) : 0;
        const a = pts[i];
        const b = pts[i + 1];
        return {
          at: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
          dir: { x: (b.x - a.x) / (lens[i] || 1), y: (b.y - a.y) / (lens[i] || 1) },
        };
      }
      left -= lens[i];
    }
    return { at: pts[pts.length - 1], dir: { x: 1, y: 0 } };
  };
}

/**
 * Along a path: `count` copies spaced evenly from its start to its end, each centred on it. With `turn`
 * on they turn with the path (as they sit at its start). A spot where an original already sits is left.
 */
export function pathArray(doc: PlanDoc, ids: Id[], path: PlanElement, count: number, turn: boolean): Out {
  const along = pathOf(path);
  if (!along) return { doc, ids: [] };
  count = arrayCount(count, 2);
  const mid = middleOf(doc, ids);
  const start = Math.atan2(along(0).dir.y, along(0).dir.x);
  const b = selectionBounds(doc, ids);
  const near = b ? Math.max(1, Math.min(b.maxX - b.minX, b.maxY - b.minY) / 4) : 1;
  let out: Out = { doc, ids: [] };
  for (let i = 0; i < count; i++) {
    const { at, dir } = along(i / (count - 1));
    if (Math.hypot(at.x - mid.x, at.y - mid.y) < near) continue;
    let made = copyItems(out.doc, ids, at.x - mid.x, at.y - mid.y);
    const deg = ((Math.atan2(dir.y, dir.x) - start) * 180) / Math.PI;
    if (turn && Math.abs(deg) > 1e-6) made = { doc: rotateItems(made.doc, made.ids, at, deg), ids: made.ids };
    out = { doc: made.doc, ids: [...out.ids, ...made.ids] };
  }
  return out;
}

function middleOf(doc: PlanDoc, ids: Id[]): Point {
  const b = selectionBounds(doc, ids);
  return b ? boundsCentre(b) : { x: 0, y: 0 };
}
