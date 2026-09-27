import { DOOR_KIND_NAMES, DOOR_KINDS, doorKindOf, WINDOW_KIND_NAMES, WINDOW_KINDS } from '../lib/openingKinds';
import { WINDOW_HEIGHT_MM } from '../lib/shapes';
import { MM_PER_UNIT } from '../lib/scale';
import { usePlanner } from '../store/plannerStore';
import { WINDOW_SILL_MM } from '../three/model';
import type { DoorKind, Opening, WindowKind } from '../types';
import { LengthField } from './LengthField';

/** The value they all share, or null when they differ. */
function shared<T>(list: Opening[], get: (o: Opening) => T): T | null {
  const first = list.length ? get(list[0]) : null;
  return list.every((o) => get(o) === first) ? first : null;
}

/**
 * Several doors and windows selected: change their type, width, hinge, swing, sill and height
 * together (each change one undo step). Widths are fitted in their walls, clear of the corners.
 */
export function OpeningsPanel() {
  const doc = usePlanner((s) => s.doc);
  const selectedIds = usePlanner((s) => s.selectedIds);
  const units = usePlanner((s) => s.units);
  const editOpenings = usePlanner((s) => s.editOpenings);
  const openings = selectedIds
    .map((id) => doc.elements.find((el) => el.id === id))
    .filter((el): el is Opening => (el?.type === 'door' || el?.type === 'window') && !el.flat);
  const doors = openings.filter((o) => o.type === 'door');
  const windows = openings.filter((o) => o.type === 'window');
  if (openings.length < 2) return null;
  const ids = (list: Opening[]) => list.map((o) => o.id);
  const plainWindows = windows.filter((w) => !w.shape && !w.open);
  const doorKind = shared(
    doors.filter((d) => !d.gate),
    (d) => doorKindOf(d),
  );
  const windowKind = shared(plainWindows, (w) => w.windowKind ?? '');

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2" data-testid="openings-panel">
      {doors.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="font-medium">
            {doors.length} {doors.length === 1 ? 'door' : 'doors'}
          </div>
          <LengthField
            id="doors-width"
            label="Width"
            mm={(shared(doors, (d) => d.width) ?? doors[0].width) * MM_PER_UNIT}
            units={units}
            min={300}
            onCommit={(mm) => editOpenings(ids(doors), () => ({ width: Math.min(mm, 12000) / MM_PER_UNIT }))}
          />
          {doors.some((d) => !d.gate) && (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted">Door type</span>
              <select
                className="rounded-sm border p-1"
                value={doorKind ?? ''}
                onChange={(e) => {
                  const kind = e.target.value as DoorKind;
                  editOpenings(ids(doors.filter((d) => !d.gate)), () => ({
                    doorKind: kind === 'single' ? undefined : kind,
                  }));
                }}
              >
                {doorKind === null && <option value="">Mixed</option>}
                {DOOR_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOOR_KIND_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex gap-1.5">
            <button
              className="m-btn"
              onClick={() => editOpenings(ids(doors), (d) => ({ flipSide: !d.flipSide || undefined }))}
            >
              Flip swing
            </button>
            <button
              className="m-btn"
              onClick={() => editOpenings(ids(doors), (d) => ({ flipHinge: !d.flipHinge || undefined }))}
            >
              Flip hinge
            </button>
          </div>
        </div>
      )}
      {windows.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="font-medium">
            {windows.length} {windows.length === 1 ? 'window' : 'windows'}
          </div>
          <LengthField
            id="windows-width"
            label="Width"
            mm={(shared(windows, (w) => w.width) ?? windows[0].width) * MM_PER_UNIT}
            units={units}
            min={150}
            onCommit={(mm) => editOpenings(ids(windows), () => ({ width: Math.min(mm, 6000) / MM_PER_UNIT }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <LengthField
              id="windows-sill"
              label="Sill height"
              mm={shared(windows, (w) => w.sillMm ?? WINDOW_SILL_MM) ?? WINDOW_SILL_MM}
              units={units}
              min={0}
              onCommit={(mm) => editOpenings(ids(windows), () => ({ sillMm: Math.min(mm, 3000) }))}
            />
            <LengthField
              id="windows-height"
              label="Height"
              mm={shared(windows, (w) => w.heightMm ?? WINDOW_HEIGHT_MM) ?? WINDOW_HEIGHT_MM}
              units={units}
              min={50}
              onCommit={(mm) => editOpenings(ids(windows), () => ({ heightMm: Math.min(mm, 10000) }))}
            />
          </div>
          {plainWindows.length > 0 && (
            <label className="flex flex-col gap-0.5">
              <span className="text-muted">Window type</span>
              <select
                className="rounded-sm border p-1"
                value={windowKind ?? 'mixed'}
                onChange={(e) =>
                  editOpenings(ids(plainWindows), () => ({
                    windowKind: (e.target.value || undefined) as WindowKind | undefined,
                  }))
                }
              >
                {windowKind === null && <option value="mixed">Mixed</option>}
                {windowKind === '' && <option value="">Plain</option>}
                {WINDOW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {WINDOW_KIND_NAMES[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
