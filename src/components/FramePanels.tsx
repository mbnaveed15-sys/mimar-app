import { hasLintels } from '../lib/structure/lintels';
import { frameRules, lintelDepth } from '../lib/structure/settings';
import { isUntouched } from '../lib/structure/generate';
import { MM_PER_UNIT } from '../lib/scale';
import { plannerStore, usePlanner } from '../store/plannerStore';
import type { Beam, Column, Opening, Slab } from '../types';
import { LengthField } from './LengthField';

/** In a door's or window's Properties: its lintel (once the structure is generated). */
export function OpeningLintel({ opening }: { opening: Opening }) {
  const on = usePlanner((s) => hasLintels(s.doc));
  const bearing = usePlanner((s) => frameRules(s.doc).bearingMm);
  const units = usePlanner((s) => s.units);
  if (!on) return null;
  const s = plannerStore.getState();
  const off = !!opening.lintel?.off;
  return (
    <div className="flex flex-col gap-2" data-testid="opening-lintel">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={!off}
          onChange={(e) => s.setOpeningLintel(opening.id, { off: !e.target.checked })}
        />
        Lintel over it
      </label>
      {!off && (
        <div className="grid grid-cols-2 gap-2">
          <LengthField
            id="lintel-depth"
            label="Lintel depth"
            mm={opening.lintel?.depthMm ?? lintelDepth(opening.width * MM_PER_UNIT)}
            units={units}
            min={50}
            onCommit={(mm) => s.setOpeningLintel(opening.id, { depthMm: Math.min(Math.max(mm, 50), 1500) })}
          />
          <LengthField
            id="lintel-bearing"
            label="Past each side"
            mm={opening.lintel?.bearingMm ?? bearing}
            units={units}
            min={0}
            onCommit={(mm) => s.setOpeningLintel(opening.id, { bearingMm: Math.min(Math.max(mm, 0), 1000) })}
          />
        </div>
      )}
    </div>
  );
}

/** A structure item's mark, and whether Regenerate will replace it. */
export function FrameFacts({ el }: { el: Column | Beam | Slab }) {
  const units = usePlanner((s) => s.units);
  if (!el.mark && !el.auto) return null;
  const s = plannerStore.getState();
  const generated = isUntouched(el);
  return (
    <div className="flex flex-col gap-1 text-xs" data-testid="frame-facts">
      {el.mark && <div>Mark: {el.mark}</div>}
      <div className="text-muted">
        {generated
          ? 'Generated with the structure: Regenerate replaces it. Change or lock it to keep it.'
          : el.auto
            ? 'Generated, then changed: Regenerate keeps it as yours.'
            : 'Yours: Regenerate builds round it.'}
      </div>
      {el.type === 'beam' && el.topMm !== undefined && (
        <LengthField
          id="beam-top-edit"
          label="Top above its floor"
          mm={el.topMm}
          units={units}
          min={-10000}
          onCommit={(mm) => s.updateElement({ ...el, topMm: Math.round(Math.max(-10000, Math.min(mm, 30000))) })}
        />
      )}
      {el.type === 'column' && el.belowMm !== undefined && (
        <LengthField
          id="column-below-edit"
          label="Runs below its floor"
          mm={el.belowMm}
          units={units}
          min={0}
          onCommit={(mm) =>
            s.updateElement({ ...el, belowMm: Math.round(Math.max(0, Math.min(mm, 10000))) || undefined })
          }
        />
      )}
      {el.type === 'slab' && el.footing && (
        <LengthField
          id="footing-below-edit"
          label="Its top below the floor"
          mm={el.belowMm ?? 0}
          units={units}
          min={0}
          onCommit={(mm) => s.updateElement({ ...el, belowMm: Math.round(Math.max(0, Math.min(mm, 10000))) })}
        />
      )}
    </div>
  );
}
