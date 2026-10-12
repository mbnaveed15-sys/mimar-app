import type { Tool } from '../types';

/**
 * AutoCAD command aliases, typed as quick letter sequences (each letter within a second of the
 * last). The first letter still picks its own tool; the whole sequence then picks the alias's.
 * O (Offset in AutoCAD) stays Orbit here; Offset is F. There is no ARC: A then R (Room, then Rectangle)
 * typed quickly would wait for the C and lose the R. The Curve tool is Shift+V.
 */
export interface Alias {
  tool: Tool;
  copy?: boolean;
  label: string;
  /** Runs this command instead of picking the tool, and goes back to the tool in use before. */
  command?: string;
}

export const ALIASES: Record<string, Alias> = {
  CO: { tool: 'move', copy: true, label: 'Copy' },
  CP: { tool: 'move', copy: true, label: 'Copy' },
  RO: { tool: 'rotate', label: 'Rotate' },
  TR: { tool: 'trim', label: 'Trim' },
  EX: { tool: 'extend', label: 'Extend' },
  MI: { tool: 'mirror', label: 'Mirror' },
  SC: { tool: 'scale', label: 'Scale' },
  CHA: { tool: 'chamfer', label: 'Chamfer' },
  REC: { tool: 'rectangle', label: 'Rectangle' },
  DI: { tool: 'tape', label: 'Distance (tape measure)' },
  DIM: { tool: 'dimension', label: 'Dimension' },
  ZP: { tool: 'zoom', command: 'view.zoomPrevious', label: 'Zoom previous' },
  BR: { tool: 'breakWall', label: 'Break' },
  FIL: { tool: 'fillet', label: 'Fillet' },
  STR: { tool: 'stretch', label: 'Stretch' },
};

/** How long, in ms, between the letters of an alias. */
export const ALIAS_GAP_MS = 1000;

/**
 * Feed a letter into the alias buffer. Returns the alias when the letters so far spell one,
 * 'wait' when they start one (so the letter shouldn't also act as a shortcut), or null. Letters that
 * spell one alias and start a longer one (DI, and DIM) wait, with that alias as `pending`: it is
 * used if no letter follows within ALIAS_GAP_MS.
 */
export function aliasStep(
  buffer: string,
  key: string,
): { buffer: string; hit: Alias | 'wait' | null; pending?: Alias } {
  const next = (buffer + key).toUpperCase();
  const longer = next.length > 1 && Object.keys(ALIASES).some((a) => a.length > next.length && a.startsWith(next));
  if (ALIASES[next] && longer) return { buffer: next, hit: 'wait', pending: ALIASES[next] };
  if (ALIASES[next]) return { buffer: '', hit: ALIASES[next] };
  if (longer) return { buffer: next, hit: 'wait' };
  // Start again from this letter.
  const one = key.toUpperCase();
  return { buffer: Object.keys(ALIASES).some((a) => a.startsWith(one)) ? one : '', hit: null };
}

/** The aliases for a tool, for the search box and the shortcut list. */
export const aliasesFor = (tool: Tool) =>
  Object.keys(ALIASES).filter((a) => ALIASES[a].tool === tool && !ALIASES[a].command);
