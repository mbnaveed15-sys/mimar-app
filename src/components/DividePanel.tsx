import { useState } from 'react';
import { formatLength, LENGTH_HINT, readLength } from '../lib/units';
import { usePlanner } from '../store/plannerStore';
import type { Id, Units } from '../types';

/** Divide a wall or layout line into equal parts, or into pieces of a set length. */
export function DividePanel({ id, units }: { id: Id; units: Units }) {
  const divideItem = usePlanner((s) => s.divideItem);
  const [by, setBy] = useState<'parts' | 'length'>('parts');
  const [parts, setParts] = useState('2');
  const [length, setLength] = useState(() => formatLength(1000, units));
  const [error, setError] = useState<string | null>(null);

  function divide() {
    if (by === 'parts') {
      const n = Math.floor(Number(parts));
      if (!(n >= 2 && n <= 200)) return setError('Enter a number of parts from 2 to 200.');
      setError(null);
      return divideItem(id, { parts: n });
    }
    const mm = readLength(length, units);
    if (mm === null || mm < 10) return setError(`Enter a length, ${LENGTH_HINT[units]}.`);
    setError(null);
    divideItem(id, { everyMm: mm });
  }

  return (
    <div className="flex flex-col gap-1" data-testid="divide-panel">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted">Divide</span>
        <div role="radiogroup" aria-label="Divide by" className="m-seg">
          <button role="radio" aria-checked={by === 'parts'} onClick={() => setBy('parts')}>
            Equal parts
          </button>
          <button role="radio" aria-checked={by === 'length'} onClick={() => setBy('length')}>
            By length
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {by === 'parts' ? (
          <input
            className="w-20 rounded-sm border p-1 tabular-nums"
            type="number"
            min={2}
            max={200}
            aria-label="Number of parts"
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && divide()}
          />
        ) : (
          <input
            className="w-24 rounded-sm border p-1 tabular-nums"
            aria-label="Piece length"
            value={length}
            onChange={(e) => setLength(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && divide()}
          />
        )}
        <button className="m-btn" data-testid="divide-btn" onClick={divide}>
          Divide
        </button>
      </div>
      {error && <div className="text-danger">{error}</div>}
      <div className="text-muted">The new ends snap, so they mark the divisions.</div>
    </div>
  );
}
