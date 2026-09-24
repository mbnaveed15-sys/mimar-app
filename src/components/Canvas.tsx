import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import {
  findElementNear,
  fromFurnitureLocal,
  nearestWallEnd,
  placeOnWall,
  snap,
  toFurnitureLocal,
  translateElement,
} from '../geometry';
import { formatLength } from '../lib/units';
import { panBy } from '../lib/view';
import { MM_PER_UNIT, plannerStore, usePlanner } from '../store/plannerStore';
import type { Furniture, PlanElement, Point, Wall } from '../types';
import { PLAN_FONT } from '../lib/planImage';
import { PlanDrawing } from './PlanDrawing';

type Drag =
  | { kind: 'pan'; lastX: number; lastY: number }
  | { kind: 'move'; start: Point; orig: PlanElement }
  | { kind: 'wall-start' | 'wall-end'; orig: Wall }
  | { kind: 'resize' | 'rotate'; orig: Furniture };

/** Furniture sizes snap to 50 mm; rotation snaps to 15° unless Shift is held. */
const SIZE_STEP = 50 / MM_PER_UNIT;
const ROTATE_STEP = 15;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

function toPlanPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

/** Snap to a nearby wall end (so walls join cleanly), otherwise to the grid. */
function snapPoint(raw: Point, ignoreId?: string): Point {
  const s = plannerStore.getState();
  return nearestWallEnd(s.doc.elements, raw, 10 / s.view.zoom, ignoreId) ?? snap(raw, s.gridPx);
}

interface Props {
  svgRef: RefObject<SVGSVGElement | null>;
}

