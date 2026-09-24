import { SNAP_LABELS } from '../lib/inference';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { applyMeasure, MEASURE_TOOLS, measureReadout, toolHint } from '../tools/controller';
import { Icon } from './Icon';

const AXIS_NAMES = { x: 'Red axis locked', y: 'Green axis locked' };

/** Bottom bar: what the tool wants next, snap and axis state, grid chips and the Measurements box. */
export function StatusBar() {
  const state = usePlanner((s) => s);
  const { tool, measureText, inference, axisLock, grid, view3d } = state;
  const hint = view3d ? 'Drag to turn around the house, right-drag to move, scroll to zoom.' : toolHint(state);
  const readout = measureReadout(state);
  const measuring = !view3d && tool in MEASURE_TOOLS;
  const chip = 'flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px]';

  return (
    <footer className="flex h-8 flex-none items-center gap-3 border-t border-line bg-surface px-3 text-xs">
      <span className="min-w-0 flex-1 truncate text-muted" data-testid="tool-hint">
        {hint}
      </span>
      {axisLock && (
        <span className="font-semibold" style={{ color: axisLock === 'x' ? 'var(--axis-x)' : 'var(--axis-y)' }}>
          {AXIS_NAMES[axisLock]}
        </span>
      )}
      {!axisLock && inference && SNAP_LABELS[inference.kind] && (
        <span className="text-muted" data-testid="snap-label">
          {SNAP_LABELS[inference.kind]}
        </span>
      )}
      <button
        className={`${chip} ${grid.show ? 'border-line-strong text-ink' : 'border-line text-muted'}`}
        aria-pressed={grid.show}
        title="Show or hide the grid (Ctrl+')"
        onClick={() => state.setGrid({ show: !grid.show })}
      >
        <Icon name="layers" size={12} /> Grid
      </button>
      <button
        className={`${chip} ${grid.snap ? 'border-line-strong text-ink' : 'border-line text-muted'}`}
        aria-pressed={grid.snap}
        title="Snap to grid points when nothing else is nearer"
        onClick={() => state.setGrid({ snap: !grid.snap })}
      >
        <Icon name="snap" size={12} /> Snap
      </button>
      <label
        className={`flex h-6 items-center gap-2 rounded-sm border px-2 ${
          measuring ? 'border-line-strong bg-raised' : 'border-line opacity-60'
        }`}
        title="Type a value while drawing and press Enter; you don't need to click here first."
      >
        <span className="text-muted">{readout.label || 'Measurements'}</span>
        <input
          aria-label="Measurements"
          className="w-36 border-0 bg-transparent p-0 text-right font-mono text-[12px] focus:outline-none"
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
    </footer>
  );
}
