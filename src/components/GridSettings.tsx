import { formatLength, MM_PER_FOOT, MM_PER_INCH } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { GridPrefs } from '../lib/prefs';
import type { Units } from '../types';
import { LengthField } from './LengthField';
import { themeColor } from '../theme/themes';

/** Where the minor grid slider stops, for each unit system, in millimetres. */
const MINOR_STOPS: Record<Units, number[]> = {
  imperial: [
    MM_PER_INCH,
    2 * MM_PER_INCH,
    3 * MM_PER_INCH,
    6 * MM_PER_INCH,
    MM_PER_FOOT,
    2 * MM_PER_FOOT,
    3 * MM_PER_FOOT,
    5 * MM_PER_FOOT,
  ],
  metric: [10, 25, 50, 100, 250, 500, 1000],
};

/** Where the major grid slider stops: off, or a heavier line every this many minor lines. */
const MAJOR_STOPS = [0, 2, 3, 4, 5, 6, 8, 10, 12];

/** The stop nearest a value. */
const nearest = (stops: number[], v: number) =>
  stops.reduce((best, s, i) => (Math.abs(s - v) < Math.abs(stops[best] - v) ? i : best), 0);

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
  const minorStops = MINOR_STOPS[units];
  // The major lines' size as a length: always a whole number of minor squares, so they line up.
  const majorLabel = grid.major ? `${formatLength(spacing * grid.major, units)} (every ${grid.major})` : 'Off';

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

      <label htmlFor="grid-minor" className="flex flex-col gap-1">
        <span className="flex justify-between text-muted">
          Minor grid <span className="tabular-nums text-ink">{formatLength(spacing, units)}</span>
        </span>
        <input
          id="grid-minor"
          type="range"
          aria-label="Minor grid size"
          aria-valuetext={formatLength(spacing, units)}
          min={0}
          max={minorStops.length - 1}
          step={1}
          value={nearest(minorStops, spacing)}
          onChange={(e) => setGrid({ spacingMm: minorStops[Number(e.target.value)] })}
        />
      </label>
      <LengthField
        id="grid-spacing"
        label="Custom spacing"
        mm={spacing}
        units={units}
        onCommit={(mm) => setGrid({ spacingMm: mm })}
      />

      <label htmlFor="grid-major" className="flex flex-col gap-1">
        <span className="flex justify-between text-muted">
          Major grid <span className="tabular-nums text-ink">{majorLabel}</span>
        </span>
        <input
          id="grid-major"
          type="range"
          aria-label="Major grid size"
          aria-valuetext={majorLabel}
          min={0}
          max={MAJOR_STOPS.length - 1}
          step={1}
          value={nearest(MAJOR_STOPS, grid.major)}
          onChange={(e) => setGrid({ major: MAJOR_STOPS[Number(e.target.value)] })}
        />
      </label>

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
