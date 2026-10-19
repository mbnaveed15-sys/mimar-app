import { CURVE_MODES } from '../lib/curves';
import { plannerStore, usePlanner, type DimMode } from '../store/plannerStore';
import { LengthField } from './LengthField';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';

/** The Curve tool's options: what it makes (walls, layout lines or a path) and how it draws. */
export function CurvePicker() {
  const mode = usePlanner((s) => s.site.curveMode);
  const make = usePlanner((s) => s.site.curveMake);
  const pathWidth = usePlanner((s) => s.site.pathWidthMm);
  const units = usePlanner((s) => s.units);
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
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={make === 'path'}
          onClick={() => setSite({ curveMake: 'path' })}
        >
          Path or driveway
        </button>
      </div>
      {make === 'path' && (
        <>
          <LengthField
            id="path-width"
            label="Width"
            mm={pathWidth}
            units={units}
            min={300}
            onCommit={(mm) => setSite({ pathWidthMm: Math.min(mm, 15000) })}
          />
          <div className="text-muted">Draw along the middle of the path. A 10' width suits a driveway.</div>
        </>
      )}
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
  const porch = usePlanner((s) => !!s.site.rectPorch);
  const rounded = radius > 0;
  return (
    <div className={box}>
      <div className="font-medium">Makes</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="The Rectangle tool makes">
        <button className="m-btn px-2 py-0.5" aria-pressed={!porch} onClick={() => setSite({ rectPorch: false })}>
          Room with walls
        </button>
        <button className="m-btn px-2 py-0.5" aria-pressed={porch} onClick={() => setSite({ rectPorch: true })}>
          Car porch
        </button>
      </div>
      {porch && (
        <div className="text-muted">
          Draw it over the driveway: a roof slab on columns, open on its sides. It may stand in the side setback.
        </div>
      )}
      {!porch && <div className="font-medium">Corners</div>}
      <div className="flex flex-wrap gap-1" hidden={porch}>
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
      {rounded && !porch && (
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

const DIM_MODES: { id: DimMode; label: string; note: string }[] = [
  { id: 'linear', label: 'Horizontal / vertical', note: 'Up or down for horizontal, sideways for vertical.' },
  { id: 'aligned', label: 'Aligned', note: 'Along the two points, at any angle.' },
  { id: 'radius', label: 'Radius', note: 'Click a curved wall or curved layout line.' },
];

/** The Dimension tool's options: how it measures, and whether dimensions carry on in a chain. */
export function DimensionPicker() {
  const mode = usePlanner((s) => s.site.dimMode);
  const chain = usePlanner((s) => s.site.dimChain);
  const setSite = usePlanner((s) => s.setSite);
  const drop = () => {
    const s = plannerStore.getState();
    if (s.draft?.type === 'dimension') s.setDraft(null);
  };
  return (
    <div className={box} data-testid="dimension-options">
      <div className="font-medium">Measure</div>
      <div className="flex flex-col gap-1">
        {DIM_MODES.map((m) => (
          <button
            key={m.id}
            className="m-btn px-2 py-0.5 text-left"
            aria-pressed={mode === m.id}
            title={m.note}
            onClick={() => {
              if (m.id !== mode) drop();
              setSite({ dimMode: m.id });
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="text-muted">{DIM_MODES.find((m) => m.id === mode)?.note}</div>
      {mode !== 'radius' && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={chain}
            onChange={(e) => {
              drop();
              setSite({ dimChain: e.currentTarget.checked });
            }}
          />
          Chain: each click carries on from the last dimension
        </label>
      )}
      <div className="text-muted">
        Dimensions drawn on walls, corners and items follow them as the plan changes. They print in the PDF and go into
        the DXF.
      </div>
    </div>
  );
}
