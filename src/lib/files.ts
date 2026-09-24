import type { PlanDoc } from '../types';
import { CURRENT_VERSION, normaliseDoc } from './storage';

export const FILE_EXTENSION = '.mimar';
export const DEFAULT_FILE_NAME = `Untitled${FILE_EXTENSION}`;

export interface OpenedFile {
  name: string;
  /** Full path on disk (desktop app only); used to save back to the same file. */
  path?: string;
  contents: string;
}

export interface SavedFile {
  name: string;
  path?: string;
}

/** File access provided by the desktop app's preload script. */
export interface DesktopFiles {
  open: () => Promise<OpenedFile | null>;
  save: (request: { contents: string; suggestedName: string; path?: string }) => Promise<SavedFile | null>;
}

declare global {
  interface Window {
    mimarFiles?: DesktopFiles;
  }
}

export function serialisePlan(doc: PlanDoc): string {
  return JSON.stringify(
    { format: 'mimar-plan', version: CURRENT_VERSION, savedAt: new Date().toISOString(), doc },
    null,
    2,
  );
}

export class PlanFileError extends Error {}

export function parsePlanFile(text: string): PlanDoc {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PlanFileError('This file is not a Mimar plan, or it is damaged.');
  }
  if (typeof data !== 'object' || data === null || (data as { format?: unknown }).format !== 'mimar-plan') {
    throw new PlanFileError('This file is not a Mimar plan.');
  }
  const { version, doc } = data as { version?: unknown; doc?: unknown };
  if (typeof version === 'number' && version > CURRENT_VERSION) {
    throw new PlanFileError('This plan was made with a newer version of Mimar. Please update the app.');
  }
  return normaliseDoc(doc);
}

export const baseName = (name: string) => name.replace(/\.mimar$/i, '');
const withExtension = (name: string) => (name.toLowerCase().endsWith(FILE_EXTENSION) ? name : name + FILE_EXTENSION);

/** Ask the user for a plan file. Returns null if they cancel. */
export async function openPlanFile(): Promise<OpenedFile | null> {
  if (window.mimarFiles) return window.mimarFiles.open();
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXTENSION},application/json`;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, contents: await file.text() } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/**
 * Save the plan. With a path (desktop app) it overwrites that file; otherwise it asks where to save.
 * Returns null if the user cancels.
 */
export async function savePlanFile(contents: string, suggestedName: string, path?: string): Promise<SavedFile | null> {
  const name = withExtension(suggestedName);
  if (window.mimarFiles) return window.mimarFiles.save({ contents, suggestedName: name, path });

  const picker = (window as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> }).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({
        suggestedName: name,
        types: [{ description: 'Mimar plan', accept: { 'application/json': [FILE_EXTENSION] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return { name: handle.name };
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }

  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { name };
}
