import { placeOnWall, wallLength, withWallLength } from '../geometry';
import { formatArea, formatLength, formatMarla } from '../lib/units';
import { roomAreaSqMm } from '../rooms';
import { MM_PER_UNIT, usePlanner } from '../store/plannerStore';
import type { Wall } from '../types';
import { thicknessOf } from '../walls';
import { LengthField } from './LengthField';

/** Common room names in Pakistani homes, offered as suggestions. */
const ROOM_NAMES = [
  'Bedroom',
  'Master bedroom',
  'Drawing room',
  'Lounge',
  'TV lounge',
  'Dining',
  'Kitchen',
  'Bath',
  'Store',
  'Car porch',
  'Lawn',
  'Stairs',
  'Servant quarter',
  'Laundry',
];

export function Inspector() {
  const doc = usePlanner((s) => s.doc);
  const selectedId = usePlanner((s) => s.selectedId);
  const tool = usePlanner((s) => s.tool);
  const units = usePlanner((s) => s.units);
  const applyMaterial = usePlanner((s) => s.applyMaterial);
  const deleteElement = usePlanner((s) => s.deleteElement);
  const updateElement = usePlanner((s) => s.updateElement);
  const flipOpening = usePlanner((s) => s.flipOpening);
  const updateRoom = usePlanner((s) => s.updateRoom);
  const mode = usePlanner((s) => s.mode);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);

  const el = doc.elements.find((e) => e.id === selectedId);
  const room = doc.rooms.find((r) => r.id === selectedId);
  const coveredArea = doc.rooms.reduce((sum, r) => sum + roomAreaSqMm(r), 0);
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
            {el.type === 'wall' && (
              <LengthField
                id="wall-thickness"
                label="Thickness"
                mm={thicknessOf(el) * MM_PER_UNIT}
                units={units}
                min={25}
                onCommit={(mm) => updateElement({ ...el, thickness: toUnits(Math.min(mm, 1000)) })}
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
        ) : room ? (
          <div className="mb-3 flex flex-col gap-2 rounded border p-2 text-xs">
            <div className="font-medium">Selected: room</div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor="room-name" className="text-gray-600">
                Name
              </label>
              <input
                key={room.name}
                id="room-name"
                list="room-names"
                defaultValue={room.name}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim();
                  if (name && name !== room.name) updateRoom({ ...room, name });
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className="rounded border p-1"
              />
              <datalist id="room-names">
                {ROOM_NAMES.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
            <div data-testid="selected-room-area">
              Area: {formatArea(roomAreaSqMm(room), units)} · {formatMarla(roomAreaSqMm(room), marlaSqFt)}
            </div>
            <div>Floor: {materialName(room.material) ?? '—'}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => applyMaterial(room.id)} className={btn}>
                Apply selected material
              </button>
              <button onClick={() => deleteElement(room.id)} className={`${btn} text-red-700`}>
                Delete room
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
        {doc.rooms.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 rounded border p-2 text-xs" data-testid="area-summary">
            <div className="font-medium">Rooms</div>
            <ul className="flex flex-col gap-0.5">
              {doc.rooms.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 tabular-nums">
                  <span className="truncate">{r.name}</span>
                  <span>{formatArea(roomAreaSqMm(r), units)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 border-t pt-1 font-medium tabular-nums">
              <span>Covered area</span>
              <span>
                {formatArea(coveredArea, units)} · {formatMarla(coveredArea, marlaSqFt)}
              </span>
            </div>
          </div>
        )}
        {mode === 'pro' && <div className="mt-2 text-xs text-gray-600">Materials count: {doc.materials.length}</div>}
        <div className={mode === 'pro' ? 'pt-2' : 'hidden'}>
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
