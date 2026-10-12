import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CHECK_CATEGORIES, checkOn, SNAP_GROUPS } from '../lib/checks';
import { formatLength } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import { usePlanCheck, usePlanHints } from '../store/usePlanCheck';
import { usePlanPointer } from '../store/pointerStore';
import { Icon } from './Icon';

const chip = 'flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px]';
const chipLook = (on: boolean) => (on ? 'border-line-strong text-ink' : 'border-line text-muted');

/**
 * A bottom-bar chip whose click does its main job, with a menu that opens while the pointer rests
 * on it (or from the small arrow beside it, for touch and keyboard).
 */
function ChipMenu({ label, children, chipButton }: { label: string; children: ReactNode; chipButton: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const later = (next: boolean, ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(next), ms);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      ref={ref}
      className="relative flex flex-none items-center"
      onPointerEnter={(e) => e.pointerType === 'mouse' && later(true, 350)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && later(false, 300)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {chipButton}
      <button
        className="grid h-5 w-3.5 place-items-center text-[9px] text-muted hover:text-ink pointer-coarse:w-6"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} options`}
        onClick={() => setOpen(!open)}
      >
        ▴
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 bottom-full z-40 mb-1 w-60 rounded-md border border-line bg-raised p-1 text-xs shadow-popover"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuSwitch({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      role="menuitemcheckbox"
      aria-checked={on}
      title={title}
      className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left hover:bg-accent-soft pointer-coarse:py-2"
      onClick={onClick}
    >
      <span className="w-3 flex-none text-accent-ink">{on ? <Icon name="check" size={12} /> : null}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

const Separator = () => <div role="separator" className="my-1 h-px bg-line" />;

/** Snap: click turns all snapping on or off; the menu turns each kind of snap point on or off. */
export function SnapChip() {
  const snaps = usePlanner((s) => s.snaps);
  const gridSnap = usePlanner((s) => s.grid.snap);
  const setSnaps = usePlanner((s) => s.setSnaps);
  const setGrid = usePlanner((s) => s.setGrid);
  const setAll = (on: boolean) => {
    setSnaps({ on: true });
    for (const g of SNAP_GROUPS) setSnaps({ group: g.id, groupOn: on });
    setGrid({ snap: on });
  };
  return (
    <ChipMenu
      label="Snap"
      chipButton={
        <button
          className={`${chip} ${chipLook(snaps.on)}`}
          aria-pressed={snaps.on}
          title="Snapping on or off (F3). Rest the pointer here to pick the snap points."
          onClick={() => setSnaps({ on: !snaps.on })}
        >
          <Icon name="snap" size={12} /> Snap
        </button>
      }
    >
      <MenuSwitch on={snaps.on} onClick={() => setSnaps({ on: !snaps.on })}>
        <span className="font-medium">Snapping</span>
      </MenuSwitch>
      <Separator />
      <div className={snaps.on ? '' : 'opacity-50'}>
        {SNAP_GROUPS.map((g) => (
          <MenuSwitch
            key={g.id}
            on={!snaps.off.includes(g.id)}
            onClick={() => setSnaps({ group: g.id, groupOn: snaps.off.includes(g.id) })}
          >
            {g.label}
          </MenuSwitch>
        ))}
        <MenuSwitch on={gridSnap} onClick={() => setGrid({ snap: !gridSnap })}>
          Grid
        </MenuSwitch>
      </div>
      <Separator />
      <div className="flex gap-1 px-1 py-0.5">
        <button className="m-btn flex-1 px-2 py-0.5" onClick={() => setAll(true)}>
          All on
        </button>
        <button className="m-btn flex-1 px-2 py-0.5" onClick={() => setAll(false)}>
          All off
        </button>
      </div>
    </ChipMenu>
  );
}

/** Checks: click pauses or resumes every check; the menu does it one kind at a time. */
export function ChecksChip() {
  const checks = usePlanner((s) => s.checks);
  const setChecks = usePlanner((s) => s.setChecks);
  const check = usePlanCheck();
  const hints = usePlanHints();
  const count = (check?.rows.filter((r) => r.status === 'fail' && !r.detail).length ?? 0) + hints.length;
  const setAll = (on: boolean) => {
    setChecks({ on: true });
    for (const c of CHECK_CATEGORIES) setChecks({ category: c.id, categoryOn: on });
  };
  return (
    <ChipMenu
      label="Checks"
      chipButton={
        <button
          className={`${chip} ${chipLook(checks.on)}`}
          aria-pressed={checks.on}
          title="Checks on or off: bylaws, hints and the red and amber marks (F4). Rest the pointer here to pick which."
          onClick={() => setChecks({ on: !checks.on })}
          data-testid="checks-chip"
        >
          <Icon name="check" size={12} /> Checks
          {checks.on && count > 0 && (
            <span className="rounded-sm bg-accent-soft px-1 text-accent-ink" data-testid="checks-count">
              {count}
            </span>
          )}
        </button>
      }
    >
      <MenuSwitch on={checks.on} onClick={() => setChecks({ on: !checks.on })}>
        <span className="font-medium">Checks</span>
      </MenuSwitch>
      <Separator />
      <div className={checks.on ? '' : 'opacity-50'}>
        {CHECK_CATEGORIES.map((c) => (
          <MenuSwitch
            key={c.id}
            title={c.title}
            on={!checks.off.includes(c.id)}
            onClick={() => setChecks({ category: c.id, categoryOn: checks.off.includes(c.id) })}
          >
            {c.label}
          </MenuSwitch>
        ))}
      </div>
      <Separator />
      <div className="flex gap-1 px-1 py-0.5">
        <button className="m-btn flex-1 px-2 py-0.5" onClick={() => setAll(true)}>
          All on
        </button>
        <button className="m-btn flex-1 px-2 py-0.5" onClick={() => setAll(false)}>
          All off
        </button>
      </div>
      {!checkOn(checks, 'plot') || !checkOn(checks, 'openings') ? (
        <div className="px-2 pt-1 text-[10px] text-muted">
          Paused checks also stop walls being pulled to the building line and doors kept off corners.
        </div>
      ) : null}
    </ChipMenu>
  );
}

/** Where the pointer (or the point it snaps to) is on the plan, east and north of the plan's origin. */
export function PointerReadout() {
  const raw = usePlanPointer();
  const snapped = usePlanner((s) => s.inference?.point ?? null);
  const units = usePlanner((s) => s.units);
  const mmPer = usePlanner((s) => s.scaleMMperPx);
  const at = snapped ?? raw;
  if (!at) return null;
  return (
    <span
      className="hidden font-mono text-[11px] whitespace-nowrap text-muted md:inline"
      data-testid="pointer-xy"
      title="Pointer position from the plan's origin"
    >
      X {formatLength(at.x * mmPer, units)} · Y {formatLength(-at.y * mmPer, units)}
    </span>
  );
}
