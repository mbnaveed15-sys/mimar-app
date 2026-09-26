import { useEffect, useMemo, type RefObject } from 'react';
import { useStore } from 'zustand';
import { elementOutline, fromFurnitureLocal } from '../geometry';
import { PLAN_FONT } from '../lib/planImage';
import { panBy } from '../lib/view';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { useLevelDoc } from '../store/useLevelDoc';
import { PLAN } from '../theme/plan';
import { selectionBounds } from '../lib/selection';
import type { Furniture, PlanElement, Point } from '../types';
import { wallPolygon, wallsOf } from '../walls';
import { DrawingOverlay } from './DrawingOverlay';
import { CheckMarks } from './CheckMarks';
import { faceAt2D } from '../lib/faces2d';
import { clearPicker, setPicker, type Picker3D } from '../three/picker';
import { cameraEye } from '../three/cameraEye';
import { M_PER_UNIT } from '../three/model';
import { PlanDrawing } from './PlanDrawing';
import { PlanGrid } from './PlanGrid';
import { usePlanInput, type ContextTarget } from './usePlanInput';
import { useTouch } from './useTouch';

function toPlanPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

export type { ContextTarget };

interface Props {
  svgRef: RefObject<SVGSVGElement | null>;
  onContextMenu?: (target: ContextTarget) => void;
}

const NONE: string[] = [];

