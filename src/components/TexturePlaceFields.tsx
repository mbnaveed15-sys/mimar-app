import type { TexturePlace, Units } from '../types';
import { LengthField } from './LengthField';

/** Where the material's texture sits on one item in 3D: centred on it, and shifted across and up. */
export function TexturePlaceFields({
  place,
  units,
  onChange,
}: {
  place?: TexturePlace;
  units: Units;
  onChange: (place: TexturePlace | undefined) => void;
}) {
  const set = (patch: Partial<TexturePlace>) => {
    const next = { ...place, ...patch };
    const kept: TexturePlace = {
      ...(next.centre && { centre: true }),
      ...(next.scale && next.scale !== 1 && { scale: next.scale }),
      ...(next.xMm && { xMm: next.xMm }),
      ...(next.yMm && { yMm: next.yMm }),
    };
    onChange(Object.keys(kept).length ? kept : undefined);
  };
  return (
    <fieldset className="flex flex-col gap-1 rounded-sm border border-line p-1.5">
      <legend className="px-1 text-muted">Texture in 3D</legend>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label="Centre texture"
          checked={!!place?.centre}
          onChange={(e) => set({ centre: e.target.checked })}
        />
        Centre a whole tile on it
      </label>
      <label className="flex items-center gap-2">
        <span className="text-muted">Size</span>
        <input
          key={place?.scale ?? 1}
          type="number"
          aria-label="Texture size percent"
          min={5}
          max={2000}
          step={5}
          defaultValue={Math.round((place?.scale ?? 1) * 100)}
          onBlur={(e) => {
            const pct = Number(e.currentTarget.value);
            if (Number.isFinite(pct) && pct >= 5 && pct <= 2000) set({ scale: pct / 100 });
            else e.currentTarget.value = String(Math.round((place?.scale ?? 1) * 100));
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-20 rounded-sm border p-1"
        />
        <span className="text-muted">% of the material's size</span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          id="tex-shift-x"
          label="Shift across"
          mm={place?.xMm ?? 0}
          units={units}
          min={-100000}
          onCommit={(mm) => set({ xMm: Math.min(mm, 100000) })}
        />
        <LengthField
          id="tex-shift-y"
          label="Shift up"
          mm={place?.yMm ?? 0}
          units={units}
          min={-100000}
          onCommit={(mm) => set({ yMm: Math.min(mm, 100000) })}
        />
      </div>
      {place && (
        <button className="m-btn self-start" onClick={() => onChange(undefined)}>
          Reset texture
        </button>
      )}
    </fieldset>
  );
}
