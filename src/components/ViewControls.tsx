import { usePlanner } from '../store/plannerStore';
import { Icon } from './Icon';

/** Zoom buttons floating over the bottom-right corner of the canvas. */
export function ViewControls() {
  const zoom = usePlanner((s) => s.view.zoom);
  const zoomBy = usePlanner((s) => s.zoomBy);
  const fitToPlan = usePlanner((s) => s.fitToPlan);
  const btn = 'grid h-8 w-8 place-items-center hover:bg-sunken';

  return (
    <div className="absolute right-3 bottom-3 flex items-center divide-x divide-line overflow-hidden rounded-md border border-line bg-raised text-ink shadow-popover">
      <button onClick={() => zoomBy(1 / 1.25)} className={`${btn} text-lg`} title="Zoom out (-)" aria-label="Zoom out">
        −
      </button>
      <span className="w-14 text-center text-xs tabular-nums" data-testid="zoom-level">
        {Math.round(zoom * 100)}%
      </span>
      <button onClick={() => zoomBy(1.25)} className={btn} title="Zoom in (+)" aria-label="Zoom in">
        <Icon name="zoom" size={18} />
      </button>
      <button onClick={fitToPlan} className={btn} title="Fit plan to screen (0)" aria-label="Fit plan to screen">
        <Icon name="zoom-extents" size={18} />
      </button>
    </div>
  );
}
