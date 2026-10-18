import { arrayCount } from '../lib/array';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { showArray } from '../tools/modifyTools';
import type { ArraySettings } from '../types';

const MODES: [ArraySettings['mode'], string, string][] = [
  ['grid', 'Rows & columns', 'Copies in rows and columns, or in a line at any angle'],
  ['polar', 'Round a centre', 'Copies round a point, over a full circle or part of one'],
  ['path', 'Along a path', 'Copies spaced evenly along a wall, layout line, wire or pipe'],
];

/** How the Array tool lays out its copies; a change shows at once on an array being made. */
export function ArrayOptions() {
  const a = usePlanner((s) => s.arraySettings);
  const setSettings = usePlanner((s) => s.setArraySettings);
  const set = (patch: Partial<ArraySettings>) => {
    setSettings(patch);
    showArray(plannerStore);
  };
  const number = (id: string, label: string, value: number, change: (n: number) => void, min = 1) => (
    <label htmlFor={id} className="flex items-center justify-between gap-2">
      {label}
      <input
        id={id}
        type="number"
        min={min}
        max={id === 'array-fill' ? 360 : 400}
        className="w-16 rounded-sm border bg-surface p-0.5 tabular-nums"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) change(n);
        }}
      />
    </label>
  );
  return (
    <div className="flex flex-col gap-2 text-xs" data-testid="array-options">
      <div className="m-heading">Array</div>
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Array kind">
        {MODES.map(([id, label, title]) => (
          <button
            key={id}
            role="radio"
            aria-checked={a.mode === id}
            className="m-btn px-2 py-0.5"
            aria-pressed={a.mode === id}
            title={title}
            onClick={() => {
              // A different kind starts again.
              const st = plannerStore.getState();
              if (st.draft?.type === 'array') {
                st.cancelBatch();
                st.setDraft(null);
              }
              setSettings({ mode: id });
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {a.mode === 'grid' && (
        <>
          {number('array-cols', 'Columns', a.cols, (n) => set({ cols: arrayCount(n) }))}
          {number('array-rows', 'Rows', a.rows, (n) => set({ rows: arrayCount(n) }))}
          <div className="text-muted">
            Click a base point, then the next copy's spot (one cell, with rows and columns). Or type the spacing.
          </div>
        </>
      )}
      {a.mode !== 'grid' &&
        number('array-count', 'How many (in all)', a.count, (n) => set({ count: arrayCount(n, 2) }), 2)}
      {a.mode === 'polar' &&
        number(
          'array-fill',
          'Angle to fill (°)',
          a.fillDeg,
          (n) => set({ fillDeg: Math.max(-360, Math.min(360, n)) || 360 }),
          -360,
        )}
      {a.mode !== 'grid' && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={a.turn} onChange={(e) => set({ turn: e.target.checked })} />
          {a.mode === 'polar' ? 'Turn the copies round' : 'Turn the copies with the path'}
        </label>
      )}
    </div>
  );
}
