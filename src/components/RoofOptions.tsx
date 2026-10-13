import { useState } from 'react';
import {
  formatPitch,
  gableEdges,
  lowEdgeOf,
  MIN_SIDE_PITCH_DEG,
  readPitch,
  ROOF_KINDS,
  ROOF_OVERHANG_MM,
  withOverhang,
} from '../lib/roof/roof';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, plannerStore, usePlanner } from '../store/plannerStore';
import type { Roof, RoofKind } from '../types';
import { LengthField } from './LengthField';

const box = 'flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs';
const btn = 'm-btn px-2 py-0.5';

/** Hip, gable, shed or flat. */
function ShapeButtons({ shape, onPick }: { shape: RoofKind; onPick: (shape: RoofKind) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Roof shape">
      {ROOF_KINDS.map((k) => (
        <button key={k.id} className={btn} aria-pressed={shape === k.id} onClick={() => onPick(k.id)}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

/** A pitch in degrees or as a rise in 12 ("30", "6 in 12"); applies on Enter or when it loses focus. */
function PitchField({ id, deg, onCommit }: { id: string; deg: number; onCommit: (deg: number) => void }) {
  const shown = `${Math.round(deg * 10) / 10}°`;
  const [error, setError] = useState<string | null>(null);
  const commit = (input: HTMLInputElement) => {
    const v = readPitch(input.value);
    if (v === null) return setError('Enter degrees (e.g. 30) or a rise in 12 (e.g. 6 in 12), up to 75°.');
    setError(null);
    onCommit(v);
    input.value = `${Math.round(v * 10) / 10}°`;
  };
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-muted">
        Pitch
      </label>
      <input
        key={shown}
        id={id}
        defaultValue={shown}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget);
          if (e.key === 'Escape') {
            e.currentTarget.value = shown;
            setError(null);
          }
        }}
        aria-invalid={error !== null}
        className={`rounded-sm border p-1 tabular-nums ${error ? 'border-danger' : ''}`}
      />
      <span className="text-muted" data-testid={`${id}-rise`}>
        {formatPitch(deg)}
      </span>
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}

/** The Roof tool's settings, and a roof over the house in one click. */
export function RoofToolOptions() {
  const site = usePlanner((s) => s.site);
  const setSite = usePlanner((s) => s.setSite);
  const units = usePlanner((s) => s.units);
  const roofOverHouse = usePlanner((s) => s.roofOverHouse);
  return (
    <div className={box}>
      <div className="font-medium">New roof</div>
      <ShapeButtons shape={site.roofShape} onPick={(roofShape) => setSite({ roofShape })} />
      {site.roofShape !== 'flat' && (
        <PitchField
          id="roof-tool-pitch"
          deg={site.roofPitchDeg}
          onCommit={(roofPitchDeg) => setSite({ roofPitchDeg })}
        />
      )}
      <LengthField
        id="roof-tool-overhang"
        label="Overhang past the walls"
        mm={site.roofOverhangMm ?? ROOF_OVERHANG_MM[units]}
        units={units}
        min={0}
        onCommit={(mm) => setSite({ roofOverhangMm: Math.min(mm, 3000) })}
      />
      <button className={btn} data-testid="roof-over-house" onClick={() => roofOverHouse()}>
        Roof over the house
      </button>
      <div className="text-muted">Goes round the outside of this floor’s walls. Draw on the top floor.</div>
    </div>
  );
}

/** A roof's own settings in the Inspector: shape, pitch, overhang, thickness, gable ends and low side. */
export function RoofFields({ roof }: { roof: Roof }) {
  const units = usePlanner((s) => s.units);
  const updateElement = usePlanner((s) => s.updateElement);
  const len = (i: number) => {
    const a = roof.points[i];
    const b = roof.points[(i + 1) % roof.points.length];
    return formatLength(Math.hypot(b.x - a.x, b.y - a.y) * MM_PER_UNIT, units);
  };
  const ends = new Set(gableEdges(roof));
  const low = lowEdgeOf(roof);
  return (
    <div className="flex flex-col gap-1.5" data-testid="roof-fields">
      <ShapeButtons shape={roof.shape} onPick={(shape) => updateElement({ ...roof, shape })} />
      {roof.shape !== 'flat' && (
        <PitchField id="roof-pitch" deg={roof.pitchDeg} onCommit={(pitchDeg) => updateElement({ ...roof, pitchDeg })} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          id="roof-overhang"
          label="Overhang"
          mm={roof.overhangMm}
          units={units}
          min={0}
          onCommit={(mm) => {
            const next = withOverhang(roof, Math.min(mm, 3000));
            if (next) updateElement(next);
            else plannerStore.getState().setWarning('The roof’s outline can’t take that overhang.');
          }}
        />
        <LengthField
          id="roof-thickness"
          label="Thickness"
          mm={roof.thicknessMm}
          units={units}
          min={10}
          onCommit={(mm) => updateElement({ ...roof, thicknessMm: Math.min(mm, 1000) })}
        />
      </div>
      {roof.shape === 'gable' && (
        <div className="flex flex-col gap-1">
          <span className="text-muted">Gable ends (the rest are eaves)</span>
          <div className="flex flex-wrap gap-1">
            {roof.points.map((_, i) => (
              <button
                key={i}
                className={btn}
                aria-pressed={ends.has(i)}
                onClick={() => {
                  const next = new Set(ends);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  updateElement({ ...roof, gables: [...next].sort((a, b) => a - b) });
                }}
              >
                Side {i + 1} · {len(i)}
              </button>
            ))}
          </div>
        </div>
      )}
      {(roof.shape === 'hip' || roof.shape === 'gable') && <SidePitches roof={roof} ends={ends} len={len} />}
      {roof.shape === 'shed' && (
        <div className="flex flex-col gap-1">
          <span className="text-muted">Low side</span>
          <div className="flex flex-wrap gap-1">
            {roof.points.map((_, i) => (
              <button
                key={i}
                className={btn}
                aria-pressed={low === i}
                onClick={() => updateElement({ ...roof, lowEdge: i })}
              >
                Side {i + 1} · {len(i)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A pitch for each side of a hip or gable roof (not its gable ends): blank uses the roof's pitch. The eaves stay
 * level, so a steeper side reaches out less past the walls.
 */
function SidePitches({ roof, ends, len }: { roof: Roof; ends: Set<number>; len: (i: number) => string }) {
  const updateElement = usePlanner((s) => s.updateElement);
  const [error, setError] = useState<string | null>(null);
  const own = roof.sidePitches ?? [];
  const set = (i: number, deg: number | null) => {
    const next = roof.points.map((_, k) => (k === i ? deg : (own[k] ?? null)));
    const next2: Roof = { ...roof, sidePitches: next };
    if (next.every((v) => v === null)) delete next2.sidePitches;
    updateElement(next2);
  };
  const commit = (i: number, input: HTMLInputElement) => {
    const text = input.value.trim();
    if (!text) {
      setError(null);
      return set(i, null);
    }
    const v = readPitch(text);
    if (v === null || v < MIN_SIDE_PITCH_DEG)
      return setError(`Enter degrees (${MIN_SIDE_PITCH_DEG}° to 75°) or a rise in 12, or leave it blank.`);
    setError(null);
    set(i, Math.abs(v - roof.pitchDeg) < 0.05 ? null : v);
  };
  return (
    <div className="flex flex-col gap-1" data-testid="side-pitches">
      <span className="text-muted">Pitch per side (blank: the roof’s pitch)</span>
      <div className="grid grid-cols-2 gap-1">
        {roof.points.map((_, i) => {
          if (ends.has(i)) return null;
          const v = own[i];
          const shown = v === null || v === undefined ? '' : `${Math.round(v * 10) / 10}°`;
          return (
            <label key={i} className="flex items-center gap-1">
              <span className="w-14 shrink-0 truncate text-muted" title={len(i)}>
                Side {i + 1}
              </span>
              <input
                key={shown}
                aria-label={`Pitch of side ${i + 1}`}
                defaultValue={shown}
                placeholder={`${Math.round(roof.pitchDeg * 10) / 10}°`}
                onBlur={(e) => commit(i, e.currentTarget)}
                onKeyDown={(e) => e.key === 'Enter' && commit(i, e.currentTarget)}
                className="w-full min-w-0 rounded-sm border p-1 tabular-nums"
              />
            </label>
          );
        })}
      </div>
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
