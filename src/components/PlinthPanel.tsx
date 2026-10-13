import { hasOwnPlinth, plinthProjectMm } from '../lib/plinth';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { hasPlinth, takesPlinth } from '../walls';
import type { Wall } from '../types';
import { LengthField } from './LengthField';

/** The automatic plinth under the ground floor's walls, picked in 3D or on the plan as its own item. */
export function PlinthPanel({ wallId }: { wallId: string }) {
  const plinthMm = usePlanner((s) => s.doc.plinthMm);
  const projectMm = usePlanner((s) => s.doc.plinth?.projectMm ?? 0);
  const material = usePlanner((s) => s.doc.materials.find((m) => m.id === s.doc.plinth?.material)?.name);
  const wall = usePlanner((s) => s.doc.elements.find((el): el is Wall => el.id === wallId && el.type === 'wall'));
  const ownMaterial = usePlanner((s) => s.doc.materials.find((m) => m.id === wall?.plinthMaterial)?.name);
  const units = usePlanner((s) => s.units);
  const s = plannerStore.getState();
  const own = !!wall && hasOwnPlinth(wall);
  return (
    <div
      className="mb-3 flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs"
      data-testid="plinth-panel"
    >
      <div className="font-medium">Selected: plinth</div>
      <div className="text-muted">
        The plinth under the ground floor’s walls. These settings are for all of it, except under walls with their own;
        Delete leaves it off under this wall only.
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
      </div>
      {wall && (
        <div className="flex flex-col gap-2 border-t border-line pt-2" data-testid="plinth-own">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={own}
              onChange={(e) =>
                e.target.checked
                  ? s.setWallPlinthOwn(wall.id, { projectMm: plinthProjectMm(s.doc, wall) })
                  : s.setWallPlinthOwn(wall.id, { projectMm: null, material: null })
              }
            />
            Its own settings under this wall
          </label>
          {own && (
            <>
              <LengthField
                id="plinth-own-project"
                label="Under this wall, stands out"
                mm={plinthProjectMm(s.doc, wall)}
                units={units}
                min={0}
                onCommit={(mm) => s.setWallPlinthOwn(wall.id, { projectMm: Math.min(mm, 1000) })}
              />
              <div>Material under this wall: {ownMaterial ?? material ?? 'the wall’s own'}</div>
              <div className="flex flex-wrap gap-2">
                <button className="m-btn" onClick={() => s.setWallPlinthOwn(wall.id, { material: s.selectedMat })}>
                  Apply selected material here
                </button>
                {ownMaterial && (
                  <button className="m-btn" onClick={() => s.setWallPlinthOwn(wall.id, { material: null })}>
                    As the rest
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
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

type Choice = 'rest' | 'own' | 'none';

/** In a ground-floor wall's Properties: the automatic plinth under it as the rest, with its own settings, or none. */
export function WallPlinth({ wall }: { wall: Wall }) {
  const takes = usePlanner((s) => takesPlinth(s.doc, wall));
  const on = usePlanner((s) => hasPlinth(s.doc, wall.id));
  if (!takes) return null;
  const s = plannerStore.getState();
  const choice: Choice = !on ? 'none' : hasOwnPlinth(wall) ? 'own' : 'rest';
  const pick = (next: Choice) => {
    if (next === 'none') return s.setWallPlinth(wall.id, false);
    s.beginBatch();
    s.setWallPlinth(wall.id, true);
    if (next === 'own') s.setWallPlinthOwn(wall.id, { projectMm: plinthProjectMm(s.doc, wall) });
    else s.setWallPlinthOwn(wall.id, { projectMm: null, material: null });
    s.endBatch();
  };
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="wall-plinth">
      <label className="flex items-center gap-2">
        Plinth
        <select
          id="wall-plinth-choice"
          className="rounded-sm border p-1"
          value={choice}
          onChange={(e) => pick(e.target.value as Choice)}
        >
          <option value="rest">As the rest</option>
          <option value="own">Its own settings</option>
          <option value="none">None</option>
        </select>
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
