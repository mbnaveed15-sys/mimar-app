import { findElementNear, placeOnWall } from '../geometry';
import { axisDirection, infer, type Inference } from '../lib/inference';
import { parseMeasure, type MeasureKind } from '../lib/measure';
import { boundsCentre, copyItems, deleteItems, moveItems, rotateItems, selectionBounds } from '../lib/selection';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Id, Point, SketchLine, Tool, Wall } from '../types';
import { MODIFY_TOOLS } from '../types';
import { wallsOf } from '../walls';
import {
  modifyAnchor,
  modifyHint,
  modifyHover,
  modifyMeasure,
  modifyPress,
  modifyReadout,
  modifyRelease,
} from './modifyTools';
import {
  STRUCTURE_TOOLS,
  structureHint,
  structureHover,
  structureMeasure,
  structurePress,
  structureReadout,
  structureRelease,
} from './structureTools';

/** The bits of a zustand store the controller needs. */
export interface Store {
  getState: () => PlannerState;
}

/** Tools that take clicks on the plan and a typed value in the Measurements box. */
export const MEASURE_TOOLS: Partial<Record<Tool, MeasureKind>> = {
  wall: 'length',
  line: 'length',
  rectangle: 'pair',
  tape: 'length',
  move: 'move',
  rotate: 'angle',
  offset: 'length',
  mirror: 'none',
  trim: 'none',
  extend: 'none',
  breakWall: 'length',
  join: 'none',
  fillet: 'length',
  chamfer: 'pair',
  stretch: 'length',
  scale: 'scale',
  column: 'none',
  beam: 'length',
  slab: 'pair',
  plot: 'pair',
  stairs: 'none',
};

/** Rotation snaps to this many degrees unless Shift is held. */
const ANGLE_STEP = 15;
/** Screen pixels a press must travel to count as a drag instead of a click. */
export const DRAG_PX = 5;

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const degrees = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Snap a point for the active tool, drawing from `from` when there is one. */
export function inferAt(s: PlannerState, raw: Point, from: Point | null, ignoreIds?: Set<Id>): Inference {
  const lock = from ? (s.axisLock ? axisDirection(s.axisLock) : s.shiftLock) : null;
  return infer(raw, {
    walls: wallsOf(s.visibleElements()),
    lines: s.visibleElements().filter((el): el is SketchLine => el.type === 'line'),
    tolerance: 10 * s.reach() * s.pxUnits(),
    from,
    grid: s.grid.snap ? s.gridPx : null,
    lock,
    ignoreIds,
  });
}

/** Where the active step is drawing from, for snapping and locks. */
export function anchorOf(s: PlannerState): Point | null {
  const d = s.draft;
  if (!d) return null;
  if (MODIFY_TOOLS.includes(s.tool)) return modifyAnchor(s);
  if (d.type === 'beam' || d.type === 'slab' || d.type === 'plot') return { x: d.x1, y: d.y1 };
  switch (d.type) {
    case 'wall':
    case 'line':
    case 'rectangle':
      return { x: d.x1, y: d.y1 };
    case 'tape':
      return d.done ? null : d.a;
    case 'move':
      return d.base;
    case 'rotate':
      return d.center;
    default:
      return null;
  }
}

/** Direction of the rubber band being drawn, for Shift lock and typed lengths. */
export function currentDirection(s: PlannerState): Point | null {
  const d = s.draft;
  if (!d) return null;
  if (d.type === 'wall' || d.type === 'line' || d.type === 'rectangle') return sub({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 });
  if (d.type === 'tape') return sub(d.b, d.a);
  if (d.type === 'move') return sub(d.to, d.base);
  return null;
}

/**
 * What Move or Rotate works on: the selection if the click is on it (or on nothing), otherwise
 * whatever is under the click, which becomes the selection.
 */
