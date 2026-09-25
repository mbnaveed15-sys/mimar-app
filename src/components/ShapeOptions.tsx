import { usePlanner } from '../store/plannerStore';
import type { ShapeKind } from '../types';

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'circle', label: 'Circle' },
  { kind: 'arch', label: 'Arch' },
  { kind: 'polygon', label: 'Polygon' },
];

/** Which shape the Shape tool draws, and what to do with it next. */
export function ShapeOptions() {
  const kind = usePlanner((s) => s.shapeKind);
  const setKind = usePlanner((s) => s.setShapeKind);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-line bg-raised p-2 text-xs">
      <div className="font-medium">Shape</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Shape">
        {SHAPES.map((s) => (
          <button
            key={s.kind}
            className="m-btn px-2 py-0.5"
            aria-pressed={kind === s.kind}
            onClick={() => setKind(s.kind)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="text-muted">
        Draw it on the floor, a slab or (in 3D) a wall. Then use Push/Pull (P): pull a floor shape up into a block, push
        a slab shape down through to make a void, or push a wall shape through to cut an opening.
      </div>
    </div>
  );
}
