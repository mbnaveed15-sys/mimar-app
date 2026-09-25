import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MENUS, showKeys, type Command } from '../commands';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { Icon } from './Icon';

/** A centred dialog over a dimmed app; Esc or a click outside closes it. */
function Modal({
  label,
  onClose,
  children,
  wide,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/30 pt-[12vh]"
      onPointerDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex max-h-[76vh] w-[92vw] flex-col overflow-hidden rounded-lg border border-line bg-raised text-ink shadow-popover ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

/** Ctrl+K: type part of a name to find and run any action. */
export function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const state = usePlanner((s) => s);
  const menuName = (id: string) => MENUS.find((m) => m.id === id)?.label ?? '';
  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((c) => {
      const text = `${c.label} ${menuName(c.menu)}`.toLowerCase();
      return words.every((w) => text.includes(w)) && (!c.enabled || c.enabled(state));
    });
  }, [commands, query, state]);
  const current = Math.min(index, Math.max(0, matches.length - 1));

  function run(c: Command | undefined) {
    if (!c) return;
    onClose();
    c.run();
  }

  return (
    <Modal label="Search actions" onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <Icon name="search" size={18} className="text-muted" />
        <input
          autoFocus
          aria-label="Search actions"
          placeholder="Type an action, e.g. wall, export, grid…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIndex((current + 1) % Math.max(1, matches.length));
            else if (e.key === 'ArrowUp') setIndex((current - 1 + matches.length) % Math.max(1, matches.length));
            else if (e.key === 'Enter') run(matches[current]);
            else return;
            e.preventDefault();
          }}
          className="h-11 flex-1 border-0 text-sm focus:outline-none"
          style={{ background: 'transparent' }}
        />
      </div>
      <ul role="listbox" aria-label="Actions" className="overflow-auto p-1">
        {matches.map((c, i) => (
          <li
            key={c.id}
            role="option"
            aria-selected={i === current}
            onPointerEnter={() => setIndex(i)}
            onClick={() => run(c)}
            className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 ${i === current ? 'bg-accent-soft' : ''}`}
          >
            <span className="w-12 text-[11px] text-muted">{menuName(c.menu)}</span>
            <span className="flex-1">{c.label}</span>
            {c.keys?.[0] && <kbd className="m-kbd">{showKeys(c.keys[0])}</kbd>}
          </li>
        ))}
        {!matches.length && <li className="px-2 py-3 text-muted">Nothing matches “{query}”.</li>}
      </ul>
    </Modal>
  );
}

/** Keys that are not menu commands but matter while drawing. */
const DRAWING_KEYS: [string, string][] = [
  ['Type a value, then Enter', 'Set an exact length, size, angle or distance (Measurements box)'],
  ['Right arrow', 'Lock to the red (horizontal) axis; press again to unlock'],
  ['Left / Up arrow', 'Lock to the green (vertical) axis'],
  ['Up / Down arrow while moving in 3D', 'Lock to the blue axis: raise or lower, or type a height'],
  ['Hold Shift', 'Keep the current direction while you move the mouse'],
  ['Ctrl while moving', 'Copy instead of move; then type 3x or /3 for more copies'],
  ['Esc', 'Cancel the current step; press again to drop the selection'],
  ['Enter', 'Finish (stop a chain of walls, close a mask)'],
  ['Drag left → right', 'Select what is fully inside the box'],
  ['Drag right → left', 'Select anything the box touches'],
  ['Shift+click', 'Add to or take out of the selection'],
  ['Double-click a group', 'Edit inside it; Esc closes it (component copies then update)'],
  ['Arrow keys with a selection', 'Nudge by one grid step; Shift for a fifth of a step'],
  ['Alt+Up / Alt+Down with a selection', 'Raise or lower by one grid step; Shift for a fifth'],
  ['Middle-drag / scroll', 'Pan / zoom with any tool'],
];

/** ?: every shortcut, grouped by menu. */
export function ShortcutsDialog({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
        <button className="m-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="grid gap-x-8 gap-y-4 overflow-auto p-4 text-xs sm:grid-cols-2">
        {MENUS.map((m) => {
          const list = commands.filter((c) => c.menu === m.id && c.keys?.length);
          if (!list.length) return null;
          return (
            <section key={m.id}>
              <h3 className="m-heading mb-1">{m.label}</h3>
              {list.map((c) => (
                <div key={c.id} className="flex justify-between gap-3 py-0.5">
                  <span>{c.label}</span>
                  <kbd className="m-kbd">{showKeys(c.keys![0])}</kbd>
                </div>
              ))}
            </section>
          );
        })}
        <section className="sm:col-span-2">
          <h3 className="m-heading mb-1">While drawing</h3>
          {DRAWING_KEYS.map(([k, what]) => (
            <div key={k} className="flex justify-between gap-3 py-0.5">
              <span>{what}</span>
              <kbd className="m-kbd whitespace-nowrap">{k}</kbd>
            </div>
          ))}
        </section>
      </div>
    </Modal>
  );
}

/** Asks before unsaved changes are thrown away. */
export function DiscardDialog({
  action,
  onConfirm,
  onCancel,
}: {
  action: 'new' | 'open';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30">
      <div
        role="alertdialog"
        aria-label="Unsaved changes"
        className="w-[92vw] max-w-sm rounded-lg border border-line bg-raised p-4 shadow-popover"
      >
        <p className="font-semibold">This plan has unsaved changes that will be lost.</p>
        <p className="mt-1 text-xs text-muted">Save it first with Ctrl+S if you want to keep them.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button autoFocus onClick={onCancel} className="m-btn">
            Cancel
          </button>
          <button onClick={onConfirm} className="m-btn m-btn-danger">
            {action === 'new' ? 'Discard and start new' : 'Discard and open'}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface ContextMenuState {
  x: number;
  y: number;
  id: string | null;
}

/** Right-click menu for the item under the pointer. */
export function ContextMenu({
  at,
  onClose,
  onProperties,
}: {
  at: ContextMenuState;
  onClose: () => void;
  onProperties: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const s = plannerStore.getState();
  const el = s.doc.elements.find((e) => e.id === at.id);
  const room = s.doc.rooms.find((r) => r.id === at.id);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const items: { label: string; run: () => void; danger?: boolean }[] = [];
  const many = s.selectedIds.length > 1;
  const group = s.selectedGroup();
  if (el?.type === 'door' && !many) {
    items.push({ label: 'Flip swing', run: () => s.flipOpening(el.id, 'side') });
    items.push({ label: 'Flip hinge', run: () => s.flipOpening(el.id, 'hinge') });
  }
  if (s.selectedIds.some((id) => s.doc.elements.some((x) => x.id === id && x.type === 'line')))
    items.push({ label: 'Turn into walls', run: () => s.linesToWalls() });
  if (el?.type === 'slab' && !many) items.push({ label: 'Parapet round roof', run: () => s.addParapetAround(el.id) });
  if (el?.type === 'stair' && !many) items.push({ label: 'Rotate 90°', run: () => s.rotateSelected(90) });
  if (group) {
    items.push({ label: group.componentId ? 'Edit component' : 'Edit group', run: () => s.openGroup(group.id) });
    items.push({ label: group.componentId ? 'Explode' : 'Ungroup', run: () => s.ungroupSelected() });
  } else if (many) {
    items.push({ label: 'Make group', run: () => s.groupSelected() });
    items.push({ label: 'Make component', run: () => s.makeComponentFromSelection() });
  }
  if (many || group || el?.type === 'wall' || el?.type === 'furniture') {
    items.push({ label: 'Rotate 90°', run: () => s.rotateSelected(90) });
    items.push({ label: 'Duplicate', run: () => s.duplicateSelected() });
    items.push({ label: 'Move', run: () => s.setTool('move') });
  }
  if (el || room || many || group) {
    items.push({ label: 'Hide', run: () => s.hideSelected() });
    items.push({ label: 'Lock', run: () => s.lockSelected(true) });
  }
  if (el || room) {
    if (!many && !group) items.push({ label: room ? 'Rename…' : 'Properties', run: onProperties });
    items.push({
      label: many || group ? 'Delete selection' : room ? 'Delete room' : 'Delete',
      run: () => s.deleteSelected(),
      danger: true,
    });
  } else {
    items.push({ label: 'Paste', run: () => s.paste() });
    items.push({ label: 'Select all', run: () => s.selectAll() });
    items.push({ label: 'Zoom extents', run: () => s.fitToPlan() });
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Context menu"
      className="fixed z-50 min-w-44 rounded-md border border-line bg-raised p-1 text-sm shadow-popover"
      style={{
        left: Math.min(at.x, window.innerWidth - 190),
        top: Math.min(at.y, window.innerHeight - 40 * items.length),
      }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          role="menuitem"
          onClick={() => {
            onClose();
            it.run();
          }}
          className={`block w-full rounded-sm px-2 py-1.5 text-left hover:bg-accent-soft focus:bg-accent-soft focus:outline-none ${
            it.danger ? 'text-danger' : ''
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
