import { finishStep } from '../tools/finish';
import { useRef, type MouseEvent, type PointerEvent } from 'react';
import {
  findElementNear,
  isNear,
  nearestWall,
  nearestWallEnd,
  placeOnWall,
  snap,
  toFurnitureLocal,
  translateElement,
} from '../geometry';
import { trimAt } from '../lib/modify';
import { itemsInBox, moveItems } from '../lib/selection';
import { panBy } from '../lib/view';
import { MM_PER_UNIT, plannerStore } from '../store/plannerStore';
import { DRAG_PX, hover, MEASURE_TOOLS, press, release } from '../tools/controller';
import { setPointer } from '../three/picker';
import { hasPoints, type Bounds, type Furniture, type PlanElement, type Point, type Wall } from '../types';

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'zoom'; lastY: number; at: Point }
  | { kind: 'move'; start: Point; orig: PlanElement }
  /** Dragging several selected items (or a group) together. */
  | { kind: 'moveMany'; start: Point; ids: string[] }
  /** Pressed on empty space: becomes a selection box once the pointer moves. */
  | { kind: 'box'; start: Point; additive: boolean; client: Point; moved?: boolean }
  /** Eraser pressed: a click erases what is there when let go; a drag erases all it passes over. */
  | { kind: 'erase'; last: Point; click: () => void }
  | { kind: 'wall-start' | 'wall-end'; orig: Wall }
  | { kind: 'resize' | 'rotate'; orig: Furniture };

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
  return s.grid.snap ? snap(raw, s.gridPx) : raw;
}

/** Snap to a nearby wall end (so walls join cleanly), otherwise to the grid. */
function snapPoint(raw: Point, ignoreId?: string): Point {
  const s = plannerStore.getState();
  return nearestWallEnd(s.doc.elements, raw, 10 * s.pxUnits(), ignoreId) ?? gridSnap(raw);
}

const boundsOf = (a: Point, b: Point): Bounds => ({
  minX: Math.min(a.x, b.x),
  minY: Math.min(a.y, b.y),
  maxX: Math.max(a.x, b.x),
  maxY: Math.max(a.y, b.y),
});

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

  function startDrag(e: PointerEvent<Element>, drag: Drag) {
    capture(e);
    if (drag.kind !== 'pan' && drag.kind !== 'zoom' && drag.kind !== 'box' && drag.kind !== 'erase')
      plannerStore.getState().beginBatch();
    dragRef.current = drag;
  }

  function onPointerDown(e: PointerEvent<Element>) {
    const s = plannerStore.getState();
    setPointer(e.clientX, e.clientY);
    const raw = toPlan(e);
    pressRef.current = { x: e.clientX, y: e.clientY };

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
    if (s.tool === 'zoom') {
      const r = e.currentTarget.getBoundingClientRect();
      startDrag(e, { kind: 'zoom', lastY: e.clientY, at: { x: e.clientX - r.left, y: e.clientY - r.top } });
      return;
    }

    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const selected = s.selectedIds.length === 1 ? s.doc.elements.find((el) => el.id === s.selectedId) : undefined;
    if (handle && selected && s.tool === 'select') {
      if (selected.type === 'wall' && (handle === 'wall-start' || handle === 'wall-end')) {
        startDrag(e, { kind: handle, orig: selected });
      } else if (selected.type === 'furniture' && (handle === 'resize' || handle === 'rotate')) {
        startDrag(e, { kind: handle, orig: selected });
      }
      return;
    }

    if (s.tool in MEASURE_TOOLS) {
      capture(e);
      s.setMeasureText('');
      press(plannerStore, raw, { ctrl: e.ctrlKey || e.metaKey });
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
      case 'door':
      case 'window':
        s.placeOpening(s.tool, raw);
        break;
      case 'furniture':
        s.addFurniture(gridSnap(raw));
        break;
      case 'paint':
        if (pickId) {
          const id = idAt(e, raw);
          if (id) s.applyMaterial(id);
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
        const picked = !wall && pickId ? idAt(e, raw) : null;
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
            for (const el of items) if (isNear(el, p, tol)) ids.add(el.id);
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
          if (s.grid.snap) {
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
            const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === orig.wallId);
            if (wall) s.updateElement({ ...orig, ...placeOnWall(wall, raw, orig.width) });
          } else {
            const anchor =
              orig.type === 'wall' || orig.type === 'beam' || orig.type === 'line'
                ? { x: orig.x1, y: orig.y1 }
                : hasPoints(orig)
                  ? orig.points[0]
                  : { x: orig.x, y: orig.y };
            const moved = { x: anchor.x + raw.x - drag.start.x, y: anchor.y + raw.y - drag.start.y };
            const target = orig.type === 'wall' ? snapPoint(moved, orig.id) : gridSnap(moved);
            s.updateElement(translateElement(orig, target.x - anchor.x, target.y - anchor.y));
          }
          break;
        }
        case 'wall-start':
        case 'wall-end': {
          const p = snapPoint(raw, drag.orig.id);
          const next =
            drag.kind === 'wall-start' ? { ...drag.orig, x1: p.x, y1: p.y } : { ...drag.orig, x2: p.x, y2: p.y };
          if (next.x1 !== next.x2 || next.y1 !== next.y2) s.updateElement(next);
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
        finishBox(drag, toPlan(e));
        return;
      }
      if (drag.kind !== 'pan' && drag.kind !== 'zoom') s.endBatch();
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

  /** A click on empty space picks the room there; a box picks what it covers or crosses. */
  function finishBox(drag: Extract<Drag, { kind: 'box' }>, end: Point) {
    const s = plannerStore.getState();
    const d = s.draft;
    if (d?.type !== 'marquee') {
      const room = s.roomAt(drag.start);
      if (drag.additive && room) s.toggleSelect(room.id);
      else s.select(room?.id ?? null);
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
    if (drag && drag.kind !== 'pan' && drag.kind !== 'zoom' && drag.kind !== 'box' && drag.kind !== 'erase')
      s.cancelBatch();
    if (drag?.kind === 'box') screenBox?.show(null);
    if (s.draft?.type === 'marquee' || s.draft?.type === 'erase') s.setDraft(null);
    if (s.draft?.type === 'brush') {
      s.endBatch();
      s.setDraft(null);
    }
  }

  return { onPointerDown, onPointerMove, onPointerUp, onDoubleClick, onRightClick, abortPress };
}