function targetFor(store: Store, raw: Point, allowOpenings: boolean): Id[] | null {
  const s = store.getState();
  const hit = findElementNear(s.pickableElements(), raw, s.hitTolerance());
  if (hit && !s.selectedIds.includes(hit.id)) s.select(hit.id);
  const { selectedIds: ids } = store.getState();
  if (!ids.length) return null;
  if (!allowOpenings && ids.every((id) => isOpening(s, id))) return null;
  return ids;
}

function isWallOnly(s: PlannerState, ids: Id[]) {
  return ids.every((id) => s.doc.elements.find((e) => e.id === id)?.type === 'wall');
}

function isOpening(s: PlannerState, id: Id) {
  const el = s.doc.elements.find((e) => e.id === id);
  return el?.type === 'door' || el?.type === 'window';
}

/** Ids of walls being moved, left out of snapping so they don't snap to themselves. */
function movingIds(s: PlannerState): Set<Id> | undefined {
  const d = s.draft;
  return d?.type === 'move' ? new Set(d.ids) : undefined;
}

/** Pointer moved over the plan: update the snap marker and the rubber band. */
export function hover(store: Store, raw: Point, shift = false) {
  const s = store.getState();
  const d = s.draft;
  if (!(s.tool in MEASURE_TOOLS)) return;
  const from = anchorOf(s);
  const inf = inferAt(s, raw, from, movingIds(s));
  s.setInference(inf);
  if (MODIFY_TOOLS.includes(s.tool)) return modifyHover(store, raw, inf, shift);
  if (STRUCTURE_TOOLS.includes(s.tool)) return structureHover(store, inf);
  const p = inf.point;
  if (!d) return;

  switch (d.type) {
    case 'wall':
    case 'line':
    case 'rectangle':
      s.setDraft({ ...d, x2: p.x, y2: p.y });
      break;
    case 'tape':
      if (!d.done) s.setDraft({ ...d, b: p });
      break;
    case 'move':
      moveTo(store, p, raw);
      break;
    case 'rotate': {
      if (!d.start) break;
      let angle = degrees(sub(raw, d.center)) - degrees(sub(d.start, d.center));
      angle = ((angle + 540) % 360) - 180;
      if (!shift) angle = Math.round(angle / ANGLE_STEP) * ANGLE_STEP;
      const { ids, center } = d;
      s.commitFromBase((base) => rotateItems(base, ids, center, angle));
      s.setDraft({ ...d, angle });
      break;
    }
  }
}

/** Show the items being moved (or their copies) at `to`, starting again from the plan before the move. */
function moveTo(store: Store, to: Point, raw: Point) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  const only = d.ids.length === 1 ? s.batchBase?.elements.find((el) => el.id === d.ids[0]) : undefined;
  if (only && (only.type === 'door' || only.type === 'window')) {
    // A door or window on its own slides along its wall.
    const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === only.wallId);
    if (wall) s.updateElement({ ...only, ...placeOnWall(wall, raw, only.width) });
    s.setDraft({ ...d, to: raw });
    return;
  }
  const dx = to.x - d.base.x;
  const dy = to.y - d.base.y;
  const { ids, copy } = d;
  s.commitFromBase((base) => (copy ? copyItems(base, ids, dx, dy).doc : moveItems(base, ids, dx, dy)));
  s.setDraft({ ...d, to });
}

/** Switch copy mode on or off while moving (Ctrl), like SketchUp. */
export function toggleCopy(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  if (
    d.ids.every((id) =>
      s.batchBase?.elements.find((el) => el.id === id && (el.type === 'door' || el.type === 'window')),
    )
  )
    return;
  s.setDraft({ ...d, copy: !d.copy });
  moveTo(store, d.to, d.to);
}

