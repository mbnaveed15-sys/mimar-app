import { snapsOn } from '../lib/checks';
import { finishStep } from '../tools/finish';
import { useRef, type MouseEvent, type PointerEvent } from 'react';
import {
  findElementNear,
  isNear,
  nearestWall,
  pointInPolygon,
  pointToSegmentDistance,
  snap,
  toFurnitureLocal,
  translateElement,
} from '../geometry';
import { trimAt } from '../lib/modify';
import { bowThrough } from '../lib/arc';
import { bendEdge, bendHoleEdge } from '../lib/curvedEdges';
import { outlineProblem, outlinePoints, sideLine, withSideBow } from '../lib/plot';
import { faceOf } from '../lib/pushPull';
import { itemsInBox, moveItems } from '../lib/selection';
import { dragDimension } from '../lib/dimensions';
import { dragSide, isSideGrip } from '../lib/resize';
import { againstWall } from '../tools/furnitureTool';
import { panBy } from '../lib/view';
import { MM_PER_UNIT, plannerStore, type PlannerState } from '../store/plannerStore';
import { cornerSnap, DRAG_PX, hover, inferAt, MEASURE_TOOLS, press, release } from '../tools/controller';
import { slideOpening } from '../store/openingAt';
import { getPicker, setPointer } from '../three/picker';
import { setPlanPointer } from '../store/pointerStore';
import {
  hasPoints,
  type Beam,
  type Block,
  type Bounds,
  type Column,
  type Furniture,
  type Pad,
  type PlanElement,
  type Plot,
  type Point,
  type Roof,
  type SketchLine,
  type Slab,
  type Wall,
} from '../types';

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'zoom'; lastY: number; at: Point }
  /** The Zoom tool's window: the plan inside it fills the view when let go (a click zooms in). */
  | { kind: 'zoomBox'; start: Point; at: Point }
  | { kind: 'move'; start: Point; orig: PlanElement }
  /** Dragging several selected items (or a group) together. */
  | { kind: 'moveMany'; start: Point; ids: string[] }
  /** Pressed on empty space: becomes a selection box once the pointer moves. */
  /** `picked`: the press already selected an item (3D), so a click without a drag does nothing more. */
  | { kind: 'box'; start: Point; additive: boolean; client: Point; moved?: boolean; picked?: boolean }
  /** Eraser pressed: a click erases what is there when let go; a drag erases all it passes over. */
  | { kind: 'erase'; last: Point; click: () => void }
  | { kind: 'wall-start' | 'wall-end'; orig: Wall | SketchLine }
  /** Dragging a wall's (or layout line's) middle sideways to bend it into an arc (or back to straight). */
  | { kind: 'wall-bend'; orig: Wall | SketchLine }
  | { kind: 'resize' | 'rotate'; orig: Furniture }
  /** Dragging a side grip: that side moves, the opposite one stays. */
  | { kind: 'side'; orig: PlanElement; grip: string }
  /** Dragging a column's corner to resize it about its centre. */
  | { kind: 'column-size'; orig: Column }
  /** Dragging one end of a beam. */
  | { kind: 'beam-start' | 'beam-end'; orig: Beam }
  /** Dragging a corner of a slab, levelled area, block or roof outline. */
  | { kind: 'shape-corner'; orig: Slab | Pad | Block | Roof; index: number }
  /** Dragging a corner of a plot to reshape it. */
  | { kind: 'plot-corner'; plotId: string; index: number }
  | { kind: 'edge-bend'; orig: Slab | Pad; index: number }
  | { kind: 'void-bend'; orig: Slab; hole: number; index: number }
  | { kind: 'plot-bend'; orig: Plot; index: number };

/** Furniture sizes snap to 50 mm; rotation snaps to 15° unless Shift is held. */
const SIZE_STEP = 50 / MM_PER_UNIT;
const ROTATE_STEP = 15;

/** Keep getting this pointer's moves even off the canvas (it may already have lifted). */
function capture(e: PointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    // Only a convenience.
  }
}

/** Snap to the grid, when grid snapping is on. */
function gridSnap(raw: Point): Point {
  const s = plannerStore.getState();
  return s.grid.snap && snapsOn(s) ? snap(raw, s.gridPx) : raw;
}

