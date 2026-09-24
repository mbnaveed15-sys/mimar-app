import { useCallback } from 'react';
import { openPlanFile, parsePlanFile, PlanFileError, savePlanFile, serialisePlan } from '../lib/files';
import { plannerStore } from '../store/plannerStore';

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
      const saved = await savePlanFile(serialisePlan(s.doc), s.fileName, saveAs ? undefined : s.filePath);
      if (saved) plannerStore.getState().markSaved(saved);
    } catch (e) {
      report(e);
    }
  }, []);

  const open = useCallback(async () => {
    try {
      const file = await openPlanFile();
      if (!file) return;
      plannerStore.getState().loadDocument(parsePlanFile(file.contents), { name: file.name, path: file.path });
    } catch (e) {
      report(e);
    }
  }, []);

  const newPlan = useCallback(() => plannerStore.getState().newPlan(), []);

  return { save, open, newPlan };
}
