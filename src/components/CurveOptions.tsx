import { CURVE_MODES } from '../lib/curves';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { LengthField } from './LengthField';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';

/** The Curve tool's options: what it makes (walls or layout lines) and how it draws. */
export function CurvePicker() {
  const mode = usePlanner((s) => s.site.curveMode);
  const make = usePlanner((s) => s.site.curveMake);
  const setSite = usePlanner((s) => s.setSite);
  // A curve half drawn one way is dropped when the way changes.
  const drop = () => {
    const s = plannerStore.getState();
    if (s.draft?.type === 'curve') s.setDraft(null);
  };
  return (
    <div className={box} data-testid="curve-options">
      <div className="font-medium">Make</div>
      <div className="flex flex-wrap gap-1">
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={make === 'wall'}
          onClick={() => setSite({ curveMake: 'wall' })}
        >
          Walls
        </button>
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={make === 'line'}
          onClick={() => setSite({ curveMake: 'line' })}
        >
          Layout lines
        </button>
      </div>
      <div className="font-medium">Draw</div>
      <div className="flex flex-col gap-1">
        {CURVE_MODES.map((m) => (
          <button
            key={m.id}
            className="m-btn px-2 py-0.5 text-left"
            aria-pressed={mode === m.id}
            onClick={() => {
              if (m.id !== mode) drop();
              setSite({ curveMode: m.id });
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The Rectangle tool's corners: square, or rounded to a radius. */
export function RectCornerPicker() {
  const radius = usePlanner((s) => s.site.rectRadiusMm);
  const units = usePlanner((s) => s.units);
  const setSite = usePlanner((s) => s.setSite);
  const rounded = radius > 0;
  return (
    <div className={box}>
      <div className="font-medium">Corners</div>
      <div className="flex flex-wrap gap-1">
        <button className="m-btn px-2 py-0.5" aria-pressed={!rounded} onClick={() => setSite({ rectRadiusMm: 0 })}>
          Square
        </button>
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={rounded}
          onClick={() => setSite({ rectRadiusMm: rounded ? radius : units === 'metric' ? 600 : 609.6 })}
        >
          Rounded
        </button>
      </div>
      {rounded && (
        <LengthField
          id="rect-radius"
          label="Corner radius"
          mm={radius}
          units={units}
          min={50}
          onCommit={(mm) => setSite({ rectRadiusMm: mm })}
        />
      )}
    </div>
  );
}
