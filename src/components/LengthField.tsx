import { useState } from 'react';
import { formatLength, LENGTH_HINT, parseLength } from '../lib/units';
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
    const value = parseLength(input.value, units);
    if (value === null || value < min) {
      setError(`Enter a length, ${LENGTH_HINT[units]}.`);
      return;
    }
    setError(null);
    onCommit(value);
    input.value = formatLength(value, units);
  }

  return (
    <div className="flex flex-col gap-0.5">
      <label htmlFor={id} className="text-gray-600">
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
        className={`rounded border p-1 tabular-nums ${error ? 'border-red-500' : ''}`}
      />
      {error && <span className="text-red-700">{error}</span>}
    </div>
  );
}
