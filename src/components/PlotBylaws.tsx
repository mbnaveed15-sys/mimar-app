import { AUTHORITIES, plotMeasures, plotRule, type AuthorityId } from '../lib/bylaws';
import { appliedRule, appliedSetbacks, buildingRuleOf } from '../lib/buildingCheck';
import { shows } from '../lib/project';
import { leftRightOf, setbacksFromLeftRight } from '../lib/plot';
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
  const setPlotBylawArea = usePlanner((s) => s.setPlotBylawArea);
  const doc = usePlanner((s) => s.doc);
  const bylaws = shows(doc, 'bylaws');
  const found = plotRule(plot);
  // A building under CDA, DHA Islamabad or LDA: its area's limits, not the house table.
  const building = buildingRuleOf(doc, plot);
  const rule = appliedRule(doc, plot);
  const { areaSqFt, frontageFt } = plotMeasures(plot);
  const sb = plot.setbacks;
  const lr = leftRightOf(plot);
  const fromRule = rule ? appliedSetbacks(rule, plot) : null;
  const options = rule
    ? [
        appliedSetbacks(rule, plot),
        appliedSetbacks(rule, plot, true),
        ...(rule.altSides
          ? [false, true].map((swap) =>
              appliedSetbacks(
                { ...rule, setbacks: { ...rule.setbacks, side1: rule.altSides![0], side2: rule.altSides![1] } },
                plot,
                swap,
              ),
            )
          : []),
      ]
    : [];
  const same = (a: Plot['setbacks'] | null) =>
    !!a &&
    (['front', 'rear', 'sides'] as const).every((k) => Math.abs(a[k] - sb[k]) < 1) &&
    Math.abs((a.side2 ?? a.sides) - (sb.side2 ?? sb.sides)) < 1;
  const followsRule = options.some(same);
  // The road's width decides LDA's zones and CDA's major avenues, and LDA houses on narrow roads.
  const askRoad = building ? building.bylaws.usesRoadWidth : found?.authority.id === 'lda-builtup';

  return (
    <div className="flex flex-col gap-2" data-testid="plot-bylaws">
      {bylaws && (
        <AuthoritySelect id="plot-authority" value={plot.authority} onChange={(a) => setPlotAuthority(plot.id, a)} />
      )}
      <div className="text-muted tabular-nums">
        {units === 'metric' ? (
          <>
            {Math.round(areaSqFt * 0.09290304).toLocaleString('en-US')} m², {(frontageFt * 0.3048).toFixed(1)} m along
            the road
          </>
        ) : (
          <>
            {Math.round(areaSqFt).toLocaleString('en-US')} sq ft ({Math.round(areaSqFt / 9)} sq yd),{' '}
            {Math.round(frontageFt)}' along the road
          </>
        )}
      </div>
      {bylaws && building && (
        <div className="flex flex-col gap-0.5">
          <label htmlFor="plot-bylaw-area" className="text-muted">
            Area ({building.bylaws.name})
          </label>
          <select
            id="plot-bylaw-area"
            value={building.area.id}
            onChange={(e) => setPlotBylawArea(plot.id, e.target.value)}
            className="rounded-sm border p-1"
          >
            {building.bylaws.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {bylaws && askRoad && (
        <LengthField
          id="plot-road-width"
          label={plot.roadWidthMm ? 'Road width' : 'Road width (not typed)'}
          mm={plot.roadWidthMm ?? 0}
          units={units}
          min={0}
          onCommit={(mm) => {
            const next: Plot = { ...plot, roadWidthMm: mm };
            if (!mm) delete next.roadWidthMm;
            updateElement(next);
          }}
        />
      )}
      {bylaws && building && (
        <div className="rounded-sm border border-line p-1.5">
          <div className="font-medium" data-testid="plot-rule">
            {building.limits.label}
          </div>
          <div className="text-muted">
            {building.area.clause} · {building.bylaws.source}
          </div>
        </div>
      )}
      {bylaws && found && !building && (
        <div className="rounded-sm border border-line p-1.5">
          <div className="font-medium" data-testid="plot-rule">
            {rule ? rule.label : found.rule ? found.rule.label : 'No row in the table fits this plot'}
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
      <div className="text-muted">Setbacks for each kind of side (a side can have its own, below)</div>
      <div className="grid grid-cols-2 gap-2">
        <LengthField
          id="plot-front"
          label="Front (main road)"
          mm={sb.front}
          units={units}
          min={0}
          onCommit={(mm) => updateElement({ ...plot, setbacks: { ...sb, front: mm } })}
        />
        <LengthField
          id="plot-rear"
          label="Rear (back)"
          mm={sb.rear}
          units={units}
          min={0}
          onCommit={(mm) => updateElement({ ...plot, setbacks: { ...sb, rear: mm } })}
        />
        {(['left', 'right'] as const).map((side) => (
          <LengthField
            key={side}
            id={`plot-${side}`}
            label={side === 'left' ? 'Left side' : 'Right side'}
            mm={lr[side]}
            units={units}
            min={0}
            onCommit={(mm) =>
              updateElement({ ...plot, setbacks: setbacksFromLeftRight(plot, { ...sb, ...lr, [side]: mm }) })
            }
          />
        ))}
      </div>
      <div className="text-muted">Left and right as seen from the main road, looking into the plot.</div>
      <div className="flex flex-wrap gap-1">
        <button
          className="m-btn px-2 py-0.5"
          onClick={() => updateElement({ ...plot, setbacks: { ...sb, sides: sb.side2 ?? sb.sides, side2: sb.sides } })}
        >
          Swap left and right
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
      {found && building && !rule && (
        <div className="text-muted">This area’s setbacks are set plot by plot: type the plot’s own.</div>
      )}
      {rule?.frontAsTyped && <div className="text-muted">{rule.frontAsTyped}</div>}
      {!building &&
        found?.authority.notes.map((n) => (
          <div key={n} className="text-muted">
            {n}
          </div>
        ))}
    </div>
  );
}
