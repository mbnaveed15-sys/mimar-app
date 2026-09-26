import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MENUS, showKeys, type Command, type MenuId } from '../commands';
import { baseName } from '../lib/files';
import { usePlanner } from '../store/plannerStore';
import { Icon } from './Icon';
import { LevelSwitcher } from './LevelSwitcher';
import { Mark } from './Mark';

/** The items of one menu, with lines between groups. */
function MenuList({ commands, onDone }: { commands: Command[]; onDone: () => void }) {
  // Menus read live state (ticks, greyed-out items), so re-render on any change while open.
  const state = usePlanner((s) => s);
  const visible = commands.filter((c) => !c.hidden?.(state));
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(listRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    next?.focus();
  }

  return (
    <div
      ref={listRef}
      role="menu"
      onKeyDown={onKeyDown}
      className="absolute top-full left-0 z-40 mt-1 max-h-[80vh] min-w-60 overflow-auto rounded-md border border-line bg-raised p-1 shadow-popover"
    >
      {visible.map((c, i) => {
        const enabled = !c.enabled || c.enabled(state);
        const checked = c.checked?.(state);
        const role = c.kind === 'check' ? 'menuitemcheckbox' : c.kind === 'radio' ? 'menuitemradio' : 'menuitem';
        return (
          <div key={c.id}>
            {i > 0 && visible[i - 1].group !== c.group && <div role="separator" className="my-1 h-px bg-line" />}
            <button
              role={role}
              aria-checked={c.kind ? !!checked : undefined}
              aria-disabled={!enabled}
              aria-label={c.label}
              aria-keyshortcuts={c.keys?.[0]}
              tabIndex={-1}
              onClick={() => {
                if (!enabled) return;
                onDone();
                c.run();
              }}
              className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left focus:bg-accent-soft focus:outline-none ${
                enabled ? 'hover:bg-accent-soft' : 'cursor-default opacity-45'
              }`}
            >
              <span className="grid w-4 place-items-center text-accent-ink">
                {checked && (c.kind === 'radio' ? '•' : <Icon name="check" size={14} />)}
              </span>
              <span className="flex-1">{c.label}</span>
              {c.keys?.[0] && <kbd className="m-kbd">{showKeys(c.keys[0])}</kbd>}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Top bar: logo, the menus, the plan's name, mode and 2D/3D switches, and search. */
export function MenuBar({ commands, onSearch }: { commands: Command[]; onSearch: () => void }) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const fileName = usePlanner((s) => s.fileName);
  const dirty = usePlanner((s) => s.doc !== s.savedDoc);
  const mode = usePlanner((s) => s.mode);
  const setMode = usePlanner((s) => s.setMode);
  const view3d = usePlanner((s) => s.view3d);
  const setView3d = usePlanner((s) => s.setView3d);
  const split = usePlanner((s) => s.split);
  const setSplit = usePlanner((s) => s.setSplit);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        // Focus stays on the menu's name (only if it was in the menu), rather than getting lost.
        const inMenu = barRef.current?.contains(document.activeElement);
        setOpen(null);
        if (inMenu) barRef.current?.querySelector<HTMLElement>(`[data-menu="${open}"]`)?.focus();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  function onMenuKey(e: KeyboardEvent, id: MenuId) {
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      setOpen(id);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = MENUS.findIndex((m) => m.id === id);
    const next = MENUS[(i + (e.key === 'ArrowRight' ? 1 : MENUS.length - 1)) % MENUS.length];
    setOpen(next.id);
    barRef.current?.querySelector<HTMLElement>(`[data-menu="${next.id}"]`)?.focus();
  }

  return (
    <header className="flex h-10 flex-none items-center gap-2 border-b border-line bg-surface px-2">
      <div className="flex flex-none items-center gap-2 pr-1">
        <Mark size={24} />
        <span className="text-[17px] font-[650] tracking-[-0.2px]" style={{ fontStretch: '88%' }}>
          Mimar
        </span>
      </div>
      <div ref={barRef} role="menubar" aria-label="Main menu" className="flex flex-none">
        {MENUS.map((m) => (
          <div key={m.id} className="relative" onKeyDown={(e) => onMenuKey(e, m.id)}>
            <button
              data-menu={m.id}
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onPointerEnter={() => open && setOpen(m.id)}
              className={`rounded-sm px-2 py-1.5 xl:px-2.5 ${open === m.id ? 'bg-sunken' : 'hover:bg-sunken'}`}
            >
              {m.label}
            </button>
            {open === m.id && (
              <MenuList commands={commands.filter((c) => c.menu === m.id)} onDone={() => setOpen(null)} />
            )}
          </div>
        ))}
      </div>

      <div className="mx-auto min-w-0 truncate px-2 text-muted" title={fileName} data-testid="file-name">
        <span className="font-semibold text-ink">{baseName(fileName)}</span>
        {dirty && <span className="font-medium text-accent-ink"> • unsaved changes</span>}
      </div>

      {/* On narrower screens (down to 1024 px) the buttons keep their icons and drop their words. */}
      <button
        onClick={onSearch}
        className="m-btn hidden h-7 flex-none gap-2 whitespace-nowrap text-muted md:inline-flex"
        title={`Search actions (${showKeys('Ctrl+K')})`}
        aria-label="Search"
      >
        <Icon name="search" size={16} />
        <span className="hidden xl:inline">Search</span>
        <kbd className="m-kbd hidden xl:inline">{showKeys('Ctrl+K')}</kbd>
      </button>
      <LevelSwitcher />
      <div role="radiogroup" aria-label="Mode" className="m-seg flex-none text-xs whitespace-nowrap">
        {(['simple', 'pro'] as const).map((m) => (
          <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
            {m === 'simple' ? 'Simple' : 'Pro'}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="View" className="m-seg flex-none text-xs whitespace-nowrap">
        {[
          { id: '2d', label: '2D plan', icon: 'view-2d' as const, keys: 'Ctrl+1' },
          { id: 'split', label: 'Split', icon: 'view-split' as const, keys: 'Ctrl+3' },
          { id: '3d', label: '3D view', icon: 'view-3d' as const, keys: 'Ctrl+2' },
        ].map((v) => (
          <button
            key={v.id}
            role="radio"
            aria-checked={split ? v.id === 'split' : v.id === (view3d ? '3d' : '2d')}
            aria-label={v.label}
            title={`${v.label} (${showKeys(v.keys)})`}
            onClick={() => (v.id === 'split' ? setSplit(true) : setView3d(v.id === '3d'))}
          >
            <Icon name={v.icon} size={16} />
            <span className="hidden xl:inline">{v.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
