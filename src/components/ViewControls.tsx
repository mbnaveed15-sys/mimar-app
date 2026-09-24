import { usePlanner } from '../store/plannerStore';

/** Zoom buttons floating over the bottom-right corner of the canvas. */
export function ViewControls() {
  const zoom = usePlanner((s) => s.view.zoom);
  const zoomBy = usePlanner((s) => s.zoomBy);
  const fitToPlan = usePlanner((s) => s.fitToPlan);
  const btn = 'px-2.5 py-1 hover:bg-gray-100';

  return (
    <div className="absolute right-3 bottom-3 flex items-center divide-x overflow-hidden rounded-md border bg-white text-sm shadow-sm">
      <button onClick={() => zoomBy(1 / 1.25)} className={btn} title="Zoom out (-)" aria-label="Zoom out">
        −
      </button>
      <span className="w-14 text-center tabular-nums" data-testid="zoom-level">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={() => zoomBy(1.25)} className={btn} title="Zoom in (+)" aria-label="Zoom in">
        +
      </button>
      <button onClick={fitToPlan} className={btn} title="Fit plan to screen (0)">
        Fit
      </button>
    </div>
  );
}