export function Canvas({ svgRef }: Props) {
  const doc = usePlanner((s) => s.doc);
  const draft = usePlanner((s) => s.draft);
  const selectedId = usePlanner((s) => s.selectedId);
  const gridPx = usePlanner((s) => s.gridPx);
  const view = usePlanner((s) => s.view);
  const viewport = usePlanner((s) => s.viewport);
  const units = usePlanner((s) => s.units);
  const showDimensions = usePlanner((s) => s.showDimensions);
  const tool = usePlanner((s) => s.tool);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);
  const dragRef = useRef<Drag | null>(null);
  const spaceRef = useRef(false);

  const k = 1 / view.zoom; // plan units per screen pixel
  const vbW = viewport.width / view.zoom || 1600;
  const vbH = viewport.height / view.zoom || 1000;

  // Coarsen the visible grid when zoomed out so lines stay at least 8 px apart.
  let shownGrid = gridPx;
  while (shownGrid * view.zoom < 8) shownGrid *= 5;

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      plannerStore.getState().setViewport({ width, height });
    });
    ro.observe(svg);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      plannerStore.getState().zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      ro.disconnect();
      svg.removeEventListener('wheel', onWheel);
    };
  }, [svgRef]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTyping(e.target)) return;
      spaceRef.current = true;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function startDrag(e: PointerEvent<SVGSVGElement>, drag: Drag) {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (drag.kind !== 'pan') plannerStore.getState().beginBatch();
    dragRef.current = drag;
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    const s = plannerStore.getState();
    const raw = toPlanPoint(e.currentTarget, e);

    if (e.button === 1 || spaceRef.current || s.tool === 'pan') {
      e.preventDefault();
      startDrag(e, { kind: 'pan', lastX: e.clientX, lastY: e.clientY });
      return;
    }
    if (e.button !== 0) return;

    const handle = (e.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const selected = s.doc.elements.find((el) => el.id === s.selectedId);
    if (handle && selected) {
      if (selected.type === 'wall' && (handle === 'wall-start' || handle === 'wall-end')) {
        startDrag(e, { kind: handle, orig: selected });
      } else if (selected.type === 'furniture' && (handle === 'resize' || handle === 'rotate')) {
        startDrag(e, { kind: handle, orig: selected });
      }
      return;
    }

    switch (s.tool) {
      case 'select': {
        const hit = findElementNear(s.doc.elements, raw, s.hitTolerance());
        s.select(hit?.id ?? s.roomAt(raw)?.id ?? null);
        if (hit) startDrag(e, { kind: 'move', start: raw, orig: hit });
        break;
      }
      case 'room':
        s.addRoomAt(raw);
        break;
      case 'wall': {
        const p = snapPoint(raw);
        e.currentTarget.setPointerCapture(e.pointerId);
        s.setDraft({ type: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        break;
      }
      case 'door':
      case 'window':
        s.placeOpening(s.tool, raw);
        break;
      case 'furniture':
        s.addFurniture(snap(raw, s.gridPx));
        break;
      case 'paint':
        s.paintAt(raw);
        break;
      case 'brush':
        e.currentTarget.setPointerCapture(e.pointerId);
        s.beginBatch();
        s.brushAt(snap(raw, s.gridPx));
        s.setDraft({ type: 'brush' });
        break;
      case 'mask':
        s.addMaskPoint(snap(raw, s.gridPx));
        break;
      case 'erase':
        s.eraseAt(raw);
        break;
    }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const s = plannerStore.getState();
    const drag = dragRef.current;
    const raw = toPlanPoint(e.currentTarget, e);

    if (drag) {
      switch (drag.kind) {
        case 'pan':
          s.setView(panBy(s.view, e.clientX - drag.lastX, e.clientY - drag.lastY));
          drag.lastX = e.clientX;
          drag.lastY = e.clientY;
          break;
        case 'move': {
          const { orig } = drag;
          if (orig.type === 'door' || orig.type === 'window') {
            // Doors and windows slide along their wall.
            const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === orig.wallId);
            if (wall) s.updateElement({ ...orig, ...placeOnWall(wall, raw, orig.width) });
          } else {
            const anchor = orig.type === 'wall' ? { x: orig.x1, y: orig.y1 } : { x: orig.x, y: orig.y };
            const moved = { x: anchor.x + raw.x - drag.start.x, y: anchor.y + raw.y - drag.start.y };
            const target = orig.type === 'wall' ? snapPoint(moved, orig.id) : snap(moved, s.gridPx);
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

    const d = s.draft;
    if (!d) return;
    if (d.type === 'wall') {
      const p = snapPoint(raw);
      s.setDraft({ ...d, x2: p.x, y2: p.y });
    } else if (d.type === 'brush') s.brushAt(snap(raw, s.gridPx));
    else if (d.type === 'mask') s.setDraft({ ...d, cursor: snap(raw, s.gridPx) });
  }

  function onPointerUp() {
    const s = plannerStore.getState();
    if (dragRef.current) {
      if (dragRef.current.kind !== 'pan') s.endBatch();
      dragRef.current = null;
      return;
    }
    const d = s.draft;
    if (!d) return;
    if (d.type === 'wall') {
      s.addWall({ x: d.x1, y: d.y1 }, { x: d.x2, y: d.y2 });
      s.setDraft(null);
    } else if (d.type === 'brush') {
      s.endBatch();
      s.setDraft(null);
    }
  }

  function onDoubleClick() {
    const s = plannerStore.getState();
    if (s.tool === 'mask') s.finishMask();
  }

  const selected = doc.elements.find((el) => el.id === selectedId);
  const cursor = tool === 'pan' ? 'cursor-grab' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair';

  return (
    <svg
      ref={svgRef}
      data-testid="plan-canvas"
      viewBox={`${view.x} ${view.y} ${vbW} ${vbH}`}
      className={`h-full w-full touch-none bg-white select-none ${cursor}`}
      fontFamily={PLAN_FONT}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="grid" width={shownGrid} height={shownGrid} patternUnits="userSpaceOnUse">
          <path d={`M ${shownGrid} 0 L 0 0 0 ${shownGrid}`} fill="none" stroke="#e5e7eb" strokeWidth={k} />
        </pattern>
      </defs>
      <rect x={view.x} y={view.y} width={vbW} height={vbH} fill="url(#grid)" />

      <PlanDrawing
        doc={doc}
        selectedId={selectedId}
        units={units}
        marlaSqFt={marlaSqFt}
        showDimensions={showDimensions}
        k={k}
      />

      <g>
        {selected?.type === 'wall' && (
          <>
            <Handle name="wall-start" p={{ x: selected.x1, y: selected.y1 }} k={k} />
            <Handle name="wall-end" p={{ x: selected.x2, y: selected.y2 }} k={k} />
          </>
        )}
        {selected?.type === 'furniture' && <FurnitureHandles item={selected} k={k} />}

        {draft?.type === 'wall' && (
          <>
            <line
              x1={draft.x1}
              y1={draft.y1}
              x2={draft.x2}
              y2={draft.y2}
              stroke="#ff7b7b"
              strokeWidth={2 * k}
              strokeDasharray={`${6 * k} ${4 * k}`}
            />
            <text
              x={draft.x2 + 10 * k}
              y={draft.y2 - 10 * k}
              fontSize={12 * k}
              fill="#b91c1c"
              stroke="#fff"
              strokeWidth={3 * k}
              paintOrder="stroke"
            >
              {formatLength(Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) * MM_PER_UNIT, units)}
            </text>
          </>
        )}
        {draft?.type === 'mask' && (
          <polyline
            points={[...draft.points, ...(draft.cursor ? [draft.cursor] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke="#ff7b7b"
            strokeWidth={2 * k}
            strokeDasharray={`${6 * k} ${4 * k}`}
          />
        )}
      </g>
    </svg>
  );
}

function Handle({ name, p, k }: { name: string; p: Point; k: number }) {
  return (
    <circle
      data-handle={name}
      cx={p.x}
      cy={p.y}
      r={6 * k}
      fill="#fff"
      stroke="#2563eb"
      strokeWidth={2 * k}
      className={name === 'rotate' ? 'cursor-grab' : 'cursor-move'}
    />
  );
}

function FurnitureHandles({ item, k }: { item: Furniture; k: number }) {
  const top = fromFurnitureLocal(item, { x: 0, y: -item.h / 2 });
  const rotate = fromFurnitureLocal(item, { x: 0, y: -item.h / 2 - 24 * k });
  return (
    <>
      <line x1={top.x} y1={top.y} x2={rotate.x} y2={rotate.y} stroke="#2563eb" strokeWidth={1.5 * k} />
      <Handle name="rotate" p={rotate} k={k} />
      <Handle name="resize" p={fromFurnitureLocal(item, { x: item.w / 2, y: item.h / 2 })} k={k} />
    </>
  );
}
