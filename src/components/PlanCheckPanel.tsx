import { type CheckStatus } from '../lib/planCheck';
import { usePlanner } from '../store/plannerStore';
import { usePlanCheck } from '../store/usePlanCheck';

const MARK: Record<CheckStatus, { sign: string; className: string; word: string }> = {
  ok: { sign: '✓', className: 'text-[color:var(--snap-end)]', word: 'OK' },
  fail: { sign: '✗', className: 'text-danger', word: 'Not met' },
  check: { sign: '!', className: 'text-accent', word: 'Check' },
};

/** The Plan check section: one row per rule, with its clause; click a row to select what breaks it. */
export function PlanCheckPanel() {
  const check = usePlanCheck();
  const setSelection = usePlanner((s) => s.setSelection);
  if (!check)
    return (
      <div className="text-xs text-muted">
        Draw a plot (Shift+P) and pick its bylaws (CDA, DHA and more) to check the plan against them as you draw.
      </div>
    );
  const { authority, rule, rows } = check;
  const failing = rows.filter((r) => r.status === 'fail').length;
  return (
    <div className="flex flex-col gap-1.5 text-xs" data-testid="plan-check">
      <div>
        <span className="font-medium">{authority.name}</span>
        {authority.status === 'provisional' && (
          <span className="ml-1 rounded-sm bg-sunken px-1 text-[10px] text-muted">provisional</span>
        )}
        <div className="text-muted">{rule ? rule.label : 'No row of the table fits this plot'}</div>
      </div>
      <div className={failing ? 'font-medium text-danger' : 'font-medium'} data-testid="plan-check-summary">
        {failing ? `${failing} ${failing === 1 ? 'rule' : 'rules'} not met` : 'No problems found'}
      </div>
      <ul className="flex flex-col gap-1">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              className="flex w-full gap-1.5 rounded-sm p-1 text-left hover:bg-sunken disabled:hover:bg-transparent"
              disabled={!r.ids?.length}
              onClick={() => r.ids?.length && setSelection(r.ids)}
              data-check={r.id}
              data-status={r.status}
              title={r.ids?.length ? 'Select the items concerned' : undefined}
            >
              <span aria-label={MARK[r.status].word} className={`w-3 flex-none font-bold ${MARK[r.status].className}`}>
                {MARK[r.status].sign}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{r.label}</span>
                <span className="text-muted"> · {r.clause}</span>
                <span className="block">{r.actual}</span>
                <span className="block text-muted">{r.required}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {rule?.check && <div className="text-danger">Check: {rule.check}</div>}
      <div className="text-muted">
        Indicative only: measured from your drawing ({authority.source}). Check with your authority before submitting.
      </div>
    </div>
  );
}
