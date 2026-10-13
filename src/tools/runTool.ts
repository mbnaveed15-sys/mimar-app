/**
 * The Wire or pipe tool: click from point to point. Each click near a Services item or a fixture (WC,
 * basin, sink…) snaps to it, and the run's ends stay joined to the items they start and finish on.
 * Clicking an item after the first point finishes the run there; Enter (or a right-click) finishes it
 * anywhere.
 */
import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { joinable, joinPoint, RUN_SYSTEMS, runsOf } from '../lib/services';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Furniture, Point, Tool } from '../types';

interface Store {
  getState: () => PlannerState;
}

export const RUN_TOOLS: Tool[] = ['run'];

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The item on the floor being drawn that a run end at `p` joins: one that takes this kind of run
 * first, else any joinable one, within reach of the pointer (or inside the item's own footprint).
 */
export function joinAt(s: PlannerState, p: Point): Furniture | null {
  const reach = Math.max(2, 14 * s.reach() * s.pxUnits());
  const items = joinable(s.visibleElements());
  let best: { f: Furniture; score: number } | null = null;
  for (const f of items) {
    const d = dist(joinPoint(f), p);
    const r = Math.max(reach, Math.min(f.w, f.h) / 2);
    if (d > r) continue;
    // Items that take this run come first.
    const score = d / r + (runsOf(f).includes(s.runSystem) ? 0 : 1);
    if (!best || score < best.score) best = { f, score };
  }
  return best?.f ?? null;
}

/** Where a click at `inf` goes: onto the item there, else where the snapping put it. */
function pointAt(s: PlannerState, inf: Inference): { p: Point; item: Furniture | null } {
  const item = joinAt(s, inf.point);
  return item ? { p: joinPoint(item), item } : { p: inf.point, item: null };
}

export function runPress(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  const { p, item } = pointAt(s, inf);
  if (d?.type !== 'run')
    return s.setDraft({ type: 'run', system: s.runSystem, points: [p], cursor: p, ...(item && { from: item.id }) });
  const last = d.points[d.points.length - 1];
  if (dist(p, last) < 1) return;
  const points = [...d.points, p];
  // Reaching an item (not the one it started from, unless the run went somewhere first) finishes the run.
  if (item && (item.id !== d.from || points.length > 2)) {
    s.addRun(points, d.from, item.id);
    s.setWarning(null);
    return s.setDraft(null);
  }
  s.setDraft({ ...d, points, cursor: p });
}

export function runHover(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'run') s.setDraft({ ...d, cursor: pointAt(s, inf).p });
}

/** Enter (or a right-click): finish the run where it is. */
export function finishRun(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'run') return false;
  if (d.points.length >= 2) s.addRun(d.points, d.from);
  else s.setWarning('A run needs at least two points: click where it goes next.');
  s.setDraft(null);
  return true;
}

/** A typed length carries the run on that far the way the pointer goes. */
export function runMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'run') return 'Click where the run starts (on an item to join it), then type a length.';
  if (m.kind !== 'length') return "Type a length, e.g. 6' or 1.8 m.";
  const last = d.points[d.points.length - 1];
  const v = { x: d.cursor.x - last.x, y: d.cursor.y - last.y };
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-9) return 'Point the way the run goes first, then type its length.';
  const k = m.mm / MM_PER_UNIT / l;
  const p = { x: last.x + v.x * k, y: last.y + v.y * k };
  s.setDraft({ ...d, points: [...d.points, p], cursor: p });
  return null;
}

export function runReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  if (d?.type !== 'run') return { label: 'Run', value: RUN_SYSTEMS[s.runSystem].label };
  const pts = [...d.points, d.cursor];
  const len = pts.slice(1).reduce((sum, p, i) => sum + dist(p, pts[i]), 0);
  return { label: 'Length', value: formatLength(len * MM_PER_UNIT, s.units) };
}

export function runHint(s: PlannerState): string {
  const what = RUN_SYSTEMS[s.runSystem].label.toLowerCase();
  return s.draft?.type === 'run'
    ? `Click the next point of the ${what} run. Click an item to finish there, or press Enter (or right-click) to finish here.`
    : `Click a switch, socket, light, tap or fixture to start the ${what} run, then click where it goes. Pick what it carries on the right.`;
}