/**
 * Snap a grip being dragged as drawing does: to any wall or item corner, end, middle or line nearby
 * (the item itself left out), else the grid. Shows the snap marker while it drags.
 */
function snapGrip(raw: Point, id: string, from: Point | null = null): Point {
  const s = plannerStore.getState();
  const inf = inferAt(s, raw, from, new Set([id]));
  s.setInference(inf.kind === 'free' || inf.kind === 'grid' ? null : inf);
  return inf.point;
}

/** Items dragged by one end, which snaps as a wall end does. */
const STRAIGHT_PIECES = new Set<string>(['wall', 'beam', 'line', 'section']);
/** Drags that only change the view or select: no undo step of their own. */
const VIEW_DRAGS = new Set<string>(['pan', 'zoom', 'zoomBox', 'box', 'erase']);

/** Snap a dragged item by its corners (see `cornerSnap`), else its anchor to the grid as before 1.43. */
function snapItemCorner(orig: PlanElement, dx: number, dy: number, raw: Point, moved: Point): Point {
  const s = plannerStore.getState();
  const found = cornerSnap(s, orig, dx, dy, raw);
  s.setInference(found?.inf ?? null);
  return found ? { x: moved.x + found.shift.x, y: moved.y + found.shift.y } : gridSnap(moved);
}

const boundsOf = (a: Point, b: Point): Bounds => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
});

/**
 * An item with the doors and windows in it; with `all`, every wall joined to it, end to end or
 * where one meets another, with theirs (SketchUp's triple-click).
 */
export function connectedTo(s: PlannerState, id: string, all: boolean): string[] {
  const items = s.pickableElements();
  const walls = items.filter((el): el is Wall => el.type === 'wall');
  const seen = new Set([id]);
  const queue = [id];
  const touches = (a: Wall, b: Wall) =>
    [
      { x: a.x1, y: a.y1 },
      { x: a.x2, y: a.y2 },
    ].some((p) => pointToSegmentDistance(p, { x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }) < 1) ||
    [
      { x: b.x1, y: b.y1 },
      { x: b.x2, y: b.y2 },
    ].some((p) => pointToSegmentDistance(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) < 1);
  for (let head = 0; all && head < queue.length; head++) {
    const w = walls.find((x) => x.id === queue[head]);
    if (!w) continue;
    for (const o of walls)
      if (!seen.has(o.id) && touches(w, o)) {
        seen.add(o.id);
        queue.push(o.id);
      }
  }
  for (const el of items) if ('wallId' in el && seen.has(el.wallId)) seen.add(el.id);
  return [...seen];
}

/** What was right-clicked: screen position and the item there, if any. */
export interface ContextTarget {
  x: number;
  y: number;
  id: string | null;
}

/**
 * Mouse, pen and (through useTouch) finger input on the plan: every tool, selection, moving and
 * handles. `toPlan` turns a screen position into a plan point, so the same input works on the 2D
 * plan and in the 3D view.
 */
/** Presses closer together than this (ms) count as a double or triple click. */
const MULTI_CLICK_MS = 500;

