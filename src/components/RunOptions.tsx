import { RUN_ORDER, RUN_SYSTEMS } from '../lib/services';
import { usePlanner } from '../store/plannerStore';

/** What the Wire or pipe tool draws: a circuit or a pipe, each in its own colour and line. */
export function RunOptions() {
  const system = usePlanner((s) => s.runSystem);
  const setSystem = usePlanner((s) => s.setRunSystem);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs" aria-label="Run options">
      <div className="font-medium">Wire or pipe</div>
      <div className="flex flex-col gap-0.5" role="radiogroup" aria-label="What it carries">
        {RUN_ORDER.map((id) => {
          const r = RUN_SYSTEMS[id];
          return (
            <button
              key={id}
              role="radio"
              aria-checked={system === id}
              onClick={() => setSystem(id)}
              className={`flex items-center gap-2 rounded-sm px-1.5 py-1 text-left ${
                system === id ? 'bg-accent-soft ring-1 ring-accent' : 'hover:bg-sunken'
              }`}
            >
              <svg width="28" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="27"
                  y2="4"
                  stroke={r.color}
                  strokeWidth={r.wire ? 1.5 : 2.5}
                  strokeDasharray={r.dash.join(' ')}
                />
              </svg>
              {r.label}
            </button>
          );
        })}
      </div>
      <p className="text-muted">
        Start on a switch, socket, light, tap or fixture: the run snaps to it and stays joined when it moves. Click
        another item to finish there, or press Enter.
      </p>
    </div>
  );
}
