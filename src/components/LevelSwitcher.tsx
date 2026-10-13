import { useEffect, useRef, useState } from 'react';
import { buildingLevels, lawnMm } from '../lib/levels';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { BASEMENT_HEIGHT_MM, GROUND_LEVEL } from '../types';
import { LengthField } from './LengthField';
import { Icon } from './Icon';

const MAX_GROUND_MM = 1_000_000;

/**
 * Pick the floor to draw on, add floors, and rename or delete them. The ground floor and its lawn
 * (Ground (site), added to the plan when first picked) are one entry: its Floor | Lawn switch picks
 * which new items go on, and it holds the lawn and plinth heights.
 */
export function LevelSwitcher() {
  const levels = usePlanner((s) => s.doc.levels);
  const plinthMm = usePlanner((s) => s.doc.plinthMm);
  const ownPlinth = usePlanner((s) => !!s.doc.ownPlinth);
  const lawn = usePlanner((s) => lawnMm(s.doc));
  const natural = usePlanner((s) => s.doc.ground?.grade === 'natural');
  const active = usePlanner((s) => s.activeLevel);
  const units = usePlanner((s) => s.units);
  const wallHeightMm = usePlanner((s) => s.wallHeightMm);
  const belowOpacity = usePlanner((s) => s.belowOpacity);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = levels.find((l) => l.id === active) ?? levels[0];
  const groundFloor = levels.find((l) => l.id === GROUND_LEVEL) ?? current;
  // Ground: its floor or its lawn is being drawn on.
  const onGround = current.id === GROUND_LEVEL || !!current.site;
  const shownName = current.site ? `${groundFloor.name} · lawn` : current.name;
  const s = plannerStore.getState();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const item = 'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent-soft';
  return (
    <div ref={ref} className="relative flex-none">
      <button
        className="m-btn h-7 max-w-40 text-xs whitespace-nowrap phone:max-w-24 phone:px-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Floor: ${shownName}`}
        title="Floor being drawn (Page Up / Page Down)"
        onClick={() => {
          setOpen(!open);
          setRenaming(false);
        }}
      >
        <Icon name="levels" size={16} />
        <span className="truncate">{shownName}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Floors"
          className="absolute top-full right-0 z-40 mt-1 w-56 rounded-md border border-line bg-raised p-1 text-sm shadow-popover"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          {[...buildingLevels({ levels })].reverse().map((l) => {
            const here = l.id === active || (l.id === GROUND_LEVEL && onGround);
            return (
              <button
                key={l.id}
                role="menuitemradio"
                aria-checked={here}
                className={item}
                onClick={() => {
                  // Ground opens on its floor, unless its lawn is already being drawn on.
                  if (!(l.id === GROUND_LEVEL && onGround)) s.setActiveLevel(l.id);
                  setOpen(false);
                }}
              >
                <span className="w-3 text-accent-ink">{here ? '•' : ''}</span>
                {l.name}
              </button>
            );
          })}
          {onGround && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="text-muted">Draw on</span>
              <div className="flex gap-1" role="group" aria-label="Draw on the ground floor or the lawn">
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  aria-pressed={!current.site}
                  title="New items go on the ground floor, at the plinth's top"
                  onClick={() => s.setActiveLevel(GROUND_LEVEL)}
                >
                  Floor
                </button>
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  aria-pressed={!!current.site}
                  title="New items go on the lawn under the floor: plinth walls, platforms, steps and the garden"
                  onClick={() => s.showSiteLevel()}
                >
                  Lawn
                </button>
              </div>
            </div>
          )}
          <div role="separator" className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => (s.addLevel(), setOpen(false))}>
            <span className="w-3" />
            Add floor above
          </button>
          {!current.site && (
            <button
              role="menuitem"
              className={item}
              title="A new floor on top with a copy of this floor's walls, doors, windows, rooms and furniture"
              onClick={() => (s.duplicateLevel(), setOpen(false))}
            >
              <span className="w-3" />
              Duplicate this floor above
            </button>
          )}
          {!levels.some((l) => l.basement) && (
            <button role="menuitem" className={item} onClick={() => (s.addBasement(), setOpen(false))}>
              <span className="w-3" />
              Add basement below
            </button>
          )}
          {onGround && (
            <div className="flex flex-col gap-1.5 px-2 py-1" data-testid="site-heights">
              {natural ? (
                <div className="text-xs text-muted">Lawn: the natural ground (Ground and site panel)</div>
              ) : (
                <LengthField
                  id="lawn-height"
                  label="Lawn height (above road level)"
                  mm={lawn}
                  units={units}
                  min={-MAX_GROUND_MM}
                  onCommit={(mm) => s.setGround({ levelMm: Math.min(mm, MAX_GROUND_MM) })}
                />
              )}
              <LengthField
                id="site-plinth-height"
                label="Plinth height (ground floor above road level)"
                mm={plinthMm}
                units={units}
                min={0}
                onCommit={(mm) => s.setPlinthMm(mm)}
              />
              <div className="text-xs text-muted">Plinth</div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Plinth">
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  aria-pressed={!ownPlinth}
                  title="Ground-floor walls run down to the ground"
                  onClick={() => s.setOwnPlinth(false)}
                >
                  Automatic
                </button>
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  aria-pressed={ownPlinth}
                  title="Ground-floor walls start at the floor: draw the plinth on the lawn"
                  onClick={() => s.setOwnPlinth(true)}
                >
                  Draw my own
                </button>
              </div>
              <div className="text-xs text-muted">
                {ownPlinth
                  ? 'Ground-floor walls start at the floor. Walls drawn on the lawn rise from it to the floor.'
                  : 'Ground-floor walls run down to the ground. Pick Draw my own to build the plinth on the lawn.'}
              </div>
            </div>
          )}
          {!current.basement && !current.site && (
            <div className="px-2 py-1">
              <LengthField
                id="floor-height"
                label={`Wall height of the ${current.name.toLowerCase()}`}
                mm={current.heightMm ?? wallHeightMm}
                units={units}
                min={2000}
                onCommit={(mm) => s.setLevelHeight(current.id, Math.min(mm, 9000))}
              />
              {current.heightMm !== undefined && (
                <button
                  className="m-btn mt-1 px-2 py-0.5 text-xs"
                  onClick={() => s.setLevelHeight(current.id, undefined)}
                >
                  Use the usual height
                </button>
              )}
            </div>
          )}
          {current.basement && (
            <div className="px-2 py-1">
              <LengthField
                id="basement-height"
                label="Basement clear height"
                mm={current.heightMm ?? BASEMENT_HEIGHT_MM}
                units={units}
                min={1800}
                onCommit={(mm) => s.setBasementHeight(Math.min(mm, 9000))}
              />
              <div className="mt-2 text-xs text-muted">Retaining walls round it (12" RCC):</div>
              <div className="mt-1 flex flex-wrap gap-1">
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  title="Under the ground floor's outside walls (CDA: the plinth area only)"
                  onClick={() => s.addRetainingWalls('house') && setOpen(false)}
                >
                  Under the house
                </button>
                <button
                  className="m-btn px-2 py-0.5 text-xs"
                  title="On the plot's building line (DHA: 100% after the setbacks)"
                  onClick={() => s.addRetainingWalls('building') && setOpen(false)}
                >
                  Whole building line
                </button>
              </div>
            </div>
          )}
          {buildingLevels({ levels }).findIndex((l) => l.id === (current.site ? GROUND_LEVEL : current.id)) > 0 && (
            <label className="flex items-center gap-2 px-2 py-1 text-xs">
              <span className="text-muted">Floor below</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Floor below: how strongly it shows"
                value={belowOpacity}
                onChange={(e) => s.setBelowOpacity(Number(e.target.value))}
                className="min-w-0 flex-1"
              />
              <span className="w-8 text-right tabular-nums">{belowOpacity ? `${belowOpacity}%` : 'Off'}</span>
            </label>
          )}
          {renaming ? (
            <input
              autoFocus
              aria-label="Floor name"
              defaultValue={current.name}
              className="mx-1 my-1 w-[calc(100%-8px)] rounded-sm border p-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  s.renameLevel(current.id, e.currentTarget.value);
                  setOpen(false);
                }
              }}
              onBlur={(e) => s.renameLevel(current.id, e.currentTarget.value)}
            />
          ) : current.site ? null : (
            <button role="menuitem" className={item} onClick={() => setRenaming(true)}>
              <span className="w-3" />
              Rename this floor…
            </button>
          )}
          {current.id !== GROUND_LEVEL && !current.site && (
            <button
              role="menuitem"
              className={`${item} text-danger`}
              onClick={() => {
                if (window.confirm(`Delete ${current.name} and everything on it? You can undo this with Ctrl+Z.`)) {
                  s.deleteLevel(current.id);
                  setOpen(false);
                }
              }}
            >
              <span className="w-3" />
              Delete this floor
            </button>
          )}
        </div>
      )}
    </div>
  );
}
