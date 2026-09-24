import { useState } from 'react';
import { browserStorage } from '../lib/storage';

export type SectionId = 'materials' | 'layers' | 'grid' | 'theme' | 'settings';

const OPEN_KEY = 'mimar.panels';
const DEFAULT_OPEN: SectionId[] = ['materials', 'layers'];

function loadOpen(): SectionId[] {
  try {
    const saved = JSON.parse(browserStorage()?.getItem(OPEN_KEY) ?? 'null');
    return Array.isArray(saved) ? saved : DEFAULT_OPEN;
  } catch {
    return DEFAULT_OPEN;
  }
}

/** Which sections are open, remembered between sessions. */
export function useOpenSections() {
  const [open, setOpen] = useState<SectionId[]>(loadOpen);
  const set = (id: SectionId, on: boolean) =>
    setOpen((prev) => {
      const next = on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id);
      try {
        browserStorage()?.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        // Only a convenience.
      }
      return next;
    });
  return { open, set };
}
