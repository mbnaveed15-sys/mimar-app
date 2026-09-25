import { AUTHORITIES, plotMeasures, plotRule, plotSetbacks, type AuthorityId } from '../lib/bylaws';
import { usePlanner } from '../store/plannerStore';
import type { Plot } from '../types';
import { LengthField } from './LengthField';

/** Choose which bylaws apply (or none, for your own setbacks). */
export function AuthoritySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AuthorityId | undefined;
  onChange: (authority: AuthorityId | undefined) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-muted">
        Bylaws
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value || undefined) as AuthorityId | undefined)}
        className="rounded-sm border p-1"
      >
        <option value="">None (my own setbacks)</option>
        {AUTHORITIES.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
            {a.status === 'provisional' ? ' (provisional)' : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Plot sizes to start from for the chosen authority: the next click places one. */
export function PlotPresets() {
  const site = usePlanner((s) => s.site);
  const setSite = usePlanner((s) => s.setSite);
  const authority = AUTHORITIES.find((a) => a.id === site.authority);
  const presets = authority?.presets ?? AUTHORITIES[0].presets;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted">Plot size (then click to place it)</span>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Plot size">
        {presets.map((p) => {
          const on = site.plotSize?.w === p.w && site.plotSize?.d === p.d;
          return (
            <button
              key={p.label}
              className="m-btn px-2 py-0.5"
              aria-pressed={on}
              onClick={() => setSite({ plotSize: on ? undefined : { w: p.w, d: p.d } })}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A plot's bylaws, its kind of plot and setbacks (with where each comes from), in the Properties panel. */
export function PlotBylawsPanel({ plot }: { plot: Plot }) {
  const units = usePlanner((s) => s.units);
  const updateElement = usePlanner((s) => s.updateElement);
  const setPlotAuthority = usePlanner((s) => s.setPlotAuthority);
  const found = plotRule(plot);
  const rule = found?.rule;
  const { areaSqFt, frontageFt } = plotMeasures(plot);
  const sb = plot.setbacks;
  const fromRule = rule ? plotSetbacks(rule) : null;
  const swapped = rule ? plotSetbacks(rule, true) : null;
  const same = (a: Plot['setbacks'] | null) =>
    !!a &&
    (['front', 'rear', 'sides'] as const).every((k) => Math.abs(a[k] - sb[k]) < 1) &&
    Math.abs((a.side2 ?? a.sides) - (sb.side2 ?? sb.sides)) < 1;
  const followsRule = same(fromRule) || same(swapped);

  return (
    <div className="flex flex-col gap-2" data-testid="plot-bylaws">
      <AuthoritySelect id="plot-authority" value={plot.authority} onChange={(a) => setPlotAuthority(plot.id, a)} />
      <div className="text-muted tabular-nums">
        {Math.round(areaSqFt).toLocaleString('en-US')} sq ft ({Math.round(areaSqFt / 9)} sq yd),{' '}
        {Math.round(frontageFt)}' along the road
      </div>
      {found && (
        <div className="rounded-sm border border-line p-1.5">
          <div className="font-medium" data-testid="plot-rule">
            {rule ? rule.label : 'No row in the table fits this plot'}
            {found.authority.status === 'provisional' && (
              <span className="ml-1 rounded-sm bg-sunken px-1 text-[10px] text-muted">provisional</span>
            )}
          </div>
          <div className="text-muted">
            {found.authority.setbackClause !== 'summary' ? `${found.authority.setbackClause} · ` : ''}
            {found.authority.source}
          </div>
          {rule?.check && <div className="mt-1 text-danger">Check: {rule.check}</div>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['front', 'Front'],
            ['rear', 'Rear'],
            ['sides', 'Side 1'],
            ['side2', 'Side 2'],
          ] as const
        ).map(([key, label]) => (
          <LengthField
            key={key}
            id={`plot-${key}`}
            label={label}
            mm={key === 'side2' ? (sb.side2 ?? sb.sides) : sb[key]}
            units={units}
            min={0}
            onCommit={(mm) => updateElement({ ...plot, setbacks: { ...sb, [key]: mm } })}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          className="m-btn px-2 py-0.5"
          onClick={() => updateElement({ ...plot, setbacks: { ...sb, sides: sb.side2 ?? sb.sides, side2: sb.sides } })}
        >
          Swap sides
        </button>
        {fromRule && !followsRule && (
          <button className="m-btn px-2 py-0.5" onClick={() => updateElement({ ...plot, setbacks: fromRule })}>
            Use the bylaw setbacks
          </button>
        )}
      </div>
      {found && fromRule && !followsRule && (
        <div className="text-danger">These setbacks differ from the bylaws; the plan check uses the bylaws.</div>
      )}
      {found?.authority.notes.map((n) => (
        <div key={n} className="text-muted">
          {n}
        </div>
      ))}
    </div>
  );
}
