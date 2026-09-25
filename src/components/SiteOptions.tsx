import { usePlanner, type SiteSpec } from '../store/plannerStore';
import { LengthField } from './LengthField';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';

const WALL_KINDS: { id: SiteSpec['wallKind']; label: string }[] = [
  { id: 'normal', label: 'Wall' },
  { id: 'boundary', label: 'Boundary 7′' },
  { id: 'parapet', label: 'Parapet 3′' },
];

const STAIR_SHAPES: { id: SiteSpec['stairShape']; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'L', label: 'L-shaped' },
  { id: 'U', label: 'U-shaped' },
  { id: 'ramp', label: 'Ramp' },
];

/** Type of new walls: ordinary, a boundary wall or a parapet. */
export function WallKindPicker() {
  const kind = usePlanner((s) => s.site.wallKind);
  const setSite = usePlanner((s) => s.setSite);
  return (
    <div className={box}>
      <div className="font-medium">New wall type</div>
      <div className="flex flex-wrap gap-1">
        {WALL_KINDS.map((k) => (
          <button
            key={k.id}
            className="m-btn px-2 py-0.5"
            aria-pressed={kind === k.id}
            onClick={() => setSite({ wallKind: k.id })}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Options for the Plot, Stairs and Door tools. */
export function SiteOptions() {
  const tool = usePlanner((s) => s.tool);
  const site = usePlanner((s) => s.site);
  const setSite = usePlanner((s) => s.setSite);
  const units = usePlanner((s) => s.units);

  if (tool === 'plot')
    return (
      <div className={box}>
        <div className="font-medium">Setbacks</div>
        <div className="grid grid-cols-3 gap-2">
          {(['front', 'rear', 'sides'] as const).map((side) => (
            <LengthField
              key={side}
              id={`setback-${side}`}
              label={side === 'front' ? 'Front' : side === 'rear' ? 'Rear' : 'Sides'}
              mm={site.setbacks[side]}
              units={units}
              min={0}
              onCommit={(v) => setSite({ setbacks: { ...site.setbacks, [side]: v } })}
            />
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={site.boundaryWall}
            onChange={(e) => setSite({ boundaryWall: e.target.checked })}
          />
          Boundary wall round the plot
        </label>
        <div className="text-muted">Check the setbacks against your housing society&apos;s bylaws.</div>
      </div>
    );
  if (tool === 'stairs')
    return (
      <div className={box}>
        <div className="font-medium">New stair</div>
        <div className="flex flex-wrap gap-1">
          {STAIR_SHAPES.map((sh) => (
            <button
              key={sh.id}
              className="m-btn px-2 py-0.5"
              aria-pressed={site.stairShape === sh.id}
              onClick={() => setSite({ stairShape: sh.id, climb: sh.id === 'ramp' ? 'plinth' : site.climb })}
            >
              {sh.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="stair-width"
            label="Width"
            mm={site.stairWidthMm}
            units={units}
            min={600}
            onCommit={(v) => setSite({ stairWidthMm: v })}
          />
          {site.stairShape !== 'ramp' && (
            <LengthField
              id="stair-tread"
              label="Tread"
              mm={site.treadMm}
              units={units}
              min={200}
              onCommit={(v) => setSite({ treadMm: v })}
            />
          )}
        </div>
        <div className="flex gap-1">
          <button
            className="m-btn px-2 py-0.5"
            aria-pressed={site.climb === 'floor'}
            onClick={() => setSite({ climb: 'floor' })}
          >
            Up a floor
          </button>
          <button
            className="m-btn px-2 py-0.5"
            aria-pressed={site.climb === 'plinth'}
            onClick={() => setSite({ climb: 'plinth' })}
          >
            Up the plinth
          </button>
        </div>
      </div>
    );
  if (tool === 'door')
    return (
      <div className={box}>
        <div className="font-medium">Place a</div>
        <div className="flex gap-1">
          <button className="m-btn px-2 py-0.5" aria-pressed={!site.gate} onClick={() => setSite({ gate: false })}>
            Door
          </button>
          <button className="m-btn px-2 py-0.5" aria-pressed={site.gate} onClick={() => setSite({ gate: true })}>
            Gate
          </button>
        </div>
        {site.gate && (
          <LengthField
            id="gate-width"
            label="Gate width"
            mm={site.gateWidthMm}
            units={units}
            min={600}
            onCommit={(v) => setSite({ gateWidthMm: v })}
          />
        )}
      </div>
    );
  return null;
}
