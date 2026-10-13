import { useState } from 'react';
import { daysIn, DEFAULT_LATITUDE, DEFAULT_SUN, formatHour, northOf, shadowsOn, sunDirection } from '../lib/sun';
import { usePlanner } from '../store/plannerStore';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The 3D view's sun: shadows on or off, and the real sun for a date and time, turned to the plan's north. */
export function SunPanel({ className = '' }: { className?: string }) {
  const sun = usePlanner((s) => s.doc.sun);
  const northDeg = usePlanner((s) => s.doc.northDeg);
  const location = usePlanner((s) => s.doc.location);
  const setSun = usePlanner((s) => s.setSun);
  const setNorthDeg = usePlanner((s) => s.setNorthDeg);
  const hasArrow = usePlanner((s) => !!s.doc.northArrow);
  const placeNorth = usePlanner((s) => s.placeNorth);
  const [open, setOpen] = useState(false);
  const at = { ...DEFAULT_SUN, ...sun };
  const timed = !!sun?.timed;
  const down = timed && !sunDirection({ sun, northDeg, location }).up;
  const field = 'rounded-sm border bg-surface p-0.5 tabular-nums';
  return (
    <div className={`flex flex-col items-end gap-1 ${className}`}>
      <button className="m-btn" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="sun-button">
        Sun{timed ? ` · ${MONTHS[at.month - 1]} ${at.day}, ${formatHour(at.hour)}` : ''}
      </button>
      {open && (
        <div
          className="flex w-64 flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs shadow-popover"
          data-testid="sun-panel"
        >
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shadowsOn({ sun })}
              onChange={(e) => setSun({ shadows: e.target.checked })}
            />
            Shadows
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={timed} onChange={(e) => setSun({ timed: e.target.checked })} />
            The real sun, for a date and time
          </label>
          {timed && (
            <>
              <div className="flex items-center gap-1">
                <span className="w-12 text-muted">Date</span>
                <select
                  aria-label="Month"
                  className={field}
                  value={at.month}
                  onChange={(e) => {
                    const month = Number(e.target.value);
                    setSun({ month, day: Math.min(at.day, daysIn(month)) });
                  }}
                >
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Day"
                  type="number"
                  min={1}
                  max={daysIn(at.month)}
                  className={`${field} w-12`}
                  value={at.day}
                  onChange={(e) => {
                    const day = Math.round(Number(e.target.value));
                    if (day >= 1 && day <= daysIn(at.month)) setSun({ day });
                  }}
                />
              </div>
              <label className="flex items-center gap-1">
                <span className="w-12 text-muted">Time</span>
                <input
                  aria-label="Time of day"
                  type="range"
                  min={5}
                  max={20}
                  step={0.25}
                  value={at.hour}
                  onChange={(e) => setSun({ hour: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-14 text-right tabular-nums">{formatHour(at.hour)}</span>
              </label>
              <label className="flex items-center gap-1">
                <span className="w-12 text-muted">Latitude</span>
                <input
                  aria-label="Latitude"
                  type="number"
                  min={-66}
                  max={66}
                  step={0.1}
                  className={`${field} w-16`}
                  value={at.latitude ?? location?.lat ?? DEFAULT_LATITUDE}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && Math.abs(v) <= 66) setSun({ latitude: v });
                  }}
                />
                <span className="text-muted">° N</span>
              </label>
              {down && <span className="text-muted">The sun is down then: the light stays low.</span>}
            </>
          )}
          <label className="flex items-center gap-1">
            <span className="w-12 text-muted">North</span>
            <input
              aria-label="North angle"
              type="number"
              min={-360}
              max={360}
              step={1}
              className={`${field} w-16`}
              value={northOf({ northDeg })}
              onChange={(e) => {
                const angle = Number(e.target.value);
                if (Number.isFinite(angle)) setNorthDeg(Math.round(angle));
              }}
            />
            <span className="text-muted">° turned clockwise from up the page</span>
          </label>
          {hasArrow ? (
            <button className="m-btn self-start" onClick={() => placeNorth(null)}>
              Take the north arrow off the plan
            </button>
          ) : (
            <span className="text-muted">Put a north arrow on the plan with the North arrow tool (Shift+N).</span>
          )}
        </div>
      )}
    </div>
  );
}