/** Finish a move: keep the moved items, or make the copies for real and select them. */
function finishMove(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  const dx = d.to.x - d.base.x;
  const dy = d.to.y - d.base.y;
  let lastCopy: PlannerState['lastCopy'] = null;
  let selection = d.ids;
  if (d.copy && (dx || dy)) {
    const { ids } = d;
    let copyIds: Id[] = [];
    s.commitFromBase((base) => {
      const out = copyItems(base, ids, dx, dy);
      copyIds = out.ids;
      return out.doc;
    });
    lastCopy = { ids, dx, dy, copyIds };
    selection = copyIds;
  }
  s.endBatch();
  s.setDraft(null);
  s.setSelection(selection);
  s.setLastCopy(lastCopy);
}

/** Pointer pressed on the plan with a measuring tool. Returns true if the tool used it. */
export function press(store: Store, raw: Point, opts: { ctrl?: boolean } = {}): boolean {
  const s = store.getState();
  const d = s.draft;
  const from = anchorOf(s);
  const inf = inferAt(s, raw, from, movingIds(s));
  const p = inf.point;
  const tol = 10 * s.reach() * s.pxUnits();
  if (MODIFY_TOOLS.includes(s.tool)) {
    modifyPress(store, raw, inf, opts);
    return true;
  }
  if (STRUCTURE_TOOLS.includes(s.tool)) {
    structurePress(store, inf);
    return true;
  }

  switch (s.tool) {
    case 'wall': {
      if (d?.type !== 'wall') {
        s.setDraft({ type: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y, chainStart: p });
        return true;
      }
      if (!d.chain) return true;
      finishWallAt(store, p, tol);
      return true;
    }
    case 'line': {
      if (d?.type !== 'line') {
        s.setDraft({ type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        return true;
      }
      if (d.chain) finishLineAt(store, p);
      return true;
    }
    case 'rectangle':
      if (d?.type !== 'rectangle') s.setDraft({ type: 'rectangle', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      else {
        s.addRectangle({ x: d.x1, y: d.y1 }, p);
        s.setDraft(null);
      }
      return true;
    case 'tape':
      if (d?.type !== 'tape' || d.done) s.setDraft({ type: 'tape', a: p, b: p });
      else s.setDraft({ ...d, b: p, done: true });
      return true;
    case 'move': {
      if (d?.type === 'move') {
        moveTo(store, p, raw);
        finishMove(store);
        return true;
      }
      const ids = targetFor(store, raw, true);
      if (!ids) {
        s.setWarning('Select what to move (or click on it), then click where to move it.');
        return true;
      }
      s.setWarning(null);
      s.setLastCopy(null);
      s.beginBatch();
      s.setDraft({ type: 'move', ids: store.getState().selectedIds, base: p, to: p, copy: false });
      if (opts.ctrl) toggleCopy(store);
      return true;
    }
    case 'rotate': {
      if (d?.type === 'rotate') {
        if (!d.start) {
          if (same(raw, d.center, tol)) return true;
          s.setDraft({ ...d, start: raw });
        } else {
          s.endBatch();
          s.setDraft(null);
        }
        return true;
      }
      const ids = targetFor(store, raw, false);
      if (!ids) {
        s.setWarning('Select what to rotate (or click on it), then click the centre to turn it about.');
        return true;
      }
      s.setWarning(null);
      s.beginBatch();
      // A single item turns about its own centre unless the click snapped to a wall point.
      const selected = store.getState().selectedIds;
      const onWall = inf.kind === 'endpoint' || inf.kind === 'midpoint' || inf.kind === 'on-wall';
      const box = selectionBounds(s.doc, selected);
      const center = !onWall && box && selected.length === 1 && !isWallOnly(s, selected) ? boundsCentre(box) : p;
      s.setDraft({ type: 'rotate', ids: selected, center, angle: 0 });
      return true;
    }
    default:
      return false;
  }
}

/** Add the wall being drawn, ending at p, and carry on from p unless the loop closed. */
function finishWallAt(store: Store, p: Point, tol: number) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'wall') return;
  const start = { x: d.x1, y: d.y1 };
  if (same(start, p, 0.01)) return;
  s.addWall(start, p);
  s.setAxisLock(null);
  const closed = d.chainStart && same(p, d.chainStart, tol) && !same(start, d.chainStart, 0.01);
  s.setDraft(
    closed ? null : { type: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y, chain: true, chainStart: d.chainStart },
  );
}

/** Add the layout line being drawn, ending at p, and carry on from p. */
function finishLineAt(store: Store, p: Point) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'line' || same({ x: d.x1, y: d.y1 }, p, 0.01)) return;
  s.addLine({ x: d.x1, y: d.y1 }, p);
  s.setAxisLock(null);
  s.setDraft({ type: 'line', x1: p.x, y1: p.y, x2: p.x, y2: p.y, chain: true });
}

