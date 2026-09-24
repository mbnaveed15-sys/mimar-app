import { UNIT_LABELS } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { Units } from '../types';

export function SettingsPanel() {
  const units = usePlanner((s) => s.units);
  const setUnits = usePlanner((s) => s.setUnits);
  const showDimensions = usePlanner((s) => s.showDimensions);
  const setShowDimensions = usePlanner((s) => s.setShowDimensions);

  return (
    <div className="mt-2 flex flex-col gap-2 border-t pt-2 text-xs">
      <label htmlFor="units" className="font-medium">
        Units
      </label>
      <select
        id="units"
        value={units}
        onChange={(e) => setUnits(e.target.value as Units)}
        className="rounded border bg-white p-1"
      >
        {(Object.keys(UNIT_LABELS) as Units[]).map((u) => (
          <option key={u} value={u}>
            {UNIT_LABELS[u]}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2">
        <input
          id="show-dimensions"
          type="checkbox"
          checked={showDimensions}
          onChange={(e) => setShowDimensions(e.target.checked)}
        />
        Show wall dimensions
      </label>
    </div>
  );
}
