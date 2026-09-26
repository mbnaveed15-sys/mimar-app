import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { usePlanner } from '../store/plannerStore';

const RATIO_KEY = 'mimar.split';
/** Narrower than this (px), the two sides sit one above the other. */
export const STACK_BELOW_PX = 1100;
const MIN = 0.2;
const MAX = 0.8;

const clamp = (r: number) => Math.min(MAX, Math.max(MIN, r));

function loadRatio(): number {
  try {
    const r = Number(localStorage.getItem(RATIO_KEY));
    return r >= MIN && r <= MAX ? r : 0.5;
  } catch {
    return 0.5;
  }
}

function saveRatio(r: number) {
  try {
    localStorage.setItem(RATIO_KEY, String(r));
  } catch {
    // Only a convenience.
  }
}

/**
 * Split view: the 2D plan and the 3D view side by side (one above the other on narrow screens),
 * with a divider to drag. The side the pointer is over is the one in use, so every tool works in
 * both; what is being drawn carries on from one side to the other.
 */
export function SplitView({ plan, model }: { plan: ReactNode; model: ReactNode }) {
  const setActivePane = usePlanner((s) => s.setActivePane);
  const [ratio, setRatio] = useState(loadRatio);
  const [stacked, setStacked] = useState(() => window.innerWidth < STACK_BELOW_PX);
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    const onResize = () => setStacked(window.innerWidth < STACK_BELOW_PX);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function ratioAt(e: PointerEvent) {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box) return ratio;
    return clamp(stacked ? (e.clientY - box.top) / box.height : (e.clientX - box.left) / box.width);
  }
  function onDividerKey(e: KeyboardEvent) {
    const less = stacked ? 'ArrowUp' : 'ArrowLeft';
    const more = stacked ? 'ArrowDown' : 'ArrowRight';
    if (e.key !== less && e.key !== more) return;
    e.preventDefault();
    e.stopPropagation();
    const next = clamp(ratio + (e.key === more ? 0.05 : -0.05));
    setRatio(next);
    saveRatio(next);
  }

  // The side under the pointer (or touched) is the one in use.
  const pane = (is3d: boolean, children: ReactNode, basis: number) => (
    <div
      className="relative min-h-0 min-w-0 overflow-hidden"
      style={{ flex: `${basis} 1 0` }}
      data-testid={is3d ? 'split-3d' : 'split-2d'}
      onPointerEnter={() => !dragging.current && setActivePane(is3d)}
      onPointerDownCapture={() => setActivePane(is3d)}
    >
      {children}
    </div>
  );

  return (
    <div ref={boxRef} className={`flex h-full w-full ${stacked ? 'flex-col' : 'flex-row'}`} data-testid="split-view">
      {pane(false, plan, ratio)}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation={stacked ? 'horizontal' : 'vertical'}
        aria-label="Divider between the 2D plan and the 3D view"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={MIN * 100}
        aria-valuemax={MAX * 100}
        title="Drag to share the space between the plan and the 3D view"
        className={`z-10 flex-none touch-none bg-line hover:bg-accent focus:bg-accent focus:outline-none ${
          stacked ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'
        }`}
        onKeyDown={onDividerKey}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
        }}
        onPointerMove={(e) => dragging.current && setRatio(ratioAt(e))}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          const r = ratioAt(e);
          setRatio(r);
          saveRatio(r);
        }}
      />
      {pane(true, model, 1 - ratio)}
    </div>
  );
}