/**
 * Pointer released. A wall drawn by dragging is finished here; a press without dragging starts
 * click-by-click drawing instead, where each click adds a wall.
 */
export function release(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (MODIFY_TOOLS.includes(s.tool)) return modifyRelease(store, dragged);
  if (STRUCTURE_TOOLS.includes(s.tool)) return structureRelease(store, dragged);
  if (s.tool === 'line' && d?.type === 'line' && !d.chain) {
    // Like walls: a drag makes one line, a click starts click-by-click drawing.
    if (dragged) {
      s.addLine({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 });
      s.setDraft(null);
    } else s.setDraft({ ...d, chain: true });
    return;
  }
  if (s.tool !== 'wall' || d?.type !== 'wall' || d.chain) return;
  if (dragged) {
    s.addWall({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 });
    s.setDraft(null);
  } else {
    s.setDraft({ ...d, chain: true });
  }
}

/** Apply what was typed in the Measurements box. Returns false (and warns) if it can't be used. */
export function applyMeasure(store: Store, text: string): boolean {
  const s = store.getState();
  const kind = MEASURE_TOOLS[s.tool];
  if (!kind) return false;
  const m = parseMeasure(text, s.units, kind);
  const fail = (message: string) => {
    s.setWarning(message);
    return false;
  };
  if (!m) {
    const hints: Record<MeasureKind, string> = {
      length: `Type a length, e.g. 12'6 or 3.8m.`,
      pair: `Type width and depth, e.g. 12',10'.`,
      angle: 'Type an angle in degrees, e.g. 90 or -45.',
      move: `Type a distance, or 3x / /3 for copies after a copy.`,
      scale: 'Type a factor such as 2 or 0.5, or a length.',
      none: 'This tool does not take typed values.',
    };
    return fail(hints[kind]);
  }
  if (MODIFY_TOOLS.includes(s.tool) || STRUCTURE_TOOLS.includes(s.tool)) {
    const error = MODIFY_TOOLS.includes(s.tool) ? modifyMeasure(store, m) : structureMeasure(store, m);
    if (error) return fail(error);
    s.setWarning(null);
    return true;
  }
  const d = s.draft;
  const units = (mm: number) => mm / MM_PER_UNIT;
  const along = (from: Point, dir: Point | null, mm: number) => {
    const len = dir ? Math.hypot(dir.x, dir.y) : 0;
    const u = len > 1e-9 && dir ? { x: dir.x / len, y: dir.y / len } : { x: 1, y: 0 };
    return { x: from.x + u.x * units(mm), y: from.y + u.y * units(mm) };
  };
  const lockDir = s.axisLock ? axisDirection(s.axisLock) : s.shiftLock;

  s.setWarning(null);
  switch (s.tool) {
    case 'line': {
      if (d?.type !== 'line' || m.kind !== 'length') return fail('Click where the line starts, then type its length.');
      const end = along({ x: d.x1, y: d.y1 }, lockDir ?? currentDirection(s), m.mm);
      finishLineAt(store, end);
      return true;
    }
    case 'wall': {
      if (d?.type !== 'wall' || m.kind !== 'length') return fail('Click where the wall starts, then type its length.');
      const end = along({ x: d.x1, y: d.y1 }, lockDir ?? currentDirection(s), m.mm);
      if (!d.chain) s.setDraft({ ...d, chain: true });
      finishWallAt(store, end, 10 * s.reach() * s.pxUnits());
      return true;
    }
    case 'rectangle': {
      if (d?.type !== 'rectangle') return fail('Click the first corner, then type width and depth.');
      const dir = currentDirection(s) ?? { x: 1, y: 1 };
      const [a, b] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
      if (!a || !b) return fail(`Type width and depth, e.g. 12',10'.`);
      const sx = dir.x < 0 ? -1 : 1;
      const sy = dir.y < 0 ? -1 : 1;
      s.addRectangle({ x: d.x1, y: d.y1 }, { x: d.x1 + sx * units(a), y: d.y1 + sy * units(b) });
      s.setDraft(null);
      return true;
    }
    case 'tape': {
      return fail('The tape measure shows distances; it does not take typed values.');
    }
    case 'move': {
      if (m.kind === 'copies') {
        if (!s.lastCopy) return fail('Move with Ctrl to make a copy first, then type 3x or /3.');
        const { ids, dx, dy, copyIds } = s.lastCopy;
        const step = m.spread ? { x: dx / m.n, y: dy / m.n } : { x: dx, y: dy };
        let made: Id[] = [];
        s.commit((doc) => {
          let next = deleteItems(doc, copyIds);
          made = [];
          for (let i = 1; i <= m.n; i++) {
            const out = copyItems(next, ids, step.x * i, step.y * i);
            next = out.doc;
            made.push(...out.ids);
          }
          return next;
        });
        s.setLastCopy({ ids, dx, dy, copyIds: made });
        s.setSelection(made);
        return true;
      }
      if (d?.type !== 'move' || m.kind !== 'length') return fail('Click the point to move from, then type a distance.');
      const to = along(d.base, lockDir ?? currentDirection(s), m.mm);
      moveTo(store, to, to);
      finishMove(store);
      return true;
    }
    case 'rotate': {
      if (d?.type !== 'rotate' || m.kind !== 'angle')
        return fail('Click the centre to rotate about, then type an angle.');
      const { ids, center } = d;
      s.commitFromBase((base) => rotateItems(base, ids, center, m.deg));
      s.endBatch();
      s.setDraft(null);
      return true;
    }
  }
  return false;
}

