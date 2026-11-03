import { useEffect, useRef, useState } from 'react';
import { formatLength, LENGTH_HINT, MAX_LENGTH_MM, readLength } from '../lib/units';
import type { Units } from '../types';

interface Props {
  id: string;
  label: string;
  /** Current value in millimetres; null when several items differ (the box shows "Mixed"). */
  mm: number | null;
  units: Units;
  onCommit: (mm: number) => void;
  min?: number;
}

/** One step of the arrows and of dragging the label: an inch, or 10 mm (Shift: a foot, or 100 mm). */
const stepMm = (units: Units, big: boolean) => (units === 'imperial' ? (big ? 304.8 : 25.4) : big ? 100 : 10);
/** Pixels of drag for one step. */
const PX_PER_STEP = 4;

/**
 * Text field for a length in the user's units; applies on Enter or when it loses focus. The arrows (or the
 * Up and Down keys) step it, and dragging its label left or right changes it, applied when let go.
 */
export function LengthField({ id, label, mm, units, onCommit, min = 10 }: Props) {
  const shown = mm === null ? '' : formatLength(mm, units);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  /** Set by a label drag, so the click that ends it doesn't put the caret in the box (Ctrl+Z then undoes it). */
  const dragged = useRef(false);
  /** Set when Enter has just applied the box, so leaving it doesn't apply it again. */
  const applied = useRef(false);

  // Show a value changed elsewhere (dragging, undo, another selection). The same box stays, so it keeps the
  // focus while the arrows or the Up and Down keys step it.
  useEffect(() => {
    const el = input.current;
    if (el && (document.activeElement !== el || read(el.value.trim()) !== mm)) el.value = shown;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  /** The length in the box now, or null when it can't be read. */
  function read(text: string): number | null {
    const negative = min < 0 && text.startsWith('-');
    const parsed = readLength(negative ? text.slice(1) : text, units);
    return parsed !== null && negative ? -parsed : parsed;
  }

  /** Apply the box's length; false when it can't be read (the box says why). */
  function commit(el: HTMLInputElement): boolean {
    // A minus sign is read only where the field takes lengths below zero (e.g. a sunken floor).
    const text = el.value.trim();
    // A "Mixed" box left empty changes nothing.
    if (mm === null && !text) {
      setError(null);
      return true;
    }
    const value = read(text);
    // Say what is wrong: not a length, too long, or too short.
    if (value === null) {
      setError(`Enter a length, ${LENGTH_HINT[units]}.`);
      return false;
    }
    if (Math.abs(value) > MAX_LENGTH_MM) {
      setError(`That's too long: at most ${formatLength(MAX_LENGTH_MM, units)}.`);
      return false;
    }
    if (value < min) {
      setError(min > 0 ? `At least ${formatLength(min, units)}.` : `No lower than ${formatLength(min, units)}.`);
      return false;
    }
    setError(null);
    // The same length again (leaving a box just applied) changes nothing, and adds no undo step.
    if (mm !== null && Math.abs(value - mm) < 0.05) {
      el.value = formatLength(mm, units);
      return true;
    }
    onCommit(value);
    el.value = formatLength(value, units);
    return true;
  }

  /** The box's length moved by `steps` steps, kept within range, rounded to whole steps' worth of mm. */
  function stepped(from: number, steps: number, big: boolean) {
    const next = from + steps * stepMm(units, big);
    return Math.min(MAX_LENGTH_MM, Math.max(min, Math.round(next * 10) / 10));
  }
  /** The length to step from: what is typed, else the value; null on a "Mixed" box with nothing typed. */
  const base = () => (input.current && read(input.current.value.trim())) ?? mm;

  function nudge(steps: number, big: boolean) {
    const el = input.current;
    const from = base();
    // Several items with different lengths have no one length to step from: each keeps its own.
    if (!el || from === null) return;
    el.value = formatLength(stepped(from, steps, big), units);
    commit(el);
  }

  function scrub(e: React.PointerEvent) {
    if (e.button !== 0 || !input.current) return;
    const el = input.current;
    const startX = e.clientX;
    const start = base();
    if (start === null) return;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const steps = Math.trunc((ev.clientX - startX) / PX_PER_STEP);
      if (!steps && !moved) return;
      moved = true;
      ev.preventDefault();
      el.value = formatLength(stepped(start, steps, ev.shiftKey), units);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved) {
        dragged.current = true;
        commit(el);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const arrow =
    'flex h-1/2 w-5 items-center pointer-coarse:min-h-6 pointer-coarse:w-9 justify-center text-[9px] leading-none text-muted hover:bg-sunken hover:text-ink';
  return (
    <div className="flex flex-col gap-0.5">
      <label
        htmlFor={id}
        className="m-scrub text-muted"
        onPointerDown={scrub}
        onClick={(e) => {
          if (dragged.current) e.preventDefault();
          dragged.current = false;
        }}
        title="Drag left or right to change"
      >
        {label}
      </label>
      <div className="flex items-stretch">
        <input
          ref={input}
          id={id}
          defaultValue={shown}
          placeholder={mm === null ? 'Mixed' : undefined}
          onBlur={(e) => {
            // Already applied by Enter (the value shown here is not yet the new one).
            if (applied.current) applied.current = false;
            else commit(e.currentTarget);
          }}
          onKeyDown={(e) => {
            // Enter applies the length and hands the keys back to the plan (Ctrl+Z, Ctrl+1 and the tool keys).
            if (e.key === 'Enter') {
              if (commit(e.currentTarget)) {
                applied.current = true;
                e.currentTarget.blur();
              }
            }
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              nudge(e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
            }
            if (e.key === 'Escape') {
              e.currentTarget.value = shown;
              setError(null);
            }
          }}
          aria-invalid={error !== null}
          className={`min-w-0 flex-1 rounded-l-sm border p-1 tabular-nums ${error ? 'border-danger' : ''}`}
        />
        <div className="flex flex-col rounded-r-sm border border-l-0">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Step up"
            aria-controls={id}
            onMouseDown={(e) => e.preventDefault()}
            className={arrow}
            onClick={(e) => nudge(1, e.shiftKey)}
          >
            ▲
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-label="Step down"
            aria-controls={id}
            onMouseDown={(e) => e.preventDefault()}
            className={arrow}
            onClick={(e) => nudge(-1, e.shiftKey)}
          >
            ▼
          </button>
        </div>
      </div>
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
