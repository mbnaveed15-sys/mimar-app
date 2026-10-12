import { useRef, useState } from 'react';
import { usePlanner } from '../store/plannerStore';
import { TOOL_INFO } from '../tools/toolInfo';
import { PHONE_ALWAYS, PHONE_GROUPS, phoneGroupOf, type PhoneGroupId } from '../lib/toolbars';
import type { Tool } from '../types';
import { Icon } from './Icon';

/** How long a tool is held before its name shows (ms). */
const HOLD_MS = 450;

/**
 * The tools on a phone: one scrolling strip along the bottom, a group at a time, with the groups
 * to switch between above it. Hold a tool to see its name.
 */
export function PhoneTools() {
  const tool = usePlanner((s) => s.tool);
  const setTool = usePlanner((s) => s.setTool);
  // The group picked, and the tool that was in use then: a tool picked some other way (a key, a
  // menu) brings its own group forward.
  const [picked, setPicked] = useState<{ group: PhoneGroupId; tool: Tool } | null>(null);
  const [name, setName] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const inGroup = (g: PhoneGroupId) =>
    PHONE_ALWAYS.includes(tool) || (PHONE_GROUPS.find((x) => x.id === g)!.tools as readonly Tool[]).includes(tool);
  const group = picked && (picked.tool === tool || inGroup(picked.group)) ? picked.group : phoneGroupOf(tool);
  const shown = PHONE_GROUPS.find((g) => g.id === group)!;
  const tools = shown.tools as readonly Tool[];

  const hold = (t: Tool) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setName(TOOL_INFO[t].label), HOLD_MS);
  };
  const release = () => {
    window.clearTimeout(timer.current);
    if (name) timer.current = window.setTimeout(() => setName(null), 1000);
  };

  const button = (t: Tool) => {
    const info = TOOL_INFO[t];
    const active = tool === t;
    return (
      <button
        key={t}
        onClick={() => setTool(t)}
        onPointerDown={() => hold(t)}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
        aria-pressed={active}
        aria-label={info.label}
        title={info.label}
        className={`grid h-11 w-11 flex-none place-items-center rounded-md select-none ${active ? 'bg-accent text-on-accent' : 'text-ink active:bg-sunken'}`}
      >
        <Icon name={info.icon} size={22} />
      </button>
    );
  };

  return (
    <nav aria-label="Tools" data-testid="phone-tools" className="relative flex-none border-t border-line bg-surface">
      <div
        role="radiogroup"
        aria-label="Tool groups"
        className="flex gap-1 overflow-x-auto px-2 pt-1.5 text-xs phone-short:hidden"
      >
        {PHONE_GROUPS.map((g) => (
          <button
            key={g.id}
            role="radio"
            aria-checked={g.id === group}
            onClick={() => setPicked({ group: g.id, tool })}
            className={`flex-none rounded-full px-3 py-1 font-medium ${g.id === group ? 'bg-ink text-surface' : 'text-muted active:bg-sunken'}`}
          >
            {g.label}
          </button>
        ))}
      </div>
      <div
        role="toolbar"
        aria-label={`${shown.label} tools`}
        className="flex items-center gap-0.5 overflow-x-auto px-1.5 py-1"
      >
        {/* A phone on its side has no room for the row of groups: a list of them starts the strip. */}
        <select
          aria-label="Tool group"
          value={group}
          onChange={(e) => setPicked({ group: e.target.value as PhoneGroupId, tool })}
          className="mr-1 hidden h-9 flex-none rounded-full border border-line bg-raised px-2 text-xs font-medium phone-short:block"
        >
          {PHONE_GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        {PHONE_ALWAYS.map(button)}
        <span aria-hidden className="mx-1 h-7 w-px flex-none bg-line" />
        {tools.map(button)}
      </div>
      {name && (
        <div
          role="status"
          className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md border border-line bg-raised px-2.5 py-1 text-sm whitespace-nowrap shadow-popover"
        >
          {name}
        </div>
      )}
    </nav>
  );
}