export function usePlanInput(
  toPlan: (e: { clientX: number; clientY: number }) => Point,
  onContextMenu?: (target: ContextTarget) => void,
  /** In 3D: the id of the item right under the pointer, found by looking along the view. */
  pickId?: (e: { clientX: number; clientY: number }) => string | null,
  /**
   * In 3D a selection box is a rectangle on the screen: `show` draws it (null hides it) and
   * `project` says where a plan point appears on screen.
   */
  screenBox?: { show: (box: Bounds | null) => void; project: (p: Point) => Point },
) {
  /** The item under the pointer: what 3D picking saw, or else whatever is near the plan point. */
  function hitAt(e: { clientX: number; clientY: number }, raw: Point): PlanElement | null {
    const s = plannerStore.getState();
    const id = pickId?.(e);
    const picked = id ? s.pickableElements().find((el) => el.id === id) : undefined;
    return picked ?? findElementNear(s.pickableElements(), raw, s.hitTolerance());
  }
  /** In 3D, the face of wall `id` under the pointer: a side (1 or -1), or 0 for its top or an end. */
  function wallFaceAt(s: PlannerState, e: { clientX: number; clientY: number }, id: string) {
    const wall = s.pickableElements().find((el) => el.id === id && el.type === 'wall');
    const hit = wall && getPicker()?.faceAt(e.clientX, e.clientY);
    if (!wall || !hit || hit.id !== id) return undefined;
    const face = faceOf(wall, hit.normal, hit.point);
    return face?.part === 'side' ? face.sign : 0;
  }
  /** Item or room under the pointer (3D can pick a floor straight away). */
  function idAt(e: { clientX: number; clientY: number }, raw: Point): string | null {
    const s = plannerStore.getState();
    const picked = pickId?.(e);
    if (
      picked &&
      (s.pickableElements().some((el) => el.id === picked) || s.pickableRooms().some((r) => r.id === picked))
    )
      return picked;
    return hitAt(e, raw)?.id ?? s.roomAt(raw)?.id ?? null;
  }

  const dragRef = useRef<Drag | null>(null);
  /** Where the current press started on screen, to tell a click from a drag. */
  const pressRef = useRef<{ x: number; y: number } | null>(null);
  /** The last left press, to count double and triple clicks (browsers report none on pointer-down). */
  const clickRef = useRef({ t: -Infinity, x: 0, y: 0, n: 0 });

  /** 1 for a single click, 2 for the second of a double-click, 3 for a triple. */
  function clickCount(e: PointerEvent<Element>) {
    const c = clickRef.current;
    const again = e.timeStamp - c.t < MULTI_CLICK_MS && Math.hypot(e.clientX - c.x, e.clientY - c.y) <= DRAG_PX;
    clickRef.current = { t: e.timeStamp, x: e.clientX, y: e.clientY, n: again ? c.n + 1 : 1 };
    return clickRef.current.n;
  }

  function startDrag(e: PointerEvent<Element>, drag: Drag) {
    capture(e);
    if (!VIEW_DRAGS.has(drag.kind)) plannerStore.getState().beginBatch();
    dragRef.current = drag;
  }

  function onPointerDown(e: PointerEvent<Element>) {
    const s = plannerStore.getState();
    setPointer(e.clientX, e.clientY);
    const raw = toPlan(e);
    pressRef.current = { x: e.clientX, y: e.clientY };
    if (s.lastResize) s.setLastResize(null);
    s.setSnapFlip(e.altKey);

    if (e.button === 1 || s.tool === 'pan') {
      e.preventDefault();
      startDrag(e, { kind: 'pan', lastX: e.clientX, lastY: e.clientY });
      return;
    }
    // A pen's eraser end (or eraser button) rubs out, whatever the tool.
    if (e.pointerType === 'pen' && e.button === 5) {
      s.eraseAt(raw);
      return;
    }
    if (e.button !== 0) return;
    const clicks = clickCount(e);
    if (s.tool === 'zoom') {
      const r = e.currentTarget.getBoundingClientRect();
      const at = { x: e.clientX - r.left, y: e.clientY - r.top };
      // Shift+drag zooms in and out by moving up and down; a plain drag draws a window to zoom to.
      if (e.shiftKey || screenBox) startDrag(e, { kind: 'zoom', lastY: e.clientY, at });
      else startDrag(e, { kind: 'zoomBox', start: raw, at });
      return;
    }

    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const selected = s.selectedIds.length === 1 ? s.doc.elements.find((el) => el.id === s.selectedId) : undefined;
    if (handle && selected && s.tool === 'select') {
      if (isSideGrip(handle)) {
        startDrag(e, { kind: 'side', orig: selected, grip: handle });
      } else if (
        (selected.type === 'wall' || selected.type === 'line') &&
        (handle === 'wall-start' || handle === 'wall-end' || handle === 'wall-bend')
      ) {
        startDrag(e, { kind: handle, orig: selected });
      } else if (selected.type === 'furniture' && (handle === 'resize' || handle === 'rotate')) {
        startDrag(e, { kind: handle, orig: selected });
      } else if (selected.type === 'column' && handle === 'column-size') {
        startDrag(e, { kind: 'column-size', orig: selected });
      } else if (selected.type === 'beam' && (handle === 'beam-start' || handle === 'beam-end')) {
        startDrag(e, { kind: handle, orig: selected });
      } else if (
        (selected.type === 'slab' ||
          selected.type === 'pad' ||
          selected.type === 'block' ||
          selected.type === 'roof') &&
        handle.startsWith('shape-corner-')
      ) {
        startDrag(e, { kind: 'shape-corner', orig: selected, index: Number(handle.slice('shape-corner-'.length)) });
      } else if (selected.type === 'plot' && handle.startsWith('plot-corner-')) {
        startDrag(e, { kind: 'plot-corner', plotId: selected.id, index: Number(handle.slice('plot-corner-'.length)) });
      } else if (selected.type === 'plot' && handle.startsWith('plot-bend-')) {
        startDrag(e, { kind: 'plot-bend', orig: selected, index: Number(handle.slice('plot-bend-'.length)) });
      } else if ((selected.type === 'slab' || selected.type === 'pad') && handle.startsWith('edge-bend-')) {
        startDrag(e, { kind: 'edge-bend', orig: selected, index: Number(handle.slice('edge-bend-'.length)) });
      } else if (selected.type === 'slab' && handle.startsWith('void-bend-')) {
        const [hole, index] = handle.slice('void-bend-'.length).split('-').map(Number);
        startDrag(e, { kind: 'void-bend', orig: selected, hole, index });
      }
      return;
    }

    if (s.tool in MEASURE_TOOLS) {
      capture(e);
      s.setMeasureText('');
      press(plannerStore, raw, { ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, clicks });
      return;
    }

    switch (s.tool) {
      case 'select': {
        const hit = hitAt(e, raw);
        if (!hit) {
          // Empty space (or inside a room): a click picks the room, a drag draws a selection box.
          startDrag(e, { kind: 'box', start: raw, additive: e.shiftKey, client: { x: e.clientX, y: e.clientY } });
          return;
        }
        if (screenBox) {
          // In 3D (as in SketchUp) a click selects and a drag always draws a box; Move (M) moves.
          // A double-click takes a wall with its doors and windows, a triple-click all it joins.
          if (clicks >= 2 && !e.shiftKey) s.setSelection(connectedTo(s, hit.id, clicks >= 3));
          else if (e.shiftKey) s.toggleSelect(hit.id);
          else s.select(hit.id);
          startDrag(e, {
            kind: 'box',
            start: raw,
            additive: e.shiftKey,
            client: { x: e.clientX, y: e.clientY },
            picked: true,
          });
          return;
        }
        if (e.shiftKey) {
          s.toggleSelect(hit.id);
          return;
        }
        if (!s.selectedIds.includes(hit.id)) s.select(hit.id);
        const ids = plannerStore.getState().selectedIds;
        if (ids.length > 1) startDrag(e, { kind: 'moveMany', start: raw, ids });
        else startDrag(e, { kind: 'move', start: raw, orig: hit });
        break;
      }
      case 'room':
        s.addRoomAt(raw);
        break;
      case 'paint':
        if (pickId) {
          const id = idAt(e, raw);
          if (id) s.applyMaterial(id, wallFaceAt(s, e, id));
        } else s.paintAt(raw);
        break;
      case 'brush':
        capture(e);
        s.beginBatch();
        s.brushAt(gridSnap(raw));
        s.setDraft({ type: 'brush' });
        break;
      case 'mask':
        s.addMaskPoint(gridSnap(raw));
        break;
      case 'erase': {
        // Shift+click erases just the piece of wall between the walls crossing it (like Trim).
        const wall = e.shiftKey ? nearestWall(s.pickableElements(), raw, s.hitTolerance() * 1.5) : null;
        // The item under the pointer, as Select would pick it: a door or window before its wall.
        const picked = wall ? null : pickId ? idAt(e, raw) : (hitAt(e, raw)?.id ?? null);
        const click = () => {
          if (wall) s.commit((doc) => trimAt(doc, wall.id, raw, 10 * s.pxUnits()));
          else if (picked) s.deleteElement(picked);
          else s.eraseAt(raw);
        };
        startDrag(e, { kind: 'erase', last: raw, click });
        break;
      }
    }
  }

  function onPointerMove(e: PointerEvent<Element>) {
    const s = plannerStore.getState();
    setPointer(e.clientX, e.clientY);
    const drag = dragRef.current;
    const raw = toPlan(e);
    setPlanPointer(raw);
    s.setSnapFlip(e.altKey);

    if (drag) {
      switch (drag.kind) {
        case 'pan':
          s.setView(panBy(s.view, e.clientX - drag.lastX, e.clientY - drag.lastY));
          drag.lastX = e.clientX;
          drag.lastY = e.clientY;
          break;
        case 'zoom':
          s.zoomBy(Math.exp((drag.lastY - e.clientY) * 0.01), drag.at);
          drag.lastY = e.clientY;
          break;
        case 'zoomBox': {
          const start = pressRef.current;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_PX && s.draft?.type !== 'zoomBox')
            break;
          s.setDraft({ type: 'zoomBox', x1: drag.start.x, y1: drag.start.y, x2: raw.x, y2: raw.y });
          break;
        }
        case 'erase': {
          const start = pressRef.current;
          const d = s.draft;
          if (d?.type !== 'erase' && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_PX) break;
          if (d && d.type !== 'erase') break; // Esc cancelled this drag
          // Everything near the path since the last move (in small steps, so fast drags miss nothing).
          const ids = new Set(d?.type === 'erase' ? d.ids : []);
          const tol = s.hitTolerance();
          const steps = Math.max(1, Math.ceil(Math.hypot(raw.x - drag.last.x, raw.y - drag.last.y) / (tol / 2)));
          const items = s.pickableElements();
          for (let i = 0; i <= steps; i++) {
            const p = {
              x: drag.last.x + ((raw.x - drag.last.x) * i) / steps,
              y: drag.last.y + ((raw.y - drag.last.y) * i) / steps,
            };
            // Over a door or window, that is what goes, not the wall it is in.
            const near = items.filter((el) => isNear(el, p, tol));
            const hosts = new Set(near.flatMap((el) => ('wallId' in el ? [el.wallId] : [])));
            for (const el of near) if (!hosts.has(el.id)) ids.add(el.id);
          }
          const picked = pickId?.(e);
          if (picked && items.some((el) => el.id === picked)) ids.add(picked);
          drag.last = raw;
          if (!d || ids.size !== d.ids.length) s.setDraft({ type: 'erase', ids: [...ids] });
          break;
        }
        case 'box': {
          const start = pressRef.current;
          if (!s.draft && !drag.moved && start && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= DRAG_PX)
            break;
          if (screenBox) {
            drag.moved = true;
            screenBox.show(boundsOf(drag.client, { x: e.clientX, y: e.clientY }));
            break;
          }
          const { x, y } = drag.start;
          s.setDraft({ type: 'marquee', x1: x, y1: y, x2: raw.x, y2: raw.y, additive: drag.additive });
          break;
        }
        case 'moveMany': {
          let dx = raw.x - drag.start.x;
          let dy = raw.y - drag.start.y;
          if (s.grid.snap && snapsOn(s)) {
            dx = Math.round(dx / s.gridPx) * s.gridPx;
            dy = Math.round(dy / s.gridPx) * s.gridPx;
          }
          const { ids } = drag;
          s.commitFromBase((base) => moveItems(base, ids, dx, dy));
          break;
        }
        case 'move': {
          const { orig } = drag;
          if (orig.type === 'door' || orig.type === 'window') {
            // Doors and windows slide along their wall.
            const slide = slideOpening(s, s.batchBase ?? s.doc, orig, raw);
            s.setInference(slide.snap ? { point: slide.opening, kind: slide.snap } : null);
            s.updateElement(slide.opening);
          } else if (orig.type === 'dimension') {
            // Dragging a dimension moves its line nearer or further; a radius slides round its curve.
            s.updateElement(dragDimension(s.doc, orig, raw.x - drag.start.x, raw.y - drag.start.y, raw));
          } else {
            const anchor =
              orig.type === 'wall' || orig.type === 'beam' || orig.type === 'line' || orig.type === 'section'
                ? { x: orig.x1, y: orig.y1 }
                : hasPoints(orig)
                  ? orig.points[0]
                  : { x: orig.x, y: orig.y };
            const moved = { x: anchor.x + raw.x - drag.start.x, y: anchor.y + raw.y - drag.start.y };
            // Furniture backs onto a wall it comes near (Alt places it freely).
            const walled = orig.type === 'furniture' && snapsOn(s) ? againstWall(s, orig, moved) : null;
            if (walled) {
              s.setInference(null);
              s.updateElement(walled);
              break;
            }
            const target = STRAIGHT_PIECES.has(orig.type)
              ? snapGrip(moved, orig.id)
              : snapItemCorner(orig, raw.x - drag.start.x, raw.y - drag.start.y, raw, moved);
            s.updateElement(translateElement(orig, target.x - anchor.x, target.y - anchor.y));
          }
          break;
        }
        case 'wall-start':
        case 'wall-end': {
          const o0 = drag.orig;
          const other = drag.kind === 'wall-start' ? { x: o0.x2, y: o0.y2 } : { x: o0.x1, y: o0.y1 };
          const p = snapGrip(raw, o0.id, other);
          const next =
            drag.kind === 'wall-start' ? { ...drag.orig, x1: p.x, y1: p.y } : { ...drag.orig, x2: p.x, y2: p.y };
          // A curved wall keeps its shape: its bow grows or shrinks with the distance between its ends.
          const o = drag.orig;
          const was = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
          if (o.bow && was) next.bow = (o.bow * Math.hypot(next.x2 - next.x1, next.y2 - next.y1)) / was;
          if (next.x1 !== next.x2 || next.y1 !== next.y2) s.updateElement(next);
          break;
        }
        case 'wall-bend': {
          // Close to the straight line (a few pixels), it snaps straight again.
          const bow = bowThrough(drag.orig, raw);
          const straight = Math.abs(bow) < 6 * s.pxUnits();
          const next: Wall | SketchLine = { ...drag.orig, bow };
          if (straight) delete next.bow;
          s.updateElement(next);
          break;
        }
        case 'edge-bend':
          // Like a wall's bend: within a few pixels of the straight edge, it snaps straight again.
          s.updateElement(bendEdge(drag.orig, drag.index, raw, 6 * s.pxUnits()));
          break;
        case 'void-bend':
          s.updateElement(bendHoleEdge(drag.orig, drag.hole, drag.index, raw, 6 * s.pxUnits()));
          break;
        case 'plot-bend': {
          // Like a wall's bend: within a few pixels of the straight side, it snaps straight again.
          const bow = bowThrough(sideLine(drag.orig, drag.index), raw);
          const next = withSideBow(drag.orig, drag.index, Math.abs(bow) < 6 * s.pxUnits() ? 0 : bow);
          if (outlineProblem(outlinePoints(next))) {
            s.setWarning('The sides of the plot would cross: that side can’t bend so far.');
          } else {
            if (s.warnings.length) s.setWarning(null);
            s.updateElement(next);
          }
          break;
        }
        case 'plot-corner': {
          // To the grid only: its own walls' ends sit half a wall inside the corner.
          const ok = s.movePlotCorner(drag.plotId, drag.index, gridSnap(raw));
          if (!ok) s.setWarning('The sides of the plot would cross: that corner can’t go there.');
          else if (s.warnings.length) s.setWarning(null);
          break;
        }
        case 'column-size': {
          const local = toFurnitureLocal(drag.orig, snapGrip(raw, drag.orig.id));
          const size = (v: number) => Math.max(SIZE_STEP, Math.round((2 * Math.abs(v)) / SIZE_STEP) * SIZE_STEP);
          s.updateElement({ ...drag.orig, w: size(local.x), h: size(local.y) });
          break;
        }
        case 'beam-start':
        case 'beam-end': {
          const o = drag.orig;
          const start = drag.kind === 'beam-start';
          const p = snapGrip(raw, o.id, start ? { x: o.x2, y: o.y2 } : { x: o.x1, y: o.y1 });
          const next = start ? { ...o, x1: p.x, y1: p.y } : { ...o, x2: p.x, y2: p.y };
          if (next.x1 !== next.x2 || next.y1 !== next.y2) s.updateElement(next);
          break;
        }
        case 'shape-corner': {
          const p = snapGrip(raw, drag.orig.id);
          const points = drag.orig.points.map((q, i) => (i === drag.index ? p : q));
          if (outlineProblem(points)) s.setWarning('The edges would cross: that corner can’t go there.');
          else {
            if (s.warnings.length) s.setWarning(null);
            s.updateElement({ ...drag.orig, points } as PlanElement);
          }
          break;
        }
        case 'side': {
          // To what is near; else a furniture item, column or stair goes in 50 mm steps.
          const p = snapGrip(raw, drag.orig.id);
          const snapped = !!plannerStore.getState().inference;
          const outline = drag.grip.startsWith('side-edge-');
          const round = (v: number) => Math.max(SIZE_STEP, Math.round(v / SIZE_STEP) * SIZE_STEP);
          const next = dragSide(
            drag.orig,
            drag.grip,
            snapped || outline ? p : raw,
            snapped || outline ? undefined : round,
          );
          if (next) s.updateElement(next);
          break;
        }
        case 'resize': {
          const local = toFurnitureLocal(drag.orig, raw);
          const size = (v: number) => Math.max(SIZE_STEP, Math.round((2 * Math.abs(v)) / SIZE_STEP) * SIZE_STEP);
          s.updateElement({ ...drag.orig, w: size(local.x), h: size(local.y) });
          break;
        }
        case 'rotate': {
          let angle = (Math.atan2(raw.y - drag.orig.y, raw.x - drag.orig.x) * 180) / Math.PI + 90;
          if (!e.shiftKey) angle = Math.round(angle / ROTATE_STEP) * ROTATE_STEP;
          s.updateElement({ ...drag.orig, rotation: ((angle % 360) + 360) % 360 });
          break;
        }
      }
      return;
    }

    if (s.tool in MEASURE_TOOLS) {
      hover(plannerStore, raw, e.shiftKey, e.clientY);
      return;
    }
    const d = s.draft;
    if (d?.type === 'brush') s.brushAt(gridSnap(raw));
    else if (d?.type === 'mask') s.setDraft({ ...d, cursor: gridSnap(raw) });
  }

  function onPointerUp(e: PointerEvent<Element>) {
    const s = plannerStore.getState();
    setPointer(e.clientX, e.clientY);
    const start = pressRef.current;
    pressRef.current = null;
    if (dragRef.current) {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag.kind === 'erase') {
        const d = s.draft;
        const dragged = !!start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX;
        if (d?.type === 'erase') {
          s.setDraft(null);
          s.eraseMany(d.ids);
        } else if (!dragged && !d) drag.click();
        return;
      }
      if (drag.kind === 'zoomBox') {
        finishZoomBox(drag, start ? Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX : false, e);
        return;
      }
      if (drag.kind === 'box') {
        if (screenBox && drag.moved) {
          screenBox.show(null);
          const crossing = e.clientX < drag.client.x;
          const pool = [...s.pickableElements(), ...s.pickableRooms()].filter(
            (it) => !s.openGroupId || it.groupId === s.openGroupId,
          );
          const box = boundsOf(drag.client, { x: e.clientX, y: e.clientY });
          s.setSelection(itemsInBox(pool, box, crossing, screenBox.project), drag.additive);
          return;
        }
        if (drag.picked) return;
        finishBox(drag, toPlan(e));
        return;
      }
      if (!VIEW_DRAGS.has(drag.kind)) {
        s.endBatch();
        s.setInference(null);
        // A length typed next sets that size exactly.
        if (drag.kind === 'side') s.setLastResize({ id: drag.orig.id, grip: drag.grip });
      }
      return;
    }
    const dragged = !!start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX;
    if (s.tool in MEASURE_TOOLS) {
      release(plannerStore, dragged);
      return;
    }
    if (s.draft?.type === 'brush') {
      s.endBatch();
      s.setDraft(null);
    }
  }

  /** Let go of the Zoom tool: zoom to the window drawn, or in on the point clicked. */
  function finishZoomBox(drag: Extract<Drag, { kind: 'zoomBox' }>, dragged: boolean, e: PointerEvent<Element>) {
    const s = plannerStore.getState();
    if (s.draft?.type === 'zoomBox') s.setDraft(null);
    if (!dragged) {
      s.zoomBy(2, drag.at);
      return;
    }
    const end = toPlan(e);
    s.zoomToBox({
      minX: Math.min(drag.start.x, end.x),
      minY: Math.min(drag.start.y, end.y),
      maxX: Math.max(drag.start.x, end.x),
      maxY: Math.max(drag.start.y, end.y),
    });
  }

  /**
   * A click on empty space picks the room there or, outside every room, the plot it is on (its
   * edge is often under a boundary wall); a box picks what it covers or crosses.
   */
  function finishBox(drag: Extract<Drag, { kind: 'box' }>, end: Point) {
    const s = plannerStore.getState();
    const d = s.draft;
    if (d?.type !== 'marquee') {
      const plot = [...s.pickableElements()]
        .reverse()
        .find((el) => el.type === 'plot' && pointInPolygon(drag.start, el.points));
      const picked = s.roomAt(drag.start) ?? plot;
      if (drag.additive && picked) s.toggleSelect(picked.id);
      else s.select(picked?.id ?? null);
      return;
    }
    s.setDraft(null);
    const box = {
      minX: Math.min(d.x1, end.x),
      minY: Math.min(d.y1, end.y),
      maxX: Math.max(d.x1, end.x),
      maxY: Math.max(d.y1, end.y),
    };
    // Right to left is a crossing selection, like SketchUp and AutoCAD.
    const crossing = end.x < d.x1;
    const pool = [...s.pickableElements(), ...s.pickableRooms()].filter(
      (it) => !s.openGroupId || it.groupId === s.openGroupId,
    );
    s.setSelection(itemsInBox(pool, box, crossing), d.additive);
  }

  function onDoubleClick(e: MouseEvent<Element>) {
    const s = plannerStore.getState();
    if (s.tool === 'mask') {
      s.finishMask();
      return;
    }
    if (s.tool !== 'select') return;
    const raw = toPlan(e);
    const hit = hitAt(e, raw);
    // Double-click a group (or component copy) to edit inside it.
    const groupId = (hit ?? s.roomAt(raw))?.groupId;
    if (groupId && groupId !== s.openGroupId) {
      s.openGroup(groupId);
      if (hit) s.select(hit.id);
      return;
    }
    // Double-click a room to rename it.
    if (hit) return;
    const room = s.roomAt(raw);
    if (!room) return;
    s.select(room.id);
    requestAnimationFrame(() => {
      const field = document.getElementById('room-name');
      if (field instanceof HTMLInputElement) {
        field.focus();
        field.select();
      }
    });
  }

  function onRightClick(e: MouseEvent<Element>) {
    e.preventDefault();
    const s = plannerStore.getState();
    // While drawing, a right-click is Enter (AutoCAD): it finishes the step.
    if (s.draft) {
      finishStep(plannerStore);
      return;
    }
    const raw = toPlan(e);
    const id = idAt(e, raw);
    if (!id || !s.selectedIds.includes(id)) s.select(id);
    onContextMenu?.({ x: e.clientX, y: e.clientY, id });
  }

  /** A pinch took over from the first finger: drop whatever it had started. */
  function abortPress() {
    const s = plannerStore.getState();
    const drag = dragRef.current;
    dragRef.current = null;
    pressRef.current = null;
    if (drag && !VIEW_DRAGS.has(drag.kind)) s.cancelBatch();
    if (drag?.kind === 'box') screenBox?.show(null);
    if (s.draft?.type === 'marquee' || s.draft?.type === 'erase' || s.draft?.type === 'zoomBox') s.setDraft(null);
    if (s.draft?.type === 'brush') {
      s.endBatch();
      s.setDraft(null);
    }
  }

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onRightClick, abortPress };
}
