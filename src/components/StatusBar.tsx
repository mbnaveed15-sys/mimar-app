import { SNAP_LABELS } from '../lib/inference';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { applyMeasure, MEASURE_TOOLS, measureReadout, toolHint } from '../tools/controller';
import { Icon } from './Icon';
import { ChecksChip, PointerReadout, SnapChip } from './StatusChips';
import { usePhone } from './useCompact';

const AXIS_NAMES = { x: 'Red axis locked', y: 'Green axis locked', z: 'Blue axis locked (up and down)' };

/**
 * Bottom bar: what the tool wants next, snap and axis state, grid chips and the Measurements box. On a
 * phone it takes two short lines: the hint, then the chips (icons only) and the Measurements box.
 */
export function StatusBar() {
  const state = usePlanner((s) => s);
  const phone = usePhone();
  const { tool, measureText, inference, axisLock, grid } = state;
  const hint = toolHint(state);
  const readout = measureReadout(state);
  const measuring = tool in MEASURE_TOOLS;
  const chip = 'flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px] phone:h-8 phone:px-2';

  const hintLine = (
    <>
      <span className="min-w-0 flex-1 truncate text-muted" data-testid="tool-hint">
        {hint}
      </span>
      {axisLock && (
        <span className="font-semibold" style={{ color: `var(--axis-${axisLock})` }}>
          {AXIS_NAMES[axisLock]}
        </span>
      )}
      {!axisLock && inference && SNAP_LABELS[inference.kind] && (
        <span className="text-muted" data-testid="snap-label">
          {SNAP_LABELS[inference.kind]}
        </span>
      )}
    </>
  );
  const controls = (
    <>
      <button
        className={`${chip} ${grid.show ? 'border-line-strong text-ink' : 'border-line text-muted'}`}
        aria-pressed={grid.show}
        title="Show or hide the grid (Ctrl+')"
        onClick={() => state.setGrid({ show: !grid.show })}
      >
        <Icon name="layers" size={12} /> <span className="phone:sr-only">Grid</span>
      </button>
      <SnapChip />
      <ChecksChip />
      <label
        className={`flex h-6 items-center gap-2 rounded-sm border px-2 phone:h-8 phone:min-w-0 phone:flex-1 ${
          measuring ? 'border-line-strong bg-raised' : 'border-line opacity-60'
        }`}
        title="Type a value while drawing and press Enter; you don't need to click here first."
      >
        <span className="whitespace-nowrap text-muted">{readout.label || 'Measurements'}</span>
        <input
          aria-label="Measurements"
          className="w-36 border-0 bg-transparent p-0 text-right font-mono text-[12px] focus:outline-none phone:w-full phone:min-w-0 phone:text-[16px]"
          style={{ background: 'transparent' }}
          disabled={!measuring}
          value={measureText || readout.value}
          onChange={(e) => state.setMeasureText(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && measureText) {
              if (applyMeasure(plannerStore, measureText)) state.setMeasureText('');
            } else if (e.key === 'Escape') {
              state.setMeasureText('');
              e.currentTarget.blur();
            }
          }}
        />
      </label>
    </>
  );

  if (phone)
    return (
      <footer className="flex flex-none flex-col border-t border-line bg-surface px-2 pb-1 text-xs phone-short:pt-1">
        {/* On its side there is no room for the hint's line. */}
        <div className="flex h-6 items-center gap-2 phone-short:hidden">{hintLine}</div>
        <div className="flex items-center gap-1.5">{controls}</div>
      </footer>
    );
  return (
    <footer className="flex h-8 flex-none items-center gap-3 border-t border-line bg-surface px-3 text-xs">
      {hintLine}
      <PointerReadout />
      {controls}
    </footer>
  );
}
