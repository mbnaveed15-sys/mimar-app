import { MARLA_OPTIONS, UNIT_LABELS } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { MarlaSqFt, PaperSize, Units } from '../types';

export function SettingsPanel() {
  const units = usePlanner((s) => s.units);
  const setUnits = usePlanner((s) => s.setUnits);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);
  const setMarlaSqFt = usePlanner((s) => s.setMarlaSqFt);
  const paper = usePlanner((s) => s.paper);
  const setPaper = usePlanner((s) => s.setPaper);

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

      <label htmlFor="marla-size" className="font-medium">
        Marla size
      </label>
      <select
        id="marla-size"
        value={marlaSqFt}
        onChange={(e) => setMarlaSqFt(Number(e.target.value) as MarlaSqFt)}
        className="rounded border bg-white p-1"
      >
        {MARLA_OPTIONS.map((o) => (
          <option key={o.sqft} value={o.sqft}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor="paper-size" className="font-medium">
        PDF paper size
      </label>
      <select
        id="paper-size"
        value={paper}
        onChange={(e) => setPaper(e.target.value as PaperSize)}
        className="rounded border bg-white p-1"
      >
        <option value="A4">A4</option>
        <option value="A3">A3</option>
      </select>
    </div>
  );
}
