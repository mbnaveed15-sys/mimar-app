import { MARLA_OPTIONS, UNIT_LABELS } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { MarlaSqFt, PaperSize, Units } from '../types';
import { LengthField } from './LengthField';

/** Which way north points on the plan (for the PDF's north arrow). */
const NORTH = [
  { deg: 0, label: 'Up the page' },
  { deg: 45, label: 'Up and right' },
  { deg: 90, label: 'Right' },
  { deg: 135, label: 'Down and right' },
  { deg: 180, label: 'Down the page' },
  { deg: 225, label: 'Down and left' },
  { deg: 270, label: 'Left' },
  { deg: 315, label: 'Up and left' },
];

export function SettingsPanel() {
  const pdfCheck = usePlanner((s) => s.pdfCheck);
  const showHints = usePlanner((s) => s.showHints);
  const pdfHints = usePlanner((s) => s.pdfHints);
  const northDeg = usePlanner((s) => s.doc.northDeg ?? 0);
  const setNorthDeg = usePlanner((s) => s.setNorthDeg);
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
      <label htmlFor="north" className="font-medium">
        North points
      </label>
      <select
        id="north"
        value={NORTH.some((n) => n.deg === northDeg) ? northDeg : 'other'}
        onChange={(e) => setNorthDeg(Number(e.target.value))}
        className="rounded-sm border p-1"
      >
        {NORTH.map((n) => (
          <option key={n.deg} value={n.deg}>
            {n.label}
          </option>
        ))}
        {!NORTH.some((n) => n.deg === northDeg) && <option value="other">{northDeg}°</option>}
      </select>
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
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showHints} onChange={(e) => setLayer('showHints', e.target.checked)} />
        Show plan hints (good-practice advice)
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={pdfHints}
          disabled={!showHints}
          onChange={(e) => setLayer('pdfHints', e.target.checked)}
        />
        Add the plan hints to PDFs
      </label>
    </div>
  );
}
