import { plannerStore, usePlanner } from '../store/plannerStore';
import { hasPlinth, takesPlinth } from '../walls';
import type { Wall } from '../types';
import { LengthField } from './LengthField';

/** The automatic plinth under the ground floor's walls, picked in 3D as its own item. */
export function PlinthPanel({ wallId }: { wallId: string }) {
  const plinthMm = usePlanner((s) => s.doc.plinthMm);
  const projectMm = usePlanner((s) => s.doc.plinth?.projectMm ?? 0);
  const material = usePlanner((s) => s.doc.materials.find((m) => m.id === s.doc.plinth?.material)?.name);
  const units = usePlanner((s) => s.units);
  const s = plannerStore.getState();
  return (
    <div
      className="mb-3 flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs"
      data-testid="plinth-panel"
    >
      <div className="font-medium">Selected: plinth</div>
      <div className="text-muted">
        The plinth under the ground floor’s walls. These settings are for all of it; Delete leaves it off under this
        wall only.
      </div>
      <LengthField
        id="plinth-height"
        label="Height (ground floor above road level)"
        mm={plinthMm}
        units={units}
        min={0}
        onCommit={(mm) => s.setPlinthMm(mm)}
      />
      <LengthField
        id="plinth-project"
        label="Stands out past the wall faces"
        mm={projectMm}
        units={units}
        min={0}
        onCommit={(mm) => s.setPlinth({ projectMm: Math.min(mm, 1000) })}
      />
      <div>Material: {material ?? 'the wall’s own'}</div>
      <div className="flex flex-wrap gap-2">
        <button className="m-btn" onClick={() => s.setPlinth({ material: s.selectedMat })}>
          Apply selected material
        </button>
        {material && (
          <button className="m-btn" onClick={() => s.setPlinth({ material: undefined })}>
            Use the wall’s material
          </button>
        )}
        <button className="m-btn m-btn-danger" onClick={() => s.deleteSelected()}>
          Leave off under this wall
        </button>
        <button className="m-btn" onClick={() => s.select(wallId)}>
          Select the wall
        </button>
      </div>
    </div>
  );
}

/** In a ground-floor wall's Properties: whether the automatic plinth runs under it, and its settings. */
export function WallPlinth({ wall }: { wall: Wall }) {
  const takes = usePlanner((s) => takesPlinth(s.doc, wall));
  const on = usePlanner((s) => hasPlinth(s.doc, wall.id));
  if (!takes) return null;
  const s = plannerStore.getState();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="wall-plinth">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={on} onChange={(e) => s.setWallPlinth(wall.id, e.target.checked)} />
        Plinth under this wall
      </label>
      {on && (
        <button
          className="m-btn px-2 py-0.5"
          title="Its height, how far it stands out and its material"
          onClick={() => s.selectPlinth(wall.id)}
        >
          Plinth settings
        </button>
      )}
    </div>
  );
}
