import { RUN_ORDER, RUN_SYSTEMS, runLength } from '../lib/services';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT } from '../store/plannerStore';
import type { PlanElement, ServiceRun, Units } from '../types';

/** A selected wire or pipe: what it carries, its size, curved or straight, and how long it is. */
export function RunFields({
  run,
  units,
  onChange,
}: {
  run: ServiceRun;
  units: Units;
  onChange: (el: PlanElement) => void;
}) {
  const sys = RUN_SYSTEMS[run.system];
  const size = run.sizeMm ?? sys.sizeMm;
  return (
    <>
      <div className="flex flex-col gap-0.5">
        <label htmlFor="run-system" className="text-muted">
          Carries
        </label>
        <select
          id="run-system"
          value={run.system}
          onChange={(e) => {
            const system = e.currentTarget.value as ServiceRun['system'];
            onChange({ ...run, system, sizeMm: undefined });
          }}
          className="rounded-sm border p-1"
        >
          {RUN_ORDER.map((id) => (
            <option key={id} value={id}>
              {RUN_SYSTEMS[id].label}
            </option>
          ))}
        </select>
      </div>
      {sys.sizeMm > 0 && (
        <div className="flex flex-col gap-0.5">
          <label htmlFor="run-size" className="text-muted">
            {sys.wire ? 'Wire size (mm²)' : 'Pipe size (mm across)'}
          </label>
          <input
            key={size}
            id="run-size"
            type="number"
            min={0.5}
            max={1000}
            step={sys.wire ? 0.5 : 1}
            defaultValue={size}
            onBlur={(e) => {
              const v = Number(e.currentTarget.value);
              if (Number.isFinite(v) && v >= 0.5 && v <= 1000 && v !== size)
                onChange({ ...run, sizeMm: v === sys.sizeMm ? undefined : v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className="w-24 rounded-sm border p-1 tabular-nums"
          />
        </div>
      )}
      {sys.wire && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!run.straight}
            onChange={(e) => onChange({ ...run, straight: e.currentTarget.checked || undefined })}
          />
          Draw straight (wires are drawn curved)
        </label>
      )}
      <div>Length on plan: {formatLength(runLength(run) * MM_PER_UNIT, units)}</div>
      <div className="text-muted">
        {run.from || run.to
          ? 'Its joined ends follow their items when they move.'
          : 'Not joined to an item: drag an end onto one, or draw it again from the item.'}
      </div>
    </>
  );
}