/** Esc: cancel the current step. Returns false when there was nothing to cancel. */
export function cancel(store: Store): boolean {
  const s = store.getState();
  if (s.measureText) {
    s.setMeasureText('');
    return true;
  }
  if (s.axisLock) {
    s.setAxisLock(null);
    return true;
  }
  const d = s.draft;
  if (!d) return false;
  if (['move', 'rotate', 'mirror', 'stretch', 'scale'].includes(d.type)) s.cancelBatch();
  if (d.type === 'brush') s.endBatch();
  s.setDraft(null);
  return true;
}

/** Arrow keys while drawing lock to the red (x) or green (y) axis; pressing again unlocks. */
export function toggleAxisLock(store: Store, axis: 'x' | 'y'): boolean {
  const s = store.getState();
  if (!anchorOf(s)) return false;
  s.setAxisLock(s.axisLock === axis ? null : axis);
  return true;
}

/** What the Measurements box shows: its label and the live value. */
export function measureReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  const len = (v: Point) => formatLength(Math.hypot(v.x, v.y) * MM_PER_UNIT, s.units);
  switch (s.tool) {
    case 'line':
      return { label: 'Length', value: d?.type === 'line' ? len(sub({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 })) : '' };
    case 'wall':
      return { label: 'Length', value: d?.type === 'wall' ? len(sub({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 })) : '' };
    case 'rectangle':
      return {
        label: 'Dimensions',
        value:
          d?.type === 'rectangle'
            ? `${formatLength(Math.abs(d.x2 - d.x1) * MM_PER_UNIT, s.units)}, ${formatLength(Math.abs(d.y2 - d.y1) * MM_PER_UNIT, s.units)}`
            : '',
      };
    case 'tape':
      return { label: 'Distance', value: d?.type === 'tape' ? len(sub(d.b, d.a)) : '' };
    case 'move':
      return { label: 'Distance', value: d?.type === 'move' ? len(sub(d.to, d.base)) : '' };
    case 'rotate':
      return { label: 'Angle', value: d?.type === 'rotate' ? `${Math.round(d.angle)}°` : '' };
    default:
      return STRUCTURE_TOOLS.includes(s.tool) ? structureReadout(s) : modifyReadout(s);
  }
}

