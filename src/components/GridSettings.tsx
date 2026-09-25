import { MM_PER_FOOT, MM_PER_INCH } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { GridPrefs } from '../lib/prefs';
import type { Units } from '../types';
import { LengthField } from './LengthField';
import { themeColor } from '../theme/themes';

/** Grid spacing presets for each unit system, in millimetres. */
const SPACING_PRESETS: Record<Units, { mm: number; label: string }[]> = {
  imperial: [
    { mm: 6 * MM_PER_INCH, label: '6"' },
    { mm: MM_PER_FOOT, label: "1'" },
    { mm: 2 * MM_PER_FOOT, label: "2'" },
    { mm: 5 * MM_PER_FOOT, label: "5'" },
  ],
  metric: [
    { mm: 100, label: '100 mm' },
    { mm: 250, label: '250 mm' },
    { mm: 500, label: '500 mm' },
    { mm: 1000, label: '1 m' },
  ],
};

const MAJOR: { value: GridPrefs['major']; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 5, label: 'Every 5' },
  { value: 10, label: 'Every 10' },
];

const STYLES: { value: GridPrefs['style']; label: string }[] = [
  { value: 'lines', label: 'Lines' },
  { value: 'dots', label: 'Dots' },
];

/** How the plan grid looks and whether drawing snaps to it. */
export function GridSettings() {
  const grid = usePlanner((s) => s.grid);
  const setGrid = usePlanner((s) => s.setGrid);
  const units = usePlanner((s) => s.units);
  const spacing = grid.spacingMm[units];

  return (
    <fieldset className="flex flex-col gap-2 text-xs" aria-label="Grid">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="grid-show" className="flex items-center gap-1.5">
          <input
            id="grid-show"
            type="checkbox"
            checked={grid.show}
            onChange={(e) => setGrid({ show: e.target.checked })}
          />
          Show
          <kbd className="m-kbd" title="Show or hide the grid">
            Ctrl+&apos;
          </kbd>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted">Spacing</span>
        <div className="m-seg" role="group" aria-label="Grid spacing">
          {SPACING_PRESETS[units].map((p) => (
            <button
              key={p.mm}
              aria-pressed={Math.abs(spacing - p.mm) < 0.5}
              onClick={() => setGrid({ spacingMm: p.mm })}
            >
              {p.label}
            </button>
          ))}
        </div>
        <LengthField
          id="grid-spacing"
          label="Custom spacing"
          mm={spacing}
          units={units}
          onCommit={(mm) => setGrid({ spacingMm: mm })}
        />
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted">Major line</span>
        <div className="m-seg" role="group" aria-label="Major grid line">
          {MAJOR.map((m) => (
            <button key={m.value} aria-pressed={grid.major === m.value} onClick={() => setGrid({ major: m.value })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-muted">Style</span>
        <div className="m-seg" role="group" aria-label="Grid style">
          {STYLES.map((st) => (
            <button key={st.value} aria-pressed={grid.style === st.value} onClick={() => setGrid({ style: st.value })}>
              {st.label}
            </button>
          ))}
        </div>
      </div>

      <label htmlFor="grid-strength" className="flex flex-col gap-1">
        <span className="flex justify-between text-muted">
          Strength <span className="tabular-nums">{grid.strength}%</span>
        </span>
        <input
          id="grid-strength"
          type="range"
          min={0}
          max={100}
          step={5}
          value={grid.strength}
          onChange={(e) => setGrid({ strength: Number(e.target.value) })}
        />
      </label>

      <GridColorPickers />

      <label htmlFor="grid-snap" className="flex items-center gap-1.5">
        <input
          id="grid-snap"
          type="checkbox"
          checked={grid.snap}
          onChange={(e) => setGrid({ snap: e.target.checked })}
        />
        Snap to grid
      </label>
    </fieldset>
  );
}

/** Minor and major line colours for the current theme, each with a way back to the theme's own. */
function GridColorPickers() {
  const theme = usePlanner((s) => s.theme);
  const colors = usePlanner((s) => s.grid.colors[theme]);
  const setGridColor = usePlanner((s) => s.setGridColor);
  const lines = [
    { line: 'minor', label: 'Minor lines', cssVar: '--plan-grid' },
    { line: 'major', label: 'Major lines', cssVar: '--plan-grid-major' },
  ] as const;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted">Colours (this theme)</span>
      {lines.map(({ line, label, cssVar }) => {
        const own = colors?.[line];
        // The theme's colour, read fresh so it follows theme changes.
        const shown = own ?? toHex(themeColor(cssVar, '#cccccc'));
        return (
          <div key={line} className="flex items-center gap-2">
            <input
              type="color"
              aria-label={`${label} colour`}
              value={shown}
              onChange={(e) => setGridColor(line, e.target.value)}
              className="h-6 w-9 cursor-pointer rounded-sm border"
            />
            <span className="flex-1">{label}</span>
            <button className="m-btn px-2 py-0.5" disabled={!own} onClick={() => setGridColor(line, null)}>
              Theme default
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** #rgb or rgb() from CSS as #rrggbb, which colour inputs need. */
function toHex(css: string): string {
  const c = css.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`.toLowerCase();
  const m = c.match(/\d+/g);
  return m && m.length >= 3
    ? `#${m
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`
    : '#cccccc';
}
