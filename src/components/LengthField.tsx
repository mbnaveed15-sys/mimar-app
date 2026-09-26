import { useState } from 'react';
import { formatLength, LENGTH_HINT, MAX_LENGTH_MM, readLength } from '../lib/units';
import type { Units } from '../types';

interface Props {
  id: string;
  label: string;
  /** Current value in millimetres. */
  mm: number;
  units: Units;
  onCommit: (mm: number) => void;
  min?: number;
}

/** Text field for a length in the user's units; applies on Enter or when it loses focus. */
export function LengthField({ id, label, mm, units, onCommit, min = 10 }: Props) {
  const shown = formatLength(mm, units);
  const [error, setError] = useState<string | null>(null);

  function commit(input: HTMLInputElement) {
    // A minus sign is read only where the field takes lengths below zero (e.g. a sunken floor).
    const text = input.value.trim();
    const negative = min < 0 && text.startsWith('-');
    const parsed = readLength(negative ? text.slice(1) : text, units);
    const value = parsed !== null && negative ? -parsed : parsed;
    // Say what is wrong: not a length, too long, or too short.
    if (value === null) return setError(`Enter a length, ${LENGTH_HINT[units]}.`);
    if (Math.abs(value) > MAX_LENGTH_MM)
      return setError(`That's too long: at most ${formatLength(MAX_LENGTH_MM, units)}.`);
    if (value < min)
      return setError(min > 0 ? `At least ${formatLength(min, units)}.` : `No lower than ${formatLength(min, units)}.`);
    setError(null);
    onCommit(value);
    input.value = formatLength(value, units);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-muted">
        {label}
      </label>
      <input
        // Remount when the value changes elsewhere (dragging, undo) so the field shows it.
        key={shown}
        id={id}
        defaultValue={shown}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget);
          if (e.key === 'Escape') {
            e.currentTarget.value = shown;
            setError(null);
          }
        }}
        aria-invalid={error !== null}
        className={`rounded-sm border p-1 tabular-nums ${error ? 'border-danger' : ''}`}
      />
      {error && <span className="text-danger">{error}</span>}
    </div>
  );
}
