import { usePlanner } from '../store/plannerStore';
import { THEMES } from '../theme/themes';
import { Mark } from './Mark';

/** Choose one of the five themes. Each swatch shows the mark in that theme's colours. */
export function ThemePicker() {
  const theme = usePlanner((s) => s.theme);
  const setTheme = usePlanner((s) => s.setTheme);
  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label="Theme" className="grid grid-cols-5 gap-1.5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            role="radio"
            aria-checked={t.id === theme}
            aria-label={t.name}
            title={t.name}
            onClick={() => setTheme(t.id)}
            data-theme={t.id}
            // The swatch uses its own theme's colours, whichever theme is active.
            className={`grid place-items-center rounded-md border p-1.5 ${
              t.id === theme ? 'border-accent ring-2 ring-accent' : 'border-line hover:border-line-strong'
            }`}
            style={{ background: t.surface }}
          >
            <Mark size={26} />
          </button>
        ))}
      </div>
      <span className="text-xs text-muted">{current.name}</span>
    </div>
  );
}
