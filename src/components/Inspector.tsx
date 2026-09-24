import { placeOnWall, wallLength, withWallLength } from '../geometry';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, usePlanner } from '../store/plannerStore';
import type { Wall } from '../types';
import { LengthField } from './LengthField';

export function Inspector() {
  const doc = usePlanner((s) => s.doc);
  const selectedId = usePlanner((s) => s.selectedId);
  const tool = usePlanner((s) => s.tool);
  const units = usePlanner((s) => s.units);
  const applyMaterial = usePlanner((s) => s.applyMaterial);
  const deleteElement = usePlanner((s) => s.deleteElement);
  const updateElement = usePlanner((s) => s.updateElement);
  const flipOpening = usePlanner((s) => s.flipOpening);

  const el = doc.elements.find((e) => e.id === selectedId);
  const toUnits = (mm: number) => mm / MM_PER_UNIT;
  const materialName = (id?: string) => doc.materials.find((m) => m.id === id)?.name;
  const btn = 'rounded border px-2 py-1';

  return (
    <aside className="flex w-80 flex-col gap-3 border-l bg-white p-3">
      <h3 className="font-semibold">Inspector</h3>
      <div className="flex-1 overflow-auto">
        {el ? (
          <div className="mb-3 flex flex-col gap-2 rounded border p-2 text-xs">
            <div className="font-medium capitalize">Selected: {el.type}</div>

            {el.type === 'wall' && (
              <LengthField
                id="wall-length"
                label="Length"
                mm={wallLength(el) * MM_PER_UNIT}
                units={units}
                onCommit={(mm) => updateElement(withWallLength(el, toUnits(mm)))}
              />
            )}

            {(el.type === 'door' || el.type === 'window') && (
              <>
                <LengthField
                  id="opening-width"
                  label="Width"
                  mm={el.width * MM_PER_UNIT}
                  units={units}
                  onCommit={(mm) => {
                    const wall = doc.elements.find((w): w is Wall => w.type === 'wall' && w.id === el.wallId);
                    if (wall) updateElement({ ...el, ...placeOnWall(wall, el, toUnits(mm)) });
                  }}
                />
                {el.type === 'door' && (
                  <div className="flex gap-2">
                    <button onClick={() => flipOpening(el.id, 'side')} className={btn}>
                      Flip swing
                    </button>
                    <button onClick={() => flipOpening(el.id, 'hinge')} className={btn}>
                      Flip hinge
                    </button>
                  </div>
                )}
                <div className="text-gray-500">Drag it to slide along the wall.</div>
              </>
            )}

            {el.type === 'furniture' && (
              <>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="furniture-label" className="text-gray-600">
                    Name
                  </label>
                  <input
                    key={el.label ?? ''}
                    id="furniture-label"
                    defaultValue={el.label ?? ''}
                    placeholder="Furn"
                    onBlur={(e) => {
                      const label = e.currentTarget.value.trim() || undefined;
                      if (label !== el.label) updateElement({ ...el, label });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="rounded border p-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LengthField
                    id="furniture-width"
                    label="Width"
                    mm={el.w * MM_PER_UNIT}
                    units={units}
                    onCommit={(mm) => updateElement({ ...el, w: toUnits(mm) })}
                  />
                  <LengthField
                    id="furniture-depth"
                    label="Depth"
                    mm={el.h * MM_PER_UNIT}
                    units={units}
                    onCommit={(mm) => updateElement({ ...el, h: toUnits(mm) })}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="furniture-rotation" className="text-gray-600">
                    Rotation (°)
                  </label>
                  <input
                    key={el.rotation ?? 0}
                    id="furniture-rotation"
                    type="number"
                    step={15}
                    defaultValue={Math.round(el.rotation ?? 0)}
                    onBlur={(e) => {
                      const deg = Number(e.currentTarget.value);
                      if (Number.isFinite(deg)) updateElement({ ...el, rotation: ((deg % 360) + 360) % 360 });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="rounded border p-1 tabular-nums"
                  />
                </div>
                <div className="text-gray-500">Drag the corner handle to resize, the top handle to rotate.</div>
              </>
            )}

            <div>Material: {materialName(el.material) ?? '—'}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => applyMaterial(el.id)} className={btn}>
                Apply selected material
              </button>
              <button onClick={() => deleteElement(el.id)} className={`${btn} text-red-700`}>
                Delete
              </button>
            </div>
          </div>
        ) : (
          tool === 'select' && (
            <div className="mb-3 text-xs text-gray-500">Click an element to select it. Drag to move it.</div>
          )
        )}
        <div className="text-xs text-gray-600">
          Walls: {doc.elements.filter((e) => e.type === 'wall').length} · total length{' '}
          {formatLength(
            doc.elements.reduce((sum, e) => sum + (e.type === 'wall' ? wallLength(e) : 0), 0) * MM_PER_UNIT,
            units,
          )}
        </div>
        <div className="text-xs text-gray-600">Materials count: {doc.materials.length}</div>
        <div className="pt-2">
          <div className="text-xs font-medium">Masks</div>
          <ul className="mt-2 text-xs">
            {doc.masks.map((m) => (
              <li key={m.id} className="rounded border p-1">
                {m.name} — material: {materialName(m.material) ?? m.material}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
