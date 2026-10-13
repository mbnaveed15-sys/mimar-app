/**
 * The plans opened or saved lately, newest first. In the desktop app the app itself keeps the list (file paths),
 * so a plan opens again straight from its file. In a browser there are no paths: a copy of each plan, as it was
 * when it was last opened or saved here, is kept in this browser (small plans only), and that copy is opened.
 */
import type { OpenedFile } from './files';

export interface RecentFile {
  /** The file's path in the desktop app; an id for a copy kept in the browser. */
  key: string;
  name: string;
  /** Full path on disk (desktop app only). */
  path?: string;
  /** When it was last opened or saved, ms since 1970. */
  at: number;
}

/** What the desktop app's preload adds for recent files. */
export interface DesktopRecent {
  list: () => Promise<RecentFile[]>;
  open: (path: string) => Promise<OpenedFile | null>;
  clear: () => Promise<void>;
}

declare global {
  interface Window {
    mimarRecent?: DesktopRecent;
  }
}

export const MAX_RECENT = 8;
/** A browser copy bigger than this isn't kept (browser storage is small). */
export const MAX_COPY_CHARS = 1_500_000;
const LIST_KEY = 'mimar-recent';
const COPY_KEY = (key: string) => `mimar-recent:${key}`;

/** Browser storage, or null where it can't be used (a private window, blocked site data). */
function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readList(s: Storage): RecentFile[] {
  try {
    const raw: unknown = JSON.parse(s.getItem(LIST_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r): RecentFile[] =>
      r && typeof r.key === 'string' && typeof r.name === 'string' && Number.isFinite(r.at)
        ? [{ key: r.key, name: r.name, at: r.at }]
        : [],
    );
  } catch {
    return [];
  }
}

/** A browser copy's key: the file's name (one copy per name, the latest). */
const copyKeyOf = (name: string) => name.toLowerCase();

/** The recent plans, newest first. */
export async function listRecent(storage = store()): Promise<RecentFile[]> {
  if (typeof window !== 'undefined' && window.mimarRecent) {
    try {
      return await window.mimarRecent.list();
    } catch {
      return [];
    }
  }
  return storage ? readList(storage) : [];
}

/**
 * Remember a plan just opened or saved. In the desktop app the app does this itself; here a copy of the plan
 * is kept in the browser. Never throws: a full or blocked storage just leaves the list as it was.
 */
export function noteRecent(
  file: { name: string; path?: string },
  contents: string,
  storage = store(),
  now = Date.now(),
) {
  if ((typeof window !== 'undefined' && window.mimarRecent) || !storage || contents.length > MAX_COPY_CHARS) return;
  const key = copyKeyOf(file.name);
  const list = [{ key, name: file.name, at: now }, ...readList(storage).filter((r) => r.key !== key)];
  const kept = list.slice(0, MAX_RECENT);
  try {
    storage.setItem(COPY_KEY(key), contents);
    for (const gone of list.slice(MAX_RECENT)) storage.removeItem(COPY_KEY(gone.key));
    storage.setItem(LIST_KEY, JSON.stringify(kept));
  } catch {
    // No room: drop this copy rather than leave a list entry with nothing behind it.
    try {
      storage.removeItem(COPY_KEY(key));
    } catch {
      /* storage is unusable */
    }
  }
}

/** Open a recent plan: from its file (desktop) or the copy kept in this browser. Null if it is gone. */
export async function openRecent(r: RecentFile, storage = store()): Promise<OpenedFile | null> {
  if (typeof window !== 'undefined' && window.mimarRecent) {
    if (!r.path) return null;
    return window.mimarRecent.open(r.path);
  }
  const contents = storage?.getItem(COPY_KEY(r.key));
  return contents ? { name: r.name, contents } : null;
}

/** Forget every recent plan (and the browser's copies). */
export async function clearRecent(storage = store()): Promise<void> {
  if (typeof window !== 'undefined' && window.mimarRecent) return window.mimarRecent.clear();
  if (!storage) return;
  try {
    for (const r of readList(storage)) storage.removeItem(COPY_KEY(r.key));
    storage.removeItem(LIST_KEY);
  } catch {
    /* storage is unusable */
  }
}
