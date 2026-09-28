import { usePlanner } from '../store/plannerStore';
import { projectOf } from '../lib/project';
import { METRIC_WALL_PRESETS_MM, WALL_PRESETS_MM } from '../walls';
import { LengthField } from './LengthField';

/** Thickness for new walls: common brick sizes, plus a custom size in Pro mode. */
export function WallThicknessPicker() {
  const units = usePlanner((s) => s.units);
  const mode = usePlanner((s) => s.mode);
  const house = usePlanner((s) => projectOf(s.doc).type === 'house');
  const presets = !house && units === 'metric' ? METRIC_WALL_PRESETS_MM : WALL_PRESETS_MM[units];
  const thickness = usePlanner((s) => s.wallThicknessMm);
  const setThickness = usePlanner((s) => s.setWallThicknessMm);

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs">
      <div className="font-medium">New wall thickness</div>
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.mm}
            onClick={() => setThickness(p.mm)}
            aria-pressed={Math.abs(thickness - p.mm) < 1}
            className="m-btn px-2 py-0.5"
          >
            {p.label}
          </button>
        ))}
      </div>
      {mode === 'pro' && (
        <LengthField
          id="new-wall-thickness"
          label="Custom"
          mm={thickness}
          units={units}
          min={25}
          onCommit={(mm) => setThickness(Math.min(mm, 1000))}
        />
      )}
    </div>
  );
}
