import { CLADDING, CLADDING_KINDS, cladable, claddingMm, claddingSide, outsideSide } from '../lib/cladding';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { wallsOf } from '../walls';
import type { CladdingKind, Wall } from '../types';
import { LengthField } from './LengthField';

/** A wall's cladding in its Properties: the kind, its thickness, and which face (the selected walls together). */
export function WallCladding({ wall }: { wall: Wall }) {
  const units = usePlanner((s) => s.units);
  const selected = usePlanner((s) => s.selectedIds);
  const doc = usePlanner((s) => s.doc);
  const walls = wallsOf(doc.elements);
  if (!cladable(wall)) return null;
  const s = plannerStore.getState();
  // Several walls picked: the change goes to each of them that can be clad.
  const ids = selected.includes(wall.id)
    ? walls.filter((w) => selected.includes(w.id) && cladable(w)).map((w) => w.id)
    : [wall.id];
  const c = wall.cladding;
  const side = claddingSide(wall, walls);
  const outside = outsideSide(wall, walls);
  return (
    <div className="flex flex-col gap-1" data-testid="wall-cladding">
      <label className="flex items-center justify-between gap-2">
        Cladding
        <select
          id="wall-cladding-kind"
          className="rounded-sm border p-1"
          value={c?.kind ?? ''}
          onChange={(e) =>
            s.setWallCladding(
              ids,
              e.target.value ? { kind: e.target.value as CladdingKind, thicknessMm: undefined } : null,
            )
          }
        >
          <option value="">None</option>
          {CLADDING_KINDS.map((k) => (
            <option key={k} value={k}>
              {CLADDING[k].name}
            </option>
          ))}
        </select>
      </label>
      {c && (
        <div className="flex flex-wrap items-center gap-2">
          <LengthField
            id="wall-cladding-thickness"
            label="Thickness"
            mm={claddingMm(c)}
            units={units}
            min={5}
            onCommit={(mm) => s.setWallCladding(ids, { thicknessMm: Math.min(Math.max(Math.round(mm), 5), 300) })}
          />
          <span className="text-muted">
            {side === outside ? 'On the outside face' : outside ? 'On the inside face' : `On side ${side}`}
          </span>
          <button
            className="m-btn px-2 py-0.5"
            title="Put the cladding on the wall's other face"
            onClick={() => s.setWallCladding([wall.id], { side: side === 'A' ? 'B' : 'A' })}
          >
            Flip face
          </button>
        </div>
      )}
    </div>
  );
}