/** One line telling the user what the active tool wants next. */
export function toolHint(s: PlannerState): string {
  const d = s.draft;
  switch (s.tool) {
    case 'select':
      return 'Click to select, drag to move. Right-click for more. Space selects from any tool.';
    case 'pan':
      return 'Drag to move around. Middle-drag pans with any tool.';
    case 'zoom':
      return 'Drag up to zoom in, down to zoom out. Shift+Z fits the plan.';
    case 'orbit':
      return 'Drag to turn around the building; hold Shift to pan. Scroll zooms. Middle-drag orbits with any tool.';
    case 'line':
      return d?.type === 'line'
        ? 'Click the next point (or type a length). Lines chain until Esc; select them and use "Turn into walls" to build.'
        : 'Draw layout lines to plan with: click to chain, drag for one line. They snap like walls.';
    case 'wall':
      return d?.type === 'wall'
        ? 'Click the next corner or type a length and press Enter. Arrow keys lock an axis; Esc stops.'
        : 'Click to start a wall (or drag to draw one). Walls snap to ends, midpoints and the grid.';
    case 'rectangle':
      return d?.type === 'rectangle'
        ? `Click the opposite corner, or type width, depth (e.g. 12',10') and press Enter.`
        : 'Click the first corner. Four walls and the room inside are made in one go.';
    case 'room':
      return 'Click inside walls to make a room and see its area.';
    case 'door':
      return 'Click on a wall to place a door.';
    case 'window':
      return 'Click on a wall to place a window.';
    case 'furniture':
      return 'Choose an item on the right, then click on the plan to place it at its real size.';
    case 'move':
      if (d?.type === 'move')
        return d.copy
          ? 'Copying: click where the copy goes, or type a distance. Then type 3x or /3 for more copies.'
          : 'Click where it goes, or type a distance. Press Ctrl to make a copy instead.';
      return s.lastCopy
        ? 'Type 3x for three copies in a row, or /3 to spread them across the distance.'
        : 'Click a point on the item to move from (or select it first). Hold Ctrl to copy.';
    case 'rotate':
      if (d?.type === 'rotate')
        return d.start
          ? 'Click to set the angle (it snaps to 15°; hold Shift for any angle), or type one.'
          : 'Click to set the start direction, or type an angle such as 90 and press Enter.';
      return 'Click the item to rotate (it turns about the point you click), or select it first.';
    case 'tape':
      return d?.type === 'tape' && !d.done
        ? 'Click the second point. The distance shows in the Measurements box.'
        : 'Click two points to measure between them.';
    case 'paint':
      return 'Click a wall, room or item to give it the chosen material.';
    case 'brush':
      return 'Drag over items to paint them with the chosen material.';
    case 'mask':
      return 'Click to add points. Double-click or press Enter to finish, Esc to cancel.';
    case 'erase':
      return 'Click an item to remove it, or drag across several (Esc cancels). Shift+click a wall to erase just the piece between crossing walls.';
    default:
      return STRUCTURE_TOOLS.includes(s.tool) ? structureHint(s) : modifyHint(s);
  }
}
