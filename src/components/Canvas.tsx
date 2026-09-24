import type { PointerEvent, RefObject } from 'react';
import { findElementNear, snap } from '../geometry';
import { plannerStore, usePlanner } from '../store/plannerStore';
import type { Point } from '../types';
import { FurnitureShape } from './shapes/FurnitureShape';
import { MaskShape } from './shapes/MaskShape';
import { OpeningShape } from './shapes/OpeningShape';
import { WallShape } from './shapes/WallShape';

export const CANVAS_WIDTH = 1600;
export const CANVAS_HEIGHT = 1000;

function toSvgPoint(svg: SVGSVGElement, e: PointerEvent): Point {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
  return { x: pt.x, y: pt.y };
}

interface Props {
  svgRef: RefObject<SVGSVGElement | null>;
}

export function Canvas({ svgRef }: Props) {
  const doc = usePlanner((s) => s.doc);
  const draft = usePlanner((s) => s.draft);
  const selectedId = usePlanner((s) => s.selectedId);
  const gridPx = usePlanner((s) => s.gridPx);
  const colorOf = (id?: string) => doc.materials.find((m) => m.id === id)?.color;

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    const s = plannerStore.getState();
    const raw = toSvgPoint(e.currentTarget, e);
    const p = snap(raw, s.gridPx);
    switch (s.tool) {
      case 'select':
        s.select(findElementNear(s.doc.elements, raw, 12)?.id ?? null);
        break;
      case 'wall':
        e.currentTarget.setPointerCapture(e.pointerId);
        s.setDraft({ type: 'wall', x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        break;
      case 'door':
      case 'window':
        s.placeOpening(s.tool, raw);
        break;
      case 'furniture':
        s.addFurniture(p);
        break;
      case 'paint':
        s.paintAt(raw);
        break;
      case 'brush':
        e.currentTarget.setPointerCapture(e.pointerId);
        s.beginBatch();
        s.brushAt(p);
        s.setDraft({ type: 'brush' });
        break;
      case 'mask':
        s.addMaskPoint(p);
        break;
      case 'erase':
        s.eraseAt(raw);
        break;
    }
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const s = plannerStore.getState();
    const d = s.draft;
    if (!d) return;
    const p = snap(toSvgPoint(e.currentTarget, e), s.gridPx);
    if (d.type === 'wall') s.setDraft({ ...d, x2: p.x, y2: p.y });
    else if (d.type === 'brush') s.brushAt(p);
    else if (d.type === 'mask') s.setDraft({ ...d, cursor: p });
  }

  function onPointerUp() {
    const s = plannerStore.getState();
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

  return (
    <svg
      ref={svgRef}
      data-testid="plan-canvas"
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      className="h-full w-full touch-none bg-white"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <defs>
        <pattern id="grid" width={gridPx} height={gridPx} patternUnits="userSpaceOnUse">
          <path d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`} fill="none" stroke="#eee" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} fill="url(#grid)" />

      {doc.elements.map((el) => {
        const selected = el.id === selectedId;
        const color = colorOf(el.material);
        switch (el.type) {
          case 'wall':
            return <WallShape key={el.id} wall={el} color={color} selected={selected} />;
          case 'door':
          case 'window':
            return <OpeningShape key={el.id} opening={el} color={color} selected={selected} />;
          case 'furniture':
            return <FurnitureShape key={el.id} item={el} color={color} selected={selected} />;
        }
      })}

      {doc.masks.map((m) => (
        <MaskShape key={m.id} mask={m} color={colorOf(m.material)} />
      ))}

      {draft?.type === 'wall' && (
        <line
          x1={draft.x1}
          y1={draft.y1}
          x2={draft.x2}
          y2={draft.y2}
          stroke="#ff7b7b"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
      {draft?.type === 'mask' && (
        <polyline
          points={[...draft.points, ...(draft.cursor ? [draft.cursor] : [])].map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke="#ff7b7b"
          strokeWidth={2}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  );
}
