import {
  DOOR_KIND_NAMES,
  DOOR_KINDS,
  DOOR_WIDTH_MM,
  WINDOW_KIND_NAMES,
  WINDOW_KINDS,
  WINDOW_SIZE_MM,
} from '../lib/openingKinds';
import { projectOf, shows } from '../lib/project';
import { WINDOW_HEIGHT_MM } from '../lib/shapes';
import { WINDOW_SILL_MM } from '../three/model';
import { plannerStore, usePlanner, type SiteSpec } from '../store/plannerStore';
import { LengthField } from './LengthField';
import { AuthoritySelect, PlotPresets } from './PlotBylaws';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';

const WALL_KINDS: { id: SiteSpec['wallKind']; label: string }[] = [
  { id: 'normal', label: 'Wall' },
  { id: 'boundary', label: 'Boundary 7′' },
  { id: 'parapet', label: 'Parapet 3′' },
  { id: 'retaining', label: 'Retaining (basement)' },
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

/** While copies of a picked-up or pasted door or window are being placed: say so, with a way out. */
function PickedUp() {
  const stamp = usePlanner((s) => s.openingStamp);
  const queue = usePlanner((s) => s.stampQueue);
  const setOpeningStamp = usePlanner((s) => s.setOpeningStamp);
  const setTool = usePlanner((s) => s.setTool);
  if (!stamp.length) return null;
  const noun = stamp[0].gate ? 'gate' : stamp[0].type;
  return (
    <div className="flex items-center justify-between gap-2 rounded-sm bg-canvas p-1.5" data-testid="picked-up">
      <span>
        {queue
          ? `Placing the pasted ${noun}${stamp.length > 1 ? ` (${stamp.length} to go)` : ''}.`
          : `Placing copies of the ${noun} picked up.`}
      </span>
      <button className="m-btn px-2 py-0.5" onClick={() => (queue ? setTool('select') : setOpeningStamp([]))}>
        Stop
      </button>
    </div>
  );
}

/** Options for the Plot, Stairs, Door and Window tools. */
export function SiteOptions() {
  const tool = usePlanner((s) => s.tool);
  const site = usePlanner((s) => s.site);
  const setSite = usePlanner((s) => s.setSite);
  const units = usePlanner((s) => s.units);
  const bylaws = usePlanner((s) => shows(s.doc, 'bylaws'));
  const house = usePlanner((s) => projectOf(s.doc).type === 'house');

  if (tool === 'plot')
    return (
      <div className={box}>
        <div className="font-medium">New plot</div>
        <div className="flex flex-col gap-1">
          <span className="text-muted">Draw it as</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Plot shape">
            {(
              [
                ['rect', 'Rectangle'],
                ['any', 'Any shape'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className="m-btn px-2 py-0.5"
                aria-pressed={site.plotShape === id && !site.plotSize}
                onClick={() => {
                  setSite({ plotShape: id, plotSize: undefined });
                  plannerStore.getState().setDraft(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {site.plotShape === 'any' && !site.plotSize && (
            <div className="text-muted">
              Click each corner; start with the two ends of the road side. Click the first corner or press Enter to
              finish.
            </div>
          )}
        </div>
        {bylaws && (
          <AuthoritySelect
            id="site-authority"
            value={site.authority}
            onChange={(authority) => setSite({ authority })}
          />
        )}
        {house && <PlotPresets />}
        {bylaws && site.authority ? (
          <div className="text-muted">Setbacks come from the bylaws table for the plot's size.</div>
        ) : (
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
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={site.boundaryWall}
            onChange={(e) => setSite({ boundaryWall: e.target.checked })}
          />
          Boundary wall round the plot
        </label>
        <div className="text-muted">
          The Plan check (in the panel below) tests the plan against the bylaws you pick.
        </div>
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
  if (tool === 'window') {
    const size = WINDOW_SIZE_MM[site.windowKind];
    return (
      <div className={box}>
        <div className="font-medium">Window type</div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Window type">
          {WINDOW_KINDS.map((k) => (
            <button
              key={k}
              className="m-btn px-2 py-0.5"
              aria-pressed={site.windowKind === k}
              // A new type brings its own size.
              onClick={() =>
                setSite({ windowKind: k, windowWidthMm: undefined, windowSillMm: undefined, windowHeightMm: undefined })
              }
            >
              {WINDOW_KIND_NAMES[k]}
            </button>
          ))}
        </div>
        {site.windowKind === 'vent' && (
          <div className="text-muted">Small and high (sill 6'): for baths and kitchens.</div>
        )}
        <div className="grid grid-cols-3 gap-2">
          <LengthField
            id="new-window-width"
            label="Width"
            mm={site.windowWidthMm ?? size.width}
            units={units}
            min={150}
            onCommit={(v) => setSite({ windowWidthMm: Math.min(v, 6000) })}
          />
          <LengthField
            id="new-window-sill"
            label="Sill"
            mm={site.windowSillMm ?? size.sillMm ?? WINDOW_SILL_MM}
            units={units}
            min={0}
            onCommit={(v) => setSite({ windowSillMm: Math.min(v, 3000) })}
          />
          <LengthField
            id="new-window-height"
            label="Height"
            mm={site.windowHeightMm ?? size.heightMm ?? WINDOW_HEIGHT_MM}
            units={units}
            min={50}
            onCommit={(v) => setSite({ windowHeightMm: Math.min(v, 10000) })}
          />
        </div>
        <PickedUp />
        <div className="text-muted">
          Alt-click a window to place copies of it. Type a distance to set it from the corner.
        </div>
      </div>
    );
  }
  if (tool === 'door')
    return (
      <div className={box}>
        <div className="font-medium">Door type</div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Door type">
          {DOOR_KINDS.map((k) => (
            <button
              key={k}
              className="m-btn px-2 py-0.5"
              aria-pressed={!site.gate && site.doorKind === k}
              onClick={() => setSite({ gate: false, doorKind: k, doorWidthMm: undefined })}
            >
              {DOOR_KIND_NAMES[k]}
            </button>
          ))}
          <button className="m-btn px-2 py-0.5" aria-pressed={site.gate} onClick={() => setSite({ gate: true })}>
            Gate
          </button>
        </div>
        {site.gate ? (
          <LengthField
            id="gate-width"
            label="Gate width"
            mm={site.gateWidthMm}
            units={units}
            min={600}
            onCommit={(v) => setSite({ gateWidthMm: Math.min(v, 12000) })}
          />
        ) : (
          <LengthField
            id="new-door-width"
            label="Width"
            mm={site.doorWidthMm ?? DOOR_WIDTH_MM[site.doorKind]}
            units={units}
            min={300}
            onCommit={(v) => setSite({ doorWidthMm: Math.min(v, 6000) })}
          />
        )}
        <div className="flex flex-col gap-1">
          <div className="text-muted">Hinge, seen from the side it opens into (V flips it)</div>
          <div className="flex gap-1" role="group" aria-label="Hinge side">
            {(['left', 'right'] as const).map((hand) => (
              <button
                key={hand}
                className="m-btn px-2 py-0.5"
                aria-pressed={site.doorHand === hand}
                onClick={() => setSite({ doorHand: hand })}
              >
                {hand === 'left' ? 'Left' : 'Right'}
              </button>
            ))}
          </div>
        </div>
        <PickedUp />
        <div className="text-muted">
          It opens towards the side the pointer is on. Alt-click a door to place copies of it; type a distance to set it
          from the corner.
        </div>
      </div>
    );
  return null;
}
