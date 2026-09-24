import { elementCenter, findElementNear, placeOnWall, rotateElement, translateElement } from '../geometry';
import { axisDirection, infer, type Inference } from '../lib/inference';
import { newId } from '../lib/ids';
import { parseMeasure, type MeasureKind } from '../lib/measure';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { PlanElement, Point, Tool, Wall } from '../types';
import { wallsOf } from '../walls';

/** The bits of a zustand store the controller needs. */
export interface Store {
  getState: () => PlannerState;
}

/** Tools that take clicks on the plan and a typed value in the Measurements box. */
export const MEASURE_TOOLS: Partial<Record<Tool, MeasureKind>> = {
  wall: 'length',
  rectangle: 'pair',
  tape: 'length',
  move: 'move',
  rotate: 'angle',
};

/** Rotation snaps to this many degrees unless Shift is held. */
const ANGLE_STEP = 15;
/** Screen pixels a press must travel to count as a drag instead of a click. */
export const DRAG_PX = 5;

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const degrees = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/** Snap a point for the active tool, drawing from `from` when there is one. */
export function inferAt(s: PlannerState, raw: Point, from: Point | null, ignoreId?: string): Inference {
  const lock = from ? (s.axisLock ? axisDirection(s.axisLock) : s.shiftLock) : null;
  return infer(raw, {
    walls: wallsOf(s.doc.elements),
    tolerance: 10 / s.view.zoom,
    from,
    grid: s.grid.snap ? s.gridPx : null,
    lock,
    ignoreId,
  });
}

/** Where the active step is drawing from, for snapping and locks. */
export function anchorOf(s: PlannerState): Point | null {
  const d = s.draft;
  if (!d) return null;
  switch (d.type) {
    case 'wall':
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
  if (d.type === 'wall' || d.type === 'rectangle') return sub({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 });
  if (d.type === 'tape') return sub(d.b, d.a);
  if (d.type === 'move') return sub(d.to, d.base);
  return null;
}

/** The thing Move or Rotate works on: the selection, or whatever is under the click. */
function targetFor(s: PlannerState, raw: Point, allowOpenings: boolean): PlanElement | null {
  const selected = s.doc.elements.find((el) => el.id === s.selectedId);
  const hit = findElementNear(s.visibleElements(), raw, s.hitTolerance());
  const el = hit ?? selected ?? null;
  if (!el) return null;
  if (!allowOpenings && (el.type === 'door' || el.type === 'window')) return null;
  return el;
}

/** Pointer moved over the plan: update the snap marker and the rubber band. */
export function hover(store: Store, raw: Point, shift = false) {
  const s = store.getState();
  const d = s.draft;
  if (!(s.tool in MEASURE_TOOLS)) return;
  const from = anchorOf(s);
  const ignoreId = d?.type === 'move' ? d.orig.id : undefined;
  const inf = inferAt(s, raw, from, ignoreId);
  s.setInference(inf);
  const p = inf.point;
  if (!d) return;

  switch (d.type) {
    case 'wall':
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
      s.updateElement(rotateElement(d.orig, d.center, angle));
      s.setDraft({ ...d, angle });
      break;
    }
  }
}

/** Show the element being moved (or its copy) at `to`. */
function moveTo(store: Store, to: Point, raw: Point) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  const { orig } = d;
  if (orig.type === 'door' || orig.type === 'window') {
    // Doors and windows slide along their wall.
    const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === orig.wallId);
    if (wall) s.updateElement({ ...orig, ...placeOnWall(wall, raw, orig.width) });
    s.setDraft({ ...d, to: raw });
    return;
  }
  const moved = translateElement(orig, to.x - d.base.x, to.y - d.base.y);
  const copyId = d.copy ? copyIdOf(s, orig) : null;
  if (copyId) s.updateElement({ ...moved, id: copyId });
  else s.updateElement(moved);
  s.setDraft({ ...d, to });
}

/** Id of the live copy made while Ctrl-moving, stored on the draft's orig as a suffix. */
const COPY_SUFFIX = '~copy';
function copyIdOf(s: PlannerState, orig: PlanElement): string | null {
  const id = orig.id + COPY_SUFFIX;
  return s.doc.elements.some((el) => el.id === id) ? id : null;
}

