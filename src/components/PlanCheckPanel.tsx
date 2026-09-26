import { type CheckStatus } from '../lib/planCheck';
import { usePlanner } from '../store/plannerStore';
import { usePlanCheck, usePlanHints } from '../store/usePlanCheck';

const MARK: Record<CheckStatus, { sign: string; className: string; word: string }> = {
  ok: { sign: '✓', className: 'text-[color:var(--snap-end)]', word: 'OK' },
  fail: { sign: '✗', className: 'text-danger', word: 'Not met' },
  check: { sign: '!', className: 'text-accent', word: 'Check' },
};

/** The Plan check section: the bylaw rules, then the plan hints. */
export function PlanCheckPanel() {
  return (
    <div className="flex flex-col gap-3">
      <BylawRows />
      <PlanHints />
    </div>
  );
}

/** Good-practice advice on the layout: click a hint to select the rooms it is about. */
function PlanHints() {
  const hints = usePlanHints();
  const show = usePlanner((s) => s.showHints);
  const setSelection = usePlanner((s) => s.setSelection);
  const hasRooms = usePlanner((s) => s.doc.rooms.length > 0);
  if (!show) return null;
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2 text-xs" data-testid="plan-hints">
      <div className="font-medium">
        Hints <span className="font-normal text-muted">· good practice, not bylaws</span>
      </div>
      {!hasRooms ? (
        <div className="text-muted">Name your rooms (Bedroom, Kitchen, Lounge…) to get hints on the layout.</div>
      ) : !hints.length ? (
        <div data-testid="plan-hints-none">No hints: every room is reached, lit and a good size.</div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {hints.map((h) => (
            <li key={h.id}>
              <button
                className="flex w-full gap-1.5 rounded-sm p-1 text-left hover:bg-sunken disabled:hover:bg-transparent"
                disabled={!h.ids.length}
                onClick={() => h.ids.length && setSelection(h.ids)}
                data-hint={h.id}
                data-kind={h.kind}
                title={h.ids.length ? 'Select the rooms concerned' : undefined}
              >
                <span aria-hidden className="w-3 flex-none font-bold text-accent">
                  ›
                </span>
                <span className="min-w-0 flex-1">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One row per bylaw rule, with its clause; click a row to select what breaks it. */
function BylawRows() {
  const check = usePlanCheck();
  const setSelection = usePlanner((s) => s.setSelection);
  const plot = usePlanner((s) => s.doc.elements.find((el) => el.type === 'plot'));
  if (!check)
    return plot ? (
      <div className="text-xs text-muted">
        <button className="underline" onClick={() => setSelection([plot.id])}>
          Select the plot
        </button>{' '}
        and pick its bylaws (CDA, DHA and more) to check the plan against them as you draw.
      </div>
    ) : (
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
