import { useEffect, useRef, useState } from 'react';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { GROUND_LEVEL } from '../types';
import { Icon } from './Icon';

/** Pick the floor to draw on, add floors, and rename or delete them. */
export function LevelSwitcher() {
  const levels = usePlanner((s) => s.doc.levels);
  const active = usePlanner((s) => s.activeLevel);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = levels.find((l) => l.id === active) ?? levels[0];
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
        className="m-btn h-7 max-w-40 text-xs whitespace-nowrap"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Floor: ${current.name}`}
        title="Floor being drawn (Page Up / Page Down)"
        onClick={() => {
          setOpen(!open);
          setRenaming(false);
        }}
      >
        <Icon name="levels" size={16} />
        <span className="truncate">{current.name}</span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Floors"
          className="absolute top-full right-0 z-40 mt-1 w-56 rounded-md border border-line bg-raised p-1 text-sm shadow-popover"
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          {[...levels].reverse().map((l) => (
            <button
              key={l.id}
              role="menuitemradio"
              aria-checked={l.id === active}
              className={item}
              onClick={() => {
                s.setActiveLevel(l.id);
                setOpen(false);
              }}
            >
              <span className="w-3 text-accent-ink">{l.id === active ? '•' : ''}</span>
              {l.name}
            </button>
          ))}
          <div role="separator" className="my-1 h-px bg-line" />
          <button role="menuitem" className={item} onClick={() => (s.addLevel(), setOpen(false))}>
            <span className="w-3" />
            Add floor above
          </button>
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
          ) : (
            <button role="menuitem" className={item} onClick={() => setRenaming(true)}>
              <span className="w-3" />
              Rename this floor…
            </button>
          )}
          {current.id !== GROUND_LEVEL && (
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
