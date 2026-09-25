import { placeOnWall, wallLength, withWallLength } from '../geometry';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { stairLayout } from '../lib/site';
import { SLAB_MM, WINDOW_SILL_MM } from '../three/model';
import { formatArea, formatLength, formatMarla } from '../lib/units';
import { WINDOW_HEIGHT_MM } from '../lib/shapes';
import { roomAreaSqMm } from '../rooms';
import { KIND_HEIGHT_MM, MM_PER_UNIT, usePlanner } from '../store/plannerStore';
import type { Opening, PlanElement, Stair, Wall } from '../types';
import { thicknessOf } from '../walls';
import { useLevelDoc } from '../store/useLevelDoc';
import { LengthField } from './LengthField';
import { SelectionPanel } from './SelectionPanel';

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

const SHAPE_NAMES = { rect: 'rectangle', circle: 'circle', arch: 'arch', polygon: 'polygon' } as const;

/** What to call a selected item. */
function itemName(el: PlanElement): string {
  if (el.type === 'furniture' && el.kind) return FURNITURE_CATALOG[el.kind].name;
  if (el.type === 'block')
    return el.heightMm > 0 ? `block (${SHAPE_NAMES[el.shape]})` : `${SHAPE_NAMES[el.shape]} shape`;
  if (el.type === 'window' && el.flat) return 'shape on a wall';
  if (el.type === 'window' && el.shape) return el.open ? `${el.shape} opening` : `${el.shape} window`;
  if (el.type === 'window' && el.open) return 'opening';
  return el.type;
}

