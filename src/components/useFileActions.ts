import { useCallback } from 'react';
import { openPlanFile, parsePlanFile, PlanFileError, savePlanFile, serialisePlan } from '../lib/files';
import { plannerStore } from '../store/plannerStore';
import { noteRecent, openRecent, type RecentFile } from '../lib/recent';

export const isDirty = () => {
  const s = plannerStore.getState();
  return s.doc !== s.savedDoc;
};

/** New / Open / Save / Save As, reporting problems in the sidebar warning area. */
export function useFileActions() {
  const report = (e: unknown) =>
    plannerStore
      .getState()
      .setWarning(e instanceof PlanFileError ? e.message : `The file could not be saved or opened. ${String(e)}`);

  const save = useCallback(async (saveAs = false) => {
    const s = plannerStore.getState();
    try {
      const contents = serialisePlan(s.doc);
      const saved = await savePlanFile(contents, s.fileName, saveAs ? undefined : s.filePath);
      if (saved) {
        plannerStore.getState().markSaved(saved);
        noteRecent(saved, contents);
      }
    } catch (e) {
      report(e);
    }
  }, []);

  const open = useCallback(async () => {
    try {
      const file = await openPlanFile();
      if (!file) return;
      plannerStore.getState().loadDocument(parsePlanFile(file.contents), { name: file.name, path: file.path });
      noteRecent(file, file.contents);
    } catch (e) {
      report(e);
    }
  }, []);

  /** Open a plan from the recent list; says so when it can't be found any more. */
  const openRecentFile = useCallback(async (r: RecentFile) => {
    try {
      const file = await openRecent(r);
      if (!file)
        return plannerStore
          .getState()
          .setWarning(`${r.name} couldn’t be found. It may have been moved, renamed or deleted.`);
      plannerStore.getState().loadDocument(parsePlanFile(file.contents), { name: file.name, path: file.path });
      noteRecent(file, file.contents);
    } catch (e) {
      report(e);
    }
  }, []);

  const newPlan = useCallback(() => plannerStore.getState().newPlan(), []);

  return { save, open, openRecentFile, newPlan };
}
