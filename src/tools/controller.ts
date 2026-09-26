import { findElementNear, placeOnWall } from '../geometry';
import { axisDirection, infer, type Inference, type Segment } from '../lib/inference';
import { buildingGuide } from '../lib/site';
import { parseMeasure, type MeasureKind } from '../lib/measure';
import {
  boundsCentre,
  copyItems,
  deleteItems,
  moveItems,
  raiseItems,
  rotateItems,
  selectionBounds,
} from '../lib/selection';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import { levelBaseM, M_PER_UNIT } from '../three/model';
import { getPicker, getPointer } from '../three/picker';
import type { Id, PlanDoc, Plot, Point, SketchLine, Tool, Wall } from '../types';
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
import { SHAPE_TOOLS, shapeHint, shapeHover, shapeMeasure, shapePress, shapeReadout, shapeRelease } from './shapeTools';

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
  shape: 'pair',
  pushpull: 'length',
};

/** Rotation snaps to this many degrees unless Shift is held. */
const ANGLE_STEP = 15;
/** Screen pixels a press must travel to count as a drag instead of a click. */
export const DRAG_PX = 5;

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const same = (a: Point, b: Point, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;
const degrees = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

/**
 * The building line of each plot, set in so what the tool draws touches it from inside: by half a
 * wall for walls, by half the column for columns; outlines (rooms, slabs, lines) go on the line.
 */
function buildingGuides(s: PlannerState): Segment[] {
  const plots = s.doc.elements.filter((el): el is Plot => el.type === 'plot' && !el.hidden);
  if (!plots.length) return [];
  let half: ((dir: Point) => number) | null = null;
  if (s.tool === 'wall' || s.tool === 'rectangle') {
    const t = s.wallThicknessMm / MM_PER_UNIT / 2;
    half = () => t;
  } else if (s.tool === 'column') {
    const { columnShape, columnW, columnH } = s.structure;
    half = (d) => (columnShape === 'round' ? columnW / 2 : (Math.abs(d.y) * columnW + Math.abs(d.x) * columnH) / 2);
  } else if (s.tool === 'line' || s.tool === 'room' || s.tool === 'slab' || s.tool === 'tape') half = () => 0;
  if (!half) return [];
  const edge = half;
  return plots.flatMap((plot) => {
    const pts = buildingGuide(plot, edge);
    return pts.map((a, i) => {
      const b = pts[(i + 1) % pts.length];
      return { id: `building-${plot.id}-${i}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    });
  });
}

/** The next Move makes a copy (the Copy alias, CO). */
let copyNext = false;
export const armCopyNext = (on: boolean) => {
  copyNext = on;
};
function takeCopyNext() {
  const on = copyNext;
  copyNext = false;
  return on;
}

/** Snap a point for the active tool, drawing from `from` when there is one. */
export function inferAt(s: PlannerState, raw: Point, from: Point | null, ignoreIds?: Set<Id>): Inference {
  const lock = from ? (s.axisLock === 'x' || s.axisLock === 'y' ? axisDirection(s.axisLock) : s.shiftLock) : null;
  // While Stretch, Scale, Rotate or Mirror shows its result, snap to the plan as it was before (as
  // AutoCAD does), not to the moving preview.
  const shown = s.visibleElements();
  const previewing = !!s.batchBase && ['stretch', 'scale', 'rotate', 'mirror'].includes(s.draft?.type ?? '');
  const ids = previewing ? new Set(shown.map((el) => el.id)) : null;
  const elements = previewing && ids ? s.batchBase!.elements.filter((el) => ids.has(el.id)) : shown;
  return infer(raw, {
    walls: wallsOf(elements),
    lines: elements.filter((el): el is SketchLine => el.type === 'line'),
    guides: buildingGuides(s),
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
    case 'shape':
      return d.surface.on === 'floor' ? d.points[d.points.length - 1] : null;
    default:
      return null;
  }
}

/** Direction of the rubber band being drawn, for Shift lock and typed lengths. */
export function currentDirection(s: PlannerState): Point | null {
  const d = s.draft;
  if (!d) return null;
  if (d.type === 'wall' || d.type === 'line' || d.type === 'rectangle')
    return sub({ x: d.x2, y: d.y2 }, { x: d.x1, y: d.y1 });
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
  // The selection stays as it is (as in AutoCAD); the item under the click counts only when nothing is selected.
  if (hit && !s.selectedIds.length) s.select(hit.id);
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
export function hover(store: Store, raw: Point, shift = false, screenY?: number) {
  const s = store.getState();
  const d = s.draft;
  if (!(s.tool in MEASURE_TOOLS)) return;
  if (s.tool === 'pushpull') {
    s.setInference(null);
    return shapeHover(store, null);
  }
  const from = anchorOf(s);
  const inf = inferAt(s, raw, from, movingIds(s));
  s.setInference(inf);
  if (MODIFY_TOOLS.includes(s.tool)) return modifyHover(store, raw, inf, shift);
  if (STRUCTURE_TOOLS.includes(s.tool)) return structureHover(store, inf);
  if (SHAPE_TOOLS.includes(s.tool)) return shapeHover(store, inf);
  const p = inf.point;
  if (!d) return;

  switch (d.type) {
    case 'wall':
    case 'line':
    case 'rectangle':
      s.setDraft({ ...d, x2: p.x, y2: p.y });
      break;
    case 'tape':
      if (d.done) break;
      if (s.axisLock === 'z') s.setDraft({ ...d, b: d.a, zb: tapeRise(s, d) });
      else s.setDraft({ ...d, b: p, zb: pointerHeightMm(s) });
      break;
    case 'move':
      moveTo(store, p, raw, screenY);
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

/**
 * Show the items being moved (or their copies) at `to`, starting again from the plan before the
 * move. Locked to the blue axis, the pointer's height on screen (screenY) raises them instead.
 */
function moveTo(store: Store, to: Point, raw: Point, screenY?: number) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move') return;
  const next = { ...d, screenY: screenY ?? d.screenY };
  if (s.axisLock === 'z') {
    // Up the screen is up; a pixel is about as tall as it is wide where the items are.
    if (screenY !== undefined && !d.zFrom) next.zFrom = { y: screenY, dz: d.dz ?? 0 };
    else if (screenY !== undefined && d.zFrom)
      next.dz = snapHeight(s, d.zFrom.dz + (d.zFrom.y - screenY) * s.pxUnits() * MM_PER_UNIT);
  } else {
    // A door or window on its own follows the pointer along its wall.
    next.to = loneOpening(s, d) ? raw : to;
  }
  s.setDraft(next);
  showMove(store, next);
}

type MoveDraft = Extract<PlannerState['draft'], { type: 'move' }>;

/** The door or window being moved on its own, as it was before the move. */
function loneOpening(s: PlannerState, d: MoveDraft) {
  const only = d.ids.length === 1 ? s.batchBase?.elements.find((el) => el.id === d.ids[0]) : undefined;
  return only?.type === 'door' || only?.type === 'window' ? only : undefined;
}

/** Heights step by an inch (or 10 mm) as the pointer moves. */
/** Height (mm above the floor being drawn) of the item face under the pointer in 3D; 0 on the floor. */
function pointerHeightMm(s: PlannerState): number {
  const picker = getPicker();
  if (!picker?.is3d) return 0;
  const { x, y } = getPointer();
  const hit = picker.faceAt(x, y);
  if (!hit) return 0;
  const mm = (hit.point[1] - levelBaseM(s.doc, s.activeLevel, s.wallHeightMm)) * 1000;
  return mm > 50 ? Math.round(mm) : 0;
}

type TapeDraft = Extract<PlannerState['draft'], { type: 'tape' }>;

/** Locked to the blue axis: the height the pointer points at, straight above (or below) the tape's start. */
function tapeRise(s: PlannerState, d: TapeDraft): number {
  const picker = getPicker();
  const za = d.za ?? 0;
  if (!picker?.is3d) return d.zb ?? za;
  const base = levelBaseM(s.doc, s.activeLevel, s.wallHeightMm);
  const { x, y } = getPointer();
  const t = picker.alongLine(x, y, [d.a.x * M_PER_UNIT, base + za / 1000, d.a.y * M_PER_UNIT], [0, 1, 0]);
  return t === null ? (d.zb ?? za) : snapHeight(s, za + t * 1000);
}

function snapHeight(s: PlannerState, mm: number): number {
  const step = s.units === 'imperial' ? 25.4 : 10;
  return Math.round(mm / step) * step;
}

/** The plan with the move so far applied: across by base→to, and up by dz. */
function movedPlan(d: MoveDraft) {
  const dx = d.to.x - d.base.x;
  const dy = d.to.y - d.base.y;
  const dz = d.dz ?? 0;
  const { ids, copy } = d;
  return (base: PlanDoc): { doc: PlanDoc; ids: Id[] } => {
    if (copy) {
      const out = copyItems(base, ids, dx, dy);
      return { doc: raiseItems(out.doc, out.ids, dz), ids: out.ids };
    }
    return { doc: raiseItems(moveItems(base, ids, dx, dy), ids, dz), ids };
  };
}

function showMove(store: Store, d: MoveDraft) {
  const s = store.getState();
  const only = loneOpening(s, d);
  if (only) {
    // It slides along its wall (once the pointer has moved), and a window's sill goes up and down.
    const slid = d.to.x !== d.base.x || d.to.y !== d.base.y;
    s.commitFromBase((base) => {
      const wall = base.elements.find((el): el is Wall => el.type === 'wall' && el.id === only.wallId);
      const at = wall && slid ? placeOnWall(wall, d.to, only.width) : {};
      const elements = base.elements.map((el) => (el.id === only.id ? { ...el, ...at } : el));
      return raiseItems({ ...base, elements }, [only.id], d.dz ?? 0);
    });
    return;
  }
  const plan = movedPlan(d);
  s.commitFromBase((base) => plan(base).doc);
}

/**
 * Arrow up or down while moving in 3D: lock to the blue axis, so moving the pointer up and down the
 * screen raises and lowers the items (or type a height). Pressing again goes back to moving across.
 */
export function toggleHeightLock(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'tape' && !d.done && s.view3d) {
    // The tape measures straight up (or down) from its first point.
    s.setAxisLock(s.axisLock === 'z' ? null : 'z');
    return true;
  }
  if (d?.type !== 'move' || !s.view3d) return false;
  if (s.axisLock === 'z') {
    s.setAxisLock(null);
    return true;
  }
  s.setAxisLock('z');
  // Measured from where the pointer is now (or, if it hasn't moved yet, from where it next is).
  s.setDraft({ ...d, zFrom: d.screenY === undefined ? undefined : { y: d.screenY, dz: d.dz ?? 0 } });
  return true;
}

/** Switch copy mode on or off while moving (Ctrl), like SketchUp. */
export function toggleCopy(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'move' || d.pasted) return;
  if (
    d.ids.every((id) =>
      s.batchBase?.elements.find((el) => el.id === id && (el.type === 'door' || el.type === 'window')),
    )
  )
    return;
  const next = { ...d, copy: !d.copy };
  s.setDraft(next);
  showMove(store, next);
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
  if (d.copy && (dx || dy || d.dz)) {
    const { ids } = d;
    const plan = movedPlan(d);
    let copyIds: Id[] = [];
    s.commitFromBase((base) => {
      const out = plan(base);
      copyIds = out.ids;
      return out.doc;
    });
    // Rows of copies (3x, /3) repeat the move across the plan.
    lastCopy = { ids, dx, dy, copyIds };
    selection = copyIds;
  }
  if (s.axisLock === 'z') s.setAxisLock(null);
  const steps = store.getState().past.length;
  s.endBatch();
  // A paste and where it was put down are one step to undo.
  if (d.pasted && store.getState().past.length > steps) s.mergeLastSteps();
  s.setDraft(null);
  s.setSelection(selection);
  s.setLastCopy(lastCopy);
}

/** Pointer pressed on the plan with a measuring tool. Returns true if the tool used it. */
export function press(store: Store, raw: Point, opts: { ctrl?: boolean; clicks?: number } = {}): boolean {
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
  if (SHAPE_TOOLS.includes(s.tool)) {
    shapePress(store, inf, opts.clicks);
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
      if (d?.type !== 'tape' || d.done) {
        const za = pointerHeightMm(s);
        s.setDraft({ type: 'tape', a: p, b: p, za, zb: za });
      } else {
        if (s.axisLock === 'z') s.setDraft({ ...d, b: d.a, zb: tapeRise(s, d), done: true });
        else s.setDraft({ ...d, b: p, zb: pointerHeightMm(s), done: true });
        if (s.axisLock === 'z') s.setAxisLock(null);
      }
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
      if (!!opts.ctrl !== takeCopyNext()) toggleCopy(store);
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
  if (SHAPE_TOOLS.includes(s.tool)) return shapeRelease(store, dragged);
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
  if (m.kind === 'length' && m.mm === 0 && s.tool !== 'fillet') return fail('Type a length above zero.');
  if (MODIFY_TOOLS.includes(s.tool) || STRUCTURE_TOOLS.includes(s.tool) || SHAPE_TOOLS.includes(s.tool)) {
    const error = MODIFY_TOOLS.includes(s.tool)
      ? modifyMeasure(store, m)
      : SHAPE_TOOLS.includes(s.tool)
        ? shapeMeasure(store, m)
        : structureMeasure(store, m);
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
  const lockDir = s.axisLock === 'x' || s.axisLock === 'y' ? axisDirection(s.axisLock) : s.shiftLock;
  // A typed length goes along the rubber band; @x,y and len<angle give the point itself (y up, as in AutoCAD).
  const endFrom = (from: Point) =>
    m.kind === 'vector'
      ? { x: from.x + units(m.dx), y: from.y - units(m.dy) }
      : m.kind === 'length'
        ? along(from, lockDir ?? currentDirection(s), m.mm)
        : null;

  s.setWarning(null);
  switch (s.tool) {
    case 'line': {
      const end = d?.type === 'line' ? endFrom({ x: d.x1, y: d.y1 }) : null;
      if (d?.type !== 'line' || !end)
        return fail(`Click where the line starts, then type its length (or @x,y, or length<angle).`);
      finishLineAt(store, end);
      return true;
    }
    case 'wall': {
      const end = d?.type === 'wall' ? endFrom({ x: d.x1, y: d.y1 }) : null;
      if (d?.type !== 'wall' || !end)
        return fail(`Click where the wall starts, then type its length (or @x,y, or length<angle).`);
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
      if (d?.type !== 'move' || (m.kind !== 'length' && m.kind !== 'vector'))
        return fail('Click the point to move from, then type a distance (or @x,y, or length<angle).');
      if (s.axisLock === 'z' && m.kind === 'length') {
        // A typed height goes the way the pointer went: up, unless it went down.
        const next = { ...d, dz: (d.dz ?? 0) < 0 ? -m.mm : m.mm };
        s.setDraft(next);
        showMove(store, next);
        finishMove(store);
        return true;
      }
      const to = endFrom(d.base)!;
      moveTo(store, to, to);
      finishMove(store);
      return true;
    }
    case 'rotate': {
      if (d?.type !== 'rotate' || m.kind !== 'angle')
        return fail('Click the centre to rotate about, then type an angle.');
      const { ids, center } = d;
      // A positive angle turns counter-clockwise, as in AutoCAD and SketchUp (the plan's y points down).
      s.commitFromBase((base) => rotateItems(base, ids, center, -m.deg));
      s.endBatch();
      s.setDraft(null);
      return true;
    }
  }
  return false;
}

/**
 * Paste, AutoCAD style: the copies hang on the pointer by their bottom-left corner (snapping like
 * Move) until a click puts them down; Esc takes the paste back.
 */
export function pasteToPlace(store: Store) {
  let s = store.getState();
  if (!s.clipboard) return;
  if (s.draft) cancel(store);
  s.setTool('move');
  s = store.getState();
  s.paste();
  s = store.getState();
  const ids = s.selectedIds;
  const box = selectionBounds(s.doc, ids);
  if (!ids.length || !box) return;
  const base = { x: box.minX, y: box.maxY };
  s.beginBatch();
  s.setDraft({ type: 'move', ids, base, to: base, copy: false, pasted: true });
  s.setWarning(null);
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
  if (['move', 'rotate', 'mirror', 'stretch', 'scale', 'push'].includes(d.type)) s.cancelBatch();
  // Esc while placing a paste takes the paste back too.
  if (d.type === 'move' && d.pasted) s.discardLastStep();
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

/** The tape's length; in 3D, the straight distance between its ends and how much higher one is. */
export function tapeText(s: PlannerState, d: TapeDraft): string {
  const flat = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) * MM_PER_UNIT;
  const rise = (d.zb ?? 0) - (d.za ?? 0);
  if (Math.abs(rise) < 1) return formatLength(flat, s.units);
  const text = formatLength(Math.hypot(flat, rise), s.units);
  return `${text} (height ${rise > 0 ? '+' : '−'}${formatLength(Math.abs(rise), s.units)})`;
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
      return { label: 'Distance', value: d?.type === 'tape' ? tapeText(s, d) : '' };
    case 'move':
      if (d?.type === 'move' && s.axisLock === 'z') return { label: 'Height', value: formatLength(d.dz ?? 0, s.units) };
      return { label: 'Distance', value: d?.type === 'move' ? len(sub(d.to, d.base)) : '' };
    case 'rotate':
      // Counter-clockwise positive, as typed.
      return { label: 'Angle', value: d?.type === 'rotate' ? `${Math.round(-d.angle) || 0}°` : '' };
    default:
      if (SHAPE_TOOLS.includes(s.tool)) return shapeReadout(s);
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
      if (d?.type === 'move' && s.axisLock === 'z')
        return 'Move the pointer up or down to raise or lower, or type a height. Arrow up/down again to move across.';
      if (d?.type === 'move' && d.pasted)
        return 'Pasted: click where it goes (it hangs by its bottom-left corner and snaps), or type a distance. Esc takes the paste back.';
      if (d?.type === 'move')
        return d.copy
          ? 'Copying: click where the copy goes, or type a distance. Then type 3x or /3 for more copies.'
          : s.view3d
            ? 'Click where it goes, or type a distance. Arrow up/down moves it up and down; Ctrl copies.'
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
        ? s.view3d
          ? 'Click the second point (on the floor or on an item). Up arrow measures straight up. The distance shows in the Measurements box.'
          : 'Click the second point. The distance shows in the Measurements box.'
        : 'Click two points to measure between them.';
    case 'paint':
      return s.view3d
        ? 'Click a wall, room or item to give it the chosen material. On a wall, only the side (or top) you click is painted.'
        : 'Click a wall, room or item to give it the chosen material.';
    case 'brush':
      return 'Drag over items to paint them with the chosen material.';
    case 'mask':
      return 'Click to add points. Double-click or press Enter to finish, Esc to cancel.';
    case 'erase':
      return 'Click an item to remove it, or drag across several (Esc cancels). Shift+click a wall to erase just the piece between crossing walls.';
    default:
      if (SHAPE_TOOLS.includes(s.tool)) return shapeHint(s);
      return STRUCTURE_TOOLS.includes(s.tool) ? structureHint(s) : modifyHint(s);
  }
}