/** Properties of the selected wall, opening, item or room, and a summary of the plan. */
export function Inspector() {
  const doc = useLevelDoc()!;
  const selectedId = usePlanner((s) => s.selectedId);
  const units = usePlanner((s) => s.units);
  const applyMaterial = usePlanner((s) => s.applyMaterial);
  const deleteElement = usePlanner((s) => s.deleteElement);
  const updateElement = usePlanner((s) => s.updateElement);
  const flipOpening = usePlanner((s) => s.flipOpening);
  const updateRoom = usePlanner((s) => s.updateRoom);
  const mode = usePlanner((s) => s.mode);
  const marlaSqFt = usePlanner((s) => s.marlaSqFt);
  const addParapetAround = usePlanner((s) => s.addParapetAround);
  const plinthMm = usePlanner((s) => s.doc.plinthMm);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);

  const multi = usePlanner((s) => s.selectedIds.length > 1 || s.selectedGroup() !== null);
  const el = doc.elements.find((e) => e.id === selectedId);
  const room = doc.rooms.find((r) => r.id === selectedId);
  const coveredArea = doc.rooms.reduce((sum, r) => sum + roomAreaSqMm(r), 0);
  const toUnits = (mm: number) => mm / MM_PER_UNIT;
  const materialName = (id?: string) => doc.materials.find((m) => m.id === id)?.name;
  const btn = 'm-btn';
  /** Cut a shape drawn on a wall right through it, as an open hole. */
  const cutThrough = (w: Opening) => {
    const cut = { ...w, open: true };
    delete cut.flat;
    delete cut.face;
    updateElement(cut);
  };
  /** Change a stair and work its risers and footprint out again. */
  const restair = (st: Stair, patch: Partial<Stair>) => {
    const next = { ...st, ...patch };
    const l = stairLayout(next);
    updateElement({ ...next, riserMm: l.riserMm, w: l.w, h: l.h });
  };

  return (
    <div className="flex flex-col">
      <div>
        {multi ? (
          <div className="mb-3">
            <SelectionPanel />
          </div>
        ) : el ? (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs">
            <div className="font-medium">Selected: {itemName(el)}</div>

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
            {el.type === 'wall' && (
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    [undefined, 'Wall'],
                    ['boundary', 'Boundary'],
                    ['parapet', 'Parapet'],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={label}
                    className="m-btn px-2 py-0.5"
                    aria-pressed={el.kind === kind}
                    onClick={() => updateElement({ ...el, kind, heightMm: kind ? KIND_HEIGHT_MM[kind] : undefined })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {el.type === 'wall' && (
              <LengthField
                id="wall-height-edit"
                label="Height"
                mm={el.heightMm ?? (el.kind ? KIND_HEIGHT_MM[el.kind] : wallHeightMm)}
                units={units}
                min={100}
                onCommit={(mm) => updateElement({ ...el, heightMm: Math.min(mm, 10000) })}
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
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!el.gate}
                      onChange={(e) => updateElement({ ...el, gate: e.target.checked || undefined })}
                    />
                    Gate (double leaf, no lintel)
                  </label>
                )}
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
                {el.type === 'window' && (
                  <div className="grid grid-cols-2 gap-2">
                    <LengthField
                      id="window-sill"
                      label="Sill height"
                      mm={el.sillMm ?? WINDOW_SILL_MM}
                      units={units}
                      min={0}
                      onCommit={(mm) => updateElement({ ...el, sillMm: Math.min(mm, 3000) })}
                    />
                    <LengthField
                      id="window-height"
                      label="Height"
                      mm={el.heightMm ?? WINDOW_HEIGHT_MM}
                      units={units}
                      min={50}
                      onCommit={(mm) => updateElement({ ...el, heightMm: Math.min(mm, 10000) })}
                    />
                  </div>
                )}
                {el.type === 'window' && el.flat && (
                  <>
                    <div className="text-muted">
                      Drawn on the wall's face. Push it through with Push/Pull (P) in 3D to cut the opening, or:
                    </div>
                    <button className={btn} onClick={() => cutThrough(el)}>
                      Cut through the wall
                    </button>
                  </>
                )}
                {el.type === 'window' && !el.flat && (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!el.open}
                      onChange={(e) => updateElement({ ...el, open: e.target.checked || undefined })}
                    />
                    Open (no glass)
                  </label>
                )}
                <div className="text-muted">Drag it to slide along the wall.</div>
              </>
            )}

            {el.type === 'column' && (
              <div className="grid grid-cols-2 gap-2">
                <LengthField
                  id="column-width"
                  label={el.shape === 'round' ? 'Diameter' : 'Width'}
                  mm={el.w * MM_PER_UNIT}
                  units={units}
                  min={50}
                  onCommit={(mm) =>
                    updateElement({ ...el, w: toUnits(mm), h: el.shape === 'round' ? toUnits(mm) : el.h })
                  }
                />
                {el.shape === 'rect' && (
                  <LengthField
                    id="column-depth"
                    label="Depth"
                    mm={el.h * MM_PER_UNIT}
                    units={units}
                    min={50}
                    onCommit={(mm) => updateElement({ ...el, h: toUnits(mm) })}
                  />
                )}
              </div>
            )}
            {el.type === 'column' && (
              <LengthField
                id="column-height"
                label="Height"
                mm={el.heightMm ?? wallHeightMm}
                units={units}
                min={100}
                onCommit={(mm) => updateElement({ ...el, heightMm: Math.min(mm, 30000) })}
              />
            )}
            {el.type === 'beam' && (
              <div className="grid grid-cols-2 gap-2">
                <LengthField
                  id="beam-width-edit"
                  label="Width"
                  mm={el.width * MM_PER_UNIT}
                  units={units}
                  min={50}
                  onCommit={(mm) => updateElement({ ...el, width: toUnits(mm) })}
                />
                <LengthField
                  id="beam-depth-edit"
                  label="Depth"
                  mm={el.depth * MM_PER_UNIT}
                  units={units}
                  min={50}
                  onCommit={(mm) => updateElement({ ...el, depth: toUnits(mm) })}
                />
              </div>
            )}
            {el.type === 'slab' && (
              <LengthField
                id="slab-thickness-edit"
                label="Thickness"
                mm={el.thickness * MM_PER_UNIT}
                units={units}
                min={50}
                onCommit={(mm) => updateElement({ ...el, thickness: toUnits(mm) })}
              />
            )}
            {el.type === 'slab' && (
              <button className={btn} onClick={() => addParapetAround(el.id)}>
                Parapet round this roof
              </button>
            )}
            {el.type === 'slab' && !!el.holes?.length && (
              <div className="flex items-center justify-between gap-2">
                <span data-testid="slab-voids">
                  {el.holes.length} {el.holes.length === 1 ? 'void' : 'voids'}
                </span>
                <button className={btn} onClick={() => updateElement({ ...el, holes: undefined })}>
                  Fill voids
                </button>
              </div>
            )}
            {el.type === 'block' && (
              <>
                <LengthField
                  id="block-height"
                  label="Height"
                  mm={el.heightMm}
                  units={units}
                  min={0}
                  onCommit={(mm) => updateElement({ ...el, heightMm: Math.min(mm, 30000) })}
                />
                <div className="text-muted">
                  {el.heightMm > 0
                    ? 'Push/Pull (P) its top or sides in 3D to change its size.'
                    : el.slabId
                      ? 'A flat shape on a slab: pull it up into a block, or push it down through the slab for a void.'
                      : 'A flat shape: pull it up with Push/Pull (P) in 3D, or give it a height here.'}
                </div>
              </>
            )}

            {el.type === 'plot' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(['front', 'rear', 'sides'] as const).map((side) => (
                    <LengthField
                      key={side}
                      id={`plot-${side}`}
                      label={side === 'front' ? 'Front' : side === 'rear' ? 'Rear' : 'Sides'}
                      mm={el.setbacks[side]}
                      units={units}
                      min={0}
                      onCommit={(mm) => updateElement({ ...el, setbacks: { ...el.setbacks, [side]: mm } })}
                    />
                  ))}
                </div>
                <button
                  className={btn}
                  onClick={() => updateElement({ ...el, front: (el.front + 1) % el.points.length })}
                >
                  Road on the next side
                </button>
                <div className="text-muted">The dashed line shows where you may build inside the setbacks.</div>
              </>
            )}

            {el.type === 'stair' && (
              <>
                <div className="flex flex-wrap gap-1">
                  {(['straight', 'L', 'U', 'ramp'] as const).map((shape) => (
                    <button
                      key={shape}
                      className="m-btn px-2 py-0.5"
                      aria-pressed={el.shape === shape}
                      onClick={() =>
                        restair(el, {
                          shape,
                          // A ramp usually climbs just the plinth; a stair a full floor.
                          riseMm:
                            shape === 'ramp'
                              ? Math.min(el.riseMm, plinthMm)
                              : el.shape === 'ramp'
                                ? wallHeightMm + SLAB_MM
                                : el.riseMm,
                        })
                      }
                    >
                      {shape === 'straight' ? 'Straight' : shape === 'ramp' ? 'Ramp' : `${shape}-shaped`}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <LengthField
                    id="stair-width-edit"
                    label="Width"
                    mm={el.width * MM_PER_UNIT}
                    units={units}
                    min={600}
                    onCommit={(mm) => restair(el, { width: toUnits(mm) })}
                  />
                  <LengthField
                    id="stair-rise-edit"
                    label="Climbs"
                    mm={el.riseMm}
                    units={units}
                    min={100}
                    onCommit={(mm) => restair(el, { riseMm: Math.min(mm, 10000) })}
                  />
                  {el.shape !== 'ramp' && (
                    <LengthField
                      id="stair-tread-edit"
                      label="Tread"
                      mm={el.treadMm}
                      units={units}
                      min={200}
                      onCommit={(mm) => restair(el, { treadMm: mm })}
                    />
                  )}
                </div>
                <div className="text-muted" data-testid="stair-risers">
                  {el.shape === 'ramp'
                    ? `Ramp 1 in 12, ${formatLength(el.h * MM_PER_UNIT, units)} long`
                    : `${stairLayout(el).risers} risers of ${formatLength(el.riserMm, units)}`}
                </div>
              </>
            )}

            {el.type === 'furniture' && (
              <>
                <div className="flex flex-col gap-0.5">
                  <label htmlFor="furniture-label" className="text-muted">
                    Name
                  </label>
                  <input
                    key={el.label ?? ''}
                    id="furniture-label"
                    defaultValue={el.label ?? ''}
                    placeholder={el.kind ? FURNITURE_CATALOG[el.kind].name : 'Furn'}
                    onBlur={(e) => {
                      const label = e.currentTarget.value.trim() || undefined;
                      if (label !== el.label) updateElement({ ...el, label });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="rounded-sm border p-1"
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
                  <label htmlFor="furniture-rotation" className="text-muted">
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
                    className="rounded-sm border p-1 tabular-nums"
                  />
                </div>
                <div className="text-muted">Drag the corner handle to resize, the top handle to rotate.</div>
              </>
            )}

            {el.type !== 'door' && el.type !== 'window' && el.type !== 'plot' && (
              <LengthField
                id="elevation"
                label="Height above floor"
                mm={el.elevMm ?? 0}
                units={units}
                min={-5000}
                onCommit={(mm) => updateElement({ ...el, elevMm: Math.min(mm, 30000) || undefined })}
              />
            )}
            <div>Material: {materialName(el.material) ?? '—'}</div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => applyMaterial(el.id)} className={btn}>
                Apply selected material
              </button>
              <button onClick={() => deleteElement(el.id)} className={`${btn} m-btn-danger`}>
                Delete
              </button>
            </div>
          </div>
        ) : room ? (
          <div className="mb-3 flex flex-col gap-2 rounded-md border border-line bg-raised p-2 text-xs">
            <div className="font-medium">Selected: room</div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor="room-name" className="text-muted">
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
                className="rounded-sm border p-1"
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
              <button onClick={() => deleteElement(room.id)} className={`${btn} m-btn-danger`}>
                Delete room
              </button>
            </div>
          </div>
        ) : null}
        <div className="text-xs text-muted">
          Walls: {doc.elements.filter((e) => e.type === 'wall').length} · total length{' '}
          {formatLength(
            doc.elements.reduce((sum, e) => sum + (e.type === 'wall' ? wallLength(e) : 0), 0) * MM_PER_UNIT,
            units,
          )}
        </div>
        {doc.rooms.length > 0 && (
          <div
            className="mt-2 flex flex-col gap-1 rounded-md border border-line bg-raised p-2 text-xs"
            data-testid="area-summary"
          >
            <div className="font-medium">Rooms</div>
            <ul className="flex flex-col gap-0.5">
              {doc.rooms.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 tabular-nums">
                  <span className="truncate">{r.name}</span>
                  <span>{formatArea(roomAreaSqMm(r), units)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between gap-2 border-t border-line pt-1 font-medium tabular-nums">
              <span>Covered area</span>
              <span>
                {formatArea(coveredArea, units)} · {formatMarla(coveredArea, marlaSqFt)}
              </span>
            </div>
          </div>
        )}
        <div className={mode === 'pro' && doc.masks.length ? 'pt-2' : 'hidden'}>
          <div className="m-heading">Masks</div>
          <ul className="mt-2 text-xs">
            {doc.masks.map((m) => (
              <li key={m.id} className="rounded-sm border p-1">
                {m.name} — material: {materialName(m.material) ?? m.material}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
