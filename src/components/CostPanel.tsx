import { useMemo, useState } from 'react';
import { COST_NOTE, costReport, materialLines } from '../lib/costReport';
import { GRADE_NAMES, inLakh, qtyText, rateOf, rupees, type Grade, type Ratios } from '../lib/estimate';
import { exportCostCsv } from '../lib/exportActions';
import { costStore, resetRates, setRate, setRatio, useCost } from '../store/costStore';
import { usePlanner } from '../store/plannerStore';

const UNIT_TEXT = { cft: 'cft', sqft: 'sqft', kg: 'kg', no: 'no.' } as const;
/** The largest rate or assumption that can be typed. */
const MAX_RATE = 1e8;

/** A rate typed in place: it takes the new value when you leave the field or press Enter. */
function RateField({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    // Blank or not a sensible amount: keep the rate as it was.
    const typed = (text ?? '').replace(/,/g, '').trim();
    const v = Number(typed);
    if (text !== null && typed !== '' && Number.isFinite(v) && v >= 0 && v <= MAX_RATE) onCommit(v);
    setText(null);
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      className="w-20 rounded-sm border p-1 text-right tabular-nums"
      value={text ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setText(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

const RATIO_FIELDS: [keyof Ratios, string][] = [
  ['bricksPerCft', 'Bricks per cft of brickwork'],
  ['steelSlab', 'Steel in slabs, kg per cft'],
  ['steelBeam', 'Steel in beams, kg per cft'],
  ['steelColumn', 'Steel in columns, kg per cft'],
  ['steelStair', 'Steel in stairs, kg per cft'],
  ['footingWidthFt', 'Foundation trench width, ft'],
  ['footingDepthFt', 'Foundation trench depth, ft'],
  ['pccFt', 'PCC bed under foundations, ft'],
];

/**
 * Bill of quantities and cost estimate: every item measured from the drawing, priced at a rate you
 * can change, the materials it takes, and a quick covered-area check.
 */
export function CostPanel() {
  // The plan as it stood before a drag in progress, so this doesn't work on every step.
  const doc = usePlanner((s) => s.batchBase ?? s.doc);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const rates = useCost((s) => s.rates);
  const ratios = useCost((s) => s.ratios);
  const grade = useCost((s) => s.grade);
  const pdfCost = useCost((s) => s.pdfCost);
  const [floor, setFloor] = useState('all');
  const report = useMemo(
    () => costReport(doc, wallHeightMm, floor, { rates, ratios, grade }),
    [doc, wallHeightMm, floor, rates, ratios, grade],
  );
  const { est, quick } = report;
  const words = inLakh(est.total);

  if (!doc.elements.length && !doc.rooms.length)
    return <div className="text-xs text-muted">Draw walls, rooms and slabs to see their quantities and cost here.</div>;

  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="cost-panel">
      <label className="flex items-center justify-between gap-2">
        Measure
        <select className="rounded-sm border p-1" value={floor} onChange={(e) => setFloor(e.target.value)}>
          <option value="all">All floors</option>
          {doc.levels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <div className="rounded-md border border-line bg-raised p-2">
        <div className="text-muted">Estimated cost</div>
        <div className="text-base font-semibold tabular-nums" data-testid="cost-total">
          {rupees(est.total)}
        </div>
        {words && <div className="text-muted">{words}</div>}
      </div>

      <ul className="flex flex-col divide-y divide-line" aria-label="Bill of quantities">
        {est.lines.map((l) => (
          <li key={l.id} className="py-1.5" data-cost-line={l.id}>
            <div>
              {l.label}
              {l.estimated && <span className="ml-1 text-muted">(estimated)</span>}
            </div>
            <div className="mt-0.5 flex items-center gap-1 tabular-nums">
              <span className="grow text-muted">
                {qtyText(l.qty)} {UNIT_TEXT[l.unit]} ×
              </span>
              <RateField
                value={rateOf(rates, l.rateKey)}
                label={`Rate for ${l.label}, rupees per ${UNIT_TEXT[l.unit]}`}
                onCommit={(v) => setRate(l.rateKey, v)}
              />
              <span className="w-24 text-right">{qtyText(Math.round(l.amount))}</span>
            </div>
          </li>
        ))}
      </ul>

      <details>
        <summary className="cursor-pointer text-muted">Materials needed</summary>
        <ul className="mt-1 flex flex-col gap-0.5" data-testid="cost-materials">
          {materialLines(est).map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </details>

      <div className="rounded-md border border-line p-2">
        <div className="mb-1 font-medium">Quick check: covered area × rate</div>
        <select
          className="mb-1 w-full rounded-sm border p-1"
          aria-label="Finish for the quick check"
          value={grade}
          onChange={(e) => costStore.setState({ grade: e.target.value as Grade })}
        >
          {(Object.keys(GRADE_NAMES) as Grade[]).map((g) => (
            <option key={g} value={g}>
              {GRADE_NAMES[g]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1 tabular-nums">
          <span className="grow text-muted">{qtyText(quick.areaSqft)} sqft ×</span>
          <RateField
            value={quick.rate}
            label="Rate per sqft of covered area"
            onCommit={(v) => setRate(`area.${grade}`, v)}
          />
          <span className="w-24 text-right" data-testid="cost-quick">
            {qtyText(Math.round(quick.amount))}
          </span>
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-muted">Assumptions</summary>
        <div className="mt-1 flex flex-col gap-1">
          {RATIO_FIELDS.map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-2">
              <span>{label}</span>
              <RateField value={ratios[key]} label={label} onCommit={(v) => setRatio(key, v)} />
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button className="m-btn" onClick={() => exportCostCsv(floor)}>
          Export CSV (Excel)
        </button>
        <button className="m-btn" onClick={resetRates} title="Put back the starter rates and assumptions">
          Starter rates
        </button>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={pdfCost} onChange={(e) => costStore.setState({ pdfCost: e.target.checked })} />
        Add to the PDF
      </label>
      <p className="text-muted">{COST_NOTE}</p>
    </div>
  );
}