/** Switch copy mode on or off while moving (Ctrl), like SketchUp. */
export function toggleCopy(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move' || d.orig.type === 'door' || d.orig.type === 'window') return;
  const dx = d.to.x - d.base.x;
  const dy = d.to.y - d.base.y;
  const copyId = d.orig.id + COPY_SUFFIX;
  if (!d.copy) {
    s.updateElement(d.orig);
    s.addElements([translateElement({ ...d.orig, id: copyId }, dx, dy)]);
  } else {
    s.commit((doc) => ({ ...doc, elements: doc.elements.filter((el) => el.id !== copyId) }));
    s.updateElement(translateElement(d.orig, dx, dy));
  }
  s.setDraft({ ...d, copy: !d.copy });
}

/** Finish a move: keep the moved item, or give the copy a real id. */
function finishMove(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  const dx = d.to.x - d.base.x;
  const dy = d.to.y - d.base.y;
  let selected = d.orig.id;
  let lastCopy: PlannerState['lastCopy'] = null;
  if (d.copy) {
    const tempId = d.orig.id + COPY_SUFFIX;
    const id = newId();
    s.commit((doc) => ({ ...doc, elements: doc.elements.map((el) => (el.id === tempId ? { ...el, id } : el)) }));
    selected = id;
    lastCopy = { orig: d.orig, dx, dy, ids: [id] };
  }
  s.endBatch();
  s.setDraft(null);
  s.select(selected);
  s.setLastCopy(lastCopy);
}

/** Pointer pressed on the plan with a measuring tool. Returns true if the tool used it. */
export function press(store: Store, raw: Point, opts: { ctrl?: boolean } = {}): boolean {
  const s = store.getState();
  const d = s.draft;
  const from = anchorOf(s);
  const inf = inferAt(s, raw, from, d?.type === 'move' ? d.orig.id : undefined);
  const p = inf.point;
  const tol = 10 / s.view.zoom;

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
      const el = targetFor(s, raw, true);
      if (!el) {
        s.setWarning('Select a wall or item first, or click on one, then click where to move it.');
        return true;
      }
      s.setWarning(null);
      s.select(el.id);
      s.setLastCopy(null);
      s.beginBatch();
      s.setDraft({ type: 'move', orig: el, base: p, to: p, copy: false });
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
      const el = targetFor(s, raw, false);
      if (!el) {
        s.setWarning('Select a wall or item first, or click on one, to rotate it.');
        return true;
      }
      s.setWarning(null);
      s.select(el.id);
      s.beginBatch();
      // Furniture turns about its own centre unless the click snapped to a wall point.
      const onWall = inf.kind === 'endpoint' || inf.kind === 'midpoint' || inf.kind === 'on-wall';
      const center = el.type === 'furniture' && !onWall ? elementCenter(el) : p;
      s.setDraft({ type: 'rotate', orig: el, center, angle: 0 });
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

/**
 * Pointer released. A wall drawn by dragging is finished here; a press without dragging starts
 * click-by-click drawing instead, where each click adds a wall.
 */
export function release(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
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
    };
    return fail(hints[kind]);
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
    case 'wall': {
      if (d?.type !== 'wall' || m.kind !== 'length') return fail('Click where the wall starts, then type its length.');
      const end = along({ x: d.x1, y: d.y1 }, lockDir ?? currentDirection(s), m.mm);
      if (!d.chain) s.setDraft({ ...d, chain: true });
      finishWallAt(store, end, 10 / s.view.zoom);
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
        const { orig, dx, dy, ids } = s.lastCopy;
        const step = m.spread ? { x: dx / m.n, y: dy / m.n } : { x: dx, y: dy };
        const copies = Array.from({ length: m.n }, (_, i) =>
          translateElement({ ...orig, id: newId() }, step.x * (i + 1), step.y * (i + 1)),
        );
        s.beginBatch();
        s.commit((doc) => ({ ...doc, elements: doc.elements.filter((el) => !ids.includes(el.id)) }));
        s.addElements(copies);
        s.endBatch();
        s.setLastCopy({ orig, dx, dy, ids: copies.map((c) => c.id) });
        s.select(copies[copies.length - 1].id);
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
      s.updateElement(rotateElement(d.orig, d.center, m.deg));
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
  if (d.type === 'move' || d.type === 'rotate') s.cancelBatch();
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
      return { label: '', value: '' };
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
      return 'Click an item to remove it. Click inside a room to remove the room.';
  }
}
