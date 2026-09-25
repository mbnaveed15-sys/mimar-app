import { MARLA_OPTIONS, UNIT_LABELS } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { MarlaSqFt, PaperSize, Units } from '../types';
import { LengthField } from './LengthField';

export function SettingsPanel() {
  const pdfCheck = usePlanner((s) => s.pdfCheck);
  const setLayer = usePlanner((s) => s.setLayer);
  const units = usePlanner((s) => s.units);
  const setUnits = usePlanner((s) => s.setUnits);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);
  const setMarlaSqFt = usePlanner((s) => s.setMarlaSqFt);
  const paper = usePlanner((s) => s.paper);
  const setPaper = usePlanner((s) => s.setPaper);
  const plinthMm = usePlanner((s) => s.doc.plinthMm);
  const setPlinthMm = usePlanner((s) => s.setPlinthMm);

  return (
    <div className="flex flex-col gap-2 text-xs">
      <label htmlFor="units" className="font-medium">
        Units
      </label>
      <select
        id="units"
        value={units}
        onChange={(e) => setUnits(e.target.value as Units)}
        className="rounded-sm border p-1"
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
        className="rounded-sm border p-1"
      >
        {MARLA_OPTIONS.map((o) => (
          <option key={o.sqft} value={o.sqft}>
            {o.label}
          </option>
        ))}
      </select>
      <LengthField
        id="plinth-height"
        label="Plinth height (floor above ground)"
        mm={plinthMm}
        units={units}
        min={0}
        onCommit={(mm) => setPlinthMm(mm)}
      />
      <label htmlFor="paper-size" className="font-medium">
        PDF paper size
      </label>
      <select
        id="paper-size"
        value={paper}
        onChange={(e) => setPaper(e.target.value as PaperSize)}
        className="rounded-sm border p-1"
      >
        <option value="A4">A4</option>
        <option value="A3">A3</option>
      </select>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={pdfCheck} onChange={(e) => setLayer('pdfCheck', e.target.checked)} />
        Add the plan check page to PDFs
      </label>
    </div>
  );
}
