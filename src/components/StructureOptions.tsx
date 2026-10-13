import { MM_PER_UNIT, usePlanner, type SlabMode } from '../store/plannerStore';
import { LengthField } from './LengthField';

const INCH = 25.4;
/** Common column sizes (inches); round ones are by diameter. */
const COLUMN_PRESETS = [
  { label: '9" × 12"', shape: 'rect', w: 9, h: 12 },
  { label: '12" × 12"', shape: 'rect', w: 12, h: 12 },
  { label: '12" × 18"', shape: 'rect', w: 12, h: 18 },
  { label: '⌀ 12"', shape: 'round', w: 12, h: 12 },
  { label: '⌀ 18"', shape: 'round', w: 18, h: 18 },
] as const;

/** The ways the Slab tool draws. */
const SLAB_MODES: { id: SlabMode; label: string; title: string }[] = [
  { id: 'rect', label: 'Rectangle', title: 'Drag a rectangle, or click inside walls to cover that room' },
  { id: 'corners', label: 'Corner by corner', title: 'Click the corners of any shape' },
  { id: 'rooms', label: 'Rooms', title: 'Click the rooms to cover, then press Enter: one slab over them all' },
  { id: 'walls', label: 'Follow the walls', title: 'One click covers the walls round it, whatever their shape' },
];

/** Size of new columns, beams or slabs, shown while their tool is active. */
export function StructureOptions() {
  const tool = usePlanner((s) => s.tool);
  const spec = usePlanner((s) => s.structure);
  const setSpec = usePlanner((s) => s.setStructure);
  const setDraft = usePlanner((s) => s.setDraft);
  const units = usePlanner((s) => s.units);
  const mm = (u: number) => u * MM_PER_UNIT;
  const u = (mmValue: number) => mmValue / MM_PER_UNIT;
  const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';

  if (tool === 'column')
    return (
      <div className={box}>
        <div className="font-medium">New column size</div>
        <div className="flex flex-wrap gap-1">
          {COLUMN_PRESETS.map((p) => {
            const on =
              spec.columnShape === p.shape &&
              Math.abs(mm(spec.columnW) - p.w * INCH) < 1 &&
              (p.shape === 'round' || Math.abs(mm(spec.columnH) - p.h * INCH) < 1);
            return (
              <button
                key={p.label}
                className="m-btn px-2 py-0.5"
                aria-pressed={on}
                onClick={() => setSpec({ columnShape: p.shape, columnW: u(p.w * INCH), columnH: u(p.h * INCH) })}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="column-w"
            label={spec.columnShape === 'round' ? 'Diameter' : 'Width'}
            mm={mm(spec.columnW)}
            units={units}
            min={50}
            onCommit={(v) => setSpec({ columnW: u(v) })}
          />
          {spec.columnShape === 'rect' && (
            <LengthField
              id="column-h"
              label="Depth"
              mm={mm(spec.columnH)}
              units={units}
              min={50}
              onCommit={(v) => setSpec({ columnH: u(v) })}
            />
          )}
        </div>
      </div>
    );
  if (tool === 'beam')
    return (
      <div className={box}>
        <div className="font-medium">New beam size</div>
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="beam-width"
            label="Width"
            mm={mm(spec.beamWidth)}
            units={units}
            min={50}
            onCommit={(v) => setSpec({ beamWidth: u(v) })}
          />
          <LengthField
            id="beam-depth"
            label="Depth below slab"
            mm={mm(spec.beamDepth)}
            units={units}
            min={50}
            onCommit={(v) => setSpec({ beamDepth: u(v) })}
          />
        </div>
      </div>
    );
  if (tool === 'slab')
    return (
      <div className={box}>
        <div className="font-medium">New slab</div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Slab shape">
          {SLAB_MODES.map((m) => (
            <button
              key={m.id}
              className="m-btn px-2 py-0.5"
              aria-pressed={spec.slabMode === m.id}
              title={m.title}
              onClick={() => {
                setSpec({ slabMode: m.id });
                setDraft(null);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <LengthField
          id="slab-thickness"
          label="Thickness"
          mm={mm(spec.slabThickness)}
          units={units}
          min={50}
          onCommit={(v) => setSpec({ slabThickness: u(v) })}
        />
      </div>
    );
  return null;
}