export function Canvas({ svgRef, onContextMenu }: Props) {
  const doc = useLevelDoc()!;
  // The floor below, drawn faintly so the walls above can be traced over it.
  const below = useLevelDoc(-1);
  const belowWalls = useMemo(
    () => (below ? { ...below, rooms: [], elements: below.elements.filter((el) => el.type !== 'furniture') } : null),
    [below],
  );
  const draft = usePlanner((s) => s.draft);
  const inference = usePlanner((s) => s.inference);
  const axisLock = usePlanner((s) => s.axisLock);
  const hoverEdge = usePlanner((s) => s.hoverEdge);
  const selectedIds = usePlanner((s) => s.selectedIds);
  const openGroupId = usePlanner((s) => s.openGroupId);
  const gridPx = usePlanner((s) => s.gridPx);
  const grid = usePlanner((s) => s.grid);
  const theme = usePlanner((s) => s.theme);
  const view = usePlanner((s) => s.view);
  const viewport = usePlanner((s) => s.viewport);
  const units = usePlanner((s) => s.units);
  const showDimensions = usePlanner((s) => s.showDimensions);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const showRoomLabels = usePlanner((s) => s.showRoomLabels);
  const showRoomFills = usePlanner((s) => s.showRoomFills);
  const tool = usePlanner((s) => s.tool);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);
  const touchInput = usePlanner((s) => s.touchInput);
  const input = usePlanInput((e) => (svgRef.current ? toPlanPoint(svgRef.current, e) : { x: 0, y: 0 }), onContextMenu);

  // Push/Pull in the plan: faces seen from above (wall sides and ends, slab and block edges, columns, beams).
  useEffect(() => {
    const at = (clientX: number, clientY: number) =>
      svgRef.current ? toPlanPoint(svgRef.current, { clientX, clientY }) : null;
    const picker: Picker3D = {
      is3d: false,
      highlight: (hit) => plannerStore.getState().setHoverEdge(hit?.edge ?? null),
      faceAt(clientX, clientY) {
        const p = at(clientX, clientY);
        const s = plannerStore.getState();
        const face = p && faceAt2D(s.pickableElements(), p, 10 * s.reach() * s.pxUnits());
        if (!p || !face) return null;
        return {
          id: face.id,
          point: [p.x * M_PER_UNIT, 0, p.y * M_PER_UNIT],
          normal: [face.normal.x, 0, face.normal.y],
          edge: [face.a, face.b],
        };
      },
      onPlane: () => null,
      alongLine(clientX, clientY, origin, dir) {
        const p = at(clientX, clientY);
        const len = Math.hypot(dir[0], dir[2]);
        if (!p || !len) return null;
        return ((p.x * M_PER_UNIT - origin[0]) * dir[0] + (p.y * M_PER_UNIT - origin[2]) * dir[2]) / len;
      },
    };
    setPicker(picker);
    return () => {
      plannerStore.getState().setHoverEdge(null);
      clearPicker(picker);
    };
  }, [svgRef]);

  const k = 1 / view.zoom; // plan units per screen pixel
  const vbW = viewport.width / view.zoom || 1600;
  const vbH = viewport.height / view.zoom || 1000;

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

  const touch = useTouch({
    down: input.onPointerDown,
    move: input.onPointerMove,
    up: input.onPointerUp,
    doubleClick: input.onDoubleClick,
    contextMenu: input.onRightClick,
    abort: input.abortPress,
    gesture: ({ dx, dy, scale, x, y }) => {
      const s = plannerStore.getState();
      s.setView(panBy(s.view, dx, dy));
      plannerStore.getState().zoomBy(scale, { x, y });
    },
  });
  // Drag handles grow under a finger.
  const hk = touchInput ? k * 1.8 : k;

  const selected = selectedIds.length === 1 ? doc.elements.find((el) => el.id === selectedIds[0]) : undefined;
  // Dashed boxes around selected groups and the group open for editing.
  const groupBoxes = doc.groups
    .map((g) => {
      const members = [...doc.elements, ...doc.rooms].filter((it) => it.groupId === g.id).map((it) => it.id);
      const open = g.id === openGroupId;
      if (!open && !members.some((m) => selectedIds.includes(m))) return null;
      const box = selectionBounds(doc, members);
      return box ? { g, box, open } : null;
    })
    .filter((x) => x !== null);
  const cursor =
    tool === 'pan'
      ? 'cursor-grab'
      : tool === 'zoom'
        ? 'cursor-ns-resize'
        : tool === 'select'
          ? 'cursor-default'
          : 'cursor-crosshair';

  return (
    <svg
      ref={svgRef}
      data-testid="plan-canvas"
      viewBox={`${view.x} ${view.y} ${vbW} ${vbH}`}
      className={`h-full w-full touch-none bg-canvas select-none ${cursor}`}
      fontFamily={PLAN_FONT}
      onPointerDown={touch.onPointerDown}
      onPointerMove={touch.onPointerMove}
      onPointerUp={touch.onPointerUp}
      onPointerCancel={touch.onPointerUp}
      onPointerLeave={() => plannerStore.getState().setInference(null)}
      onDoubleClick={(e) => !touch.fromTouch() && input.onDoubleClick(e)}
      onContextMenu={(e) => (touch.fromTouch() ? e.preventDefault() : input.onRightClick(e))}
    >
      {grid.show && (
        <PlanGrid
          id="plan"
          area={{ minX: view.x, minY: view.y, maxX: view.x + vbW, maxY: view.y + vbH }}
          step={gridPx}
          look={grid}
          k={k}
          colors={grid.colors[theme]}
        />
      )}

      {below && (
        <g opacity={0.22} pointerEvents="none" data-testid="level-below">
          <PlanDrawing
            doc={belowWalls!}
            selectedIds={NONE}
            units={units}
            marlaSqFt={marlaSqFt}
            showDimensions={false}
            showFurniture={false}
            showRoomLabels={false}
            showRoomFills={false}
            k={k}
          />
        </g>
      )}

      <PlanDrawing
        doc={doc}
        selectedIds={selectedIds}
        units={units}
        marlaSqFt={marlaSqFt}
        showDimensions={showDimensions}
        showFurniture={showFurniture}
        showRoomLabels={showRoomLabels}
        showRoomFills={showRoomFills}
        k={k}
      />

      <CheckMarks elements={doc.elements} rooms={doc.rooms} k={k} />

      <g pointerEvents="none">
        {groupBoxes.map(({ g, box, open }) => (
          <g key={g.id} data-testid={open ? 'open-group' : 'group-box'}>
            <rect
              x={box.minX - 6 * k}
              y={box.minY - 6 * k}
              width={box.maxX - box.minX + 12 * k}
              height={box.maxY - box.minY + 12 * k}
              fill="none"
              style={{ stroke: open ? PLAN.inkMuted : PLAN.selection }}
              strokeWidth={(open ? 1 : 1.5) * k}
              strokeDasharray={`${6 * k} ${4 * k}`}
            />
            <text
              x={box.minX - 6 * k}
              y={box.minY - 10 * k}
              fontSize={11 * k}
              fontWeight={600}
              style={{ fill: open ? PLAN.inkMuted : PLAN.selection, stroke: PLAN.paper }}
              strokeWidth={3 * k}
              paintOrder="stroke"
            >
              {open ? `Editing ${g.name}` : g.name}
            </text>
          </g>
        ))}
      </g>

      <g>
        {tool === 'select' && selected?.type === 'wall' && (
          <>
            <Handle name="wall-start" p={{ x: selected.x1, y: selected.y1 }} k={hk} />
            <Handle name="wall-end" p={{ x: selected.x2, y: selected.y2 }} k={hk} />
          </>
        )}
        {tool === 'select' && selected?.type === 'furniture' && showFurniture && (
          <FurnitureHandles item={selected} k={hk} />
        )}
        {draft?.type === 'mask' && (
          <polyline
            points={[...draft.points, ...(draft.cursor ? [draft.cursor] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            style={{ stroke: PLAN.draft }}
            strokeWidth={2 * k}
            strokeDasharray={`${6 * k} ${4 * k}`}
          />
        )}
      </g>

      {draft?.type === 'erase' && <EraseMarks elements={doc.elements} ids={draft.ids} k={k} />}

      <DrawingOverlay
        draft={draft}
        inference={inference}
        axisLock={axisLock}
        units={units}
        k={k}
        hoverEdge={hoverEdge}
      />
      <CameraEyeMark k={k} />
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
      style={{ fill: PLAN.paper, stroke: PLAN.selection }}
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
      <line
        x1={top.x}
        y1={top.y}
        x2={rotate.x}
        y2={rotate.y}
        style={{ stroke: PLAN.selection }}
        strokeWidth={1.5 * k}
      />
      <Handle name="rotate" p={rotate} k={k} />
      <Handle name="resize" p={fromFurnitureLocal(item, { x: item.w / 2, y: item.h / 2 })} k={k} />
    </>
  );
}

/** Items the eraser has passed over, outlined in red until it is let go. */
function EraseMarks({ elements, ids, k }: { elements: PlanElement[]; ids: string[]; k: number }) {
  const walls = wallsOf(elements);
  const marked = new Set(ids);
  return (
    <g data-testid="erase-marks" pointerEvents="none">
      {elements
        .filter((el) => marked.has(el.id))
        .map((el) => {
          const pts = el.type === 'wall' ? wallPolygon(el, walls) : elementOutline(el);
          return pts.length > 2 ? (
            <polygon
              key={el.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="#dc2626"
              fillOpacity={0.25}
              stroke="#dc2626"
              strokeWidth={2 * k}
            />
          ) : (
            <polyline
              key={el.id}
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="#dc2626"
              strokeWidth={4 * k}
            />
          );
        })}
    </g>
  );
}

/**
 * In split view, where the 3D camera stands on the plan and what it sees: a dot, a wedge as wide as
 * its view (a strip for a parallel view), and the point it turns about.
 */
function CameraEyeMark({ k }: { k: number }) {
  const split = usePlanner((s) => s.split);
  const eye = useStore(cameraEye, (s) => s.eye);
  if (!split || !eye) return null;
  const { at, target, fovDeg } = eye;
  const heading = Math.atan2(target.y - at.y, target.x - at.x);
  const reach = 70 * k;
  const ray = (turn: number, len = reach) => ({
    x: at.x + Math.cos(heading + turn) * len,
    y: at.y + Math.sin(heading + turn) * len,
  });
  const half = (fovDeg * Math.PI) / 360;
  const [a, b] = fovDeg > 0 ? [ray(-half), ray(half)] : [ray(-Math.PI / 2, 12 * k), ray(Math.PI / 2, 12 * k)];
  const wedge =
    fovDeg > 0
      ? `M${at.x},${at.y} L${a.x},${a.y} L${b.x},${b.y} Z`
      : `M${a.x},${a.y} L${b.x},${b.y} L${b.x + Math.cos(heading) * reach},${b.y + Math.sin(heading) * reach} L${a.x + Math.cos(heading) * reach},${a.y + Math.sin(heading) * reach} Z`;
  return (
    <g data-testid="camera-eye" pointerEvents="none" style={{ color: PLAN.selection }}>
      <path d={wedge} fill="currentColor" fillOpacity={0.12} stroke="currentColor" strokeWidth={1.2 * k} />
      <line
        x1={at.x}
        y1={at.y}
        x2={target.x}
        y2={target.y}
        stroke="currentColor"
        strokeWidth={k}
        strokeDasharray={`${4 * k} ${4 * k}`}
        strokeOpacity={0.6}
      />
      <circle cx={target.x} cy={target.y} r={3 * k} fill="currentColor" fillOpacity={0.6} />
      <circle cx={at.x} cy={at.y} r={6 * k} fill="currentColor" stroke={PLAN.paper} strokeWidth={1.5 * k}>
        <title>3D camera</title>
      </circle>
    </g>
  );
}
