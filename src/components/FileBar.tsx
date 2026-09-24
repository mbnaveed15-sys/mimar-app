import { useCallback, useEffect, useState } from 'react';
import { baseName } from '../lib/files';
import { usePlanner } from '../store/plannerStore';
import { isDirty, useFileActions } from './useFileActions';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

type Pending = 'new' | 'open' | null;

export function FileBar() {
  const fileName = usePlanner((s) => s.fileName);
  const dirty = usePlanner((s) => s.doc !== s.savedDoc);
  const { save, open, newPlan } = useFileActions();
  const [pending, setPending] = useState<Pending>(null);

  useEffect(() => {
    document.title = `${dirty ? '• ' : ''}${baseName(fileName)} — Mimar`;
  }, [fileName, dirty]);

  // Replacing the plan asks first when there are unsaved changes.
  const requestNew = useCallback(() => (isDirty() ? setPending('new') : newPlan()), [newPlan]);
  const requestOpen = useCallback(() => (isDirty() ? setPending('open') : void open()), [open]);
  useKeyboardShortcuts(requestNew, requestOpen);
  const confirm = () => {
    if (pending === 'new') newPlan();
    else if (pending === 'open') void open();
    setPending(null);
  };

  const btn = 'rounded border px-2 py-1 text-xs hover:bg-gray-50';
  return (
    <div className="flex flex-col gap-2">
      <div className="truncate text-xs text-gray-600" title={fileName} data-testid="file-name">
        {baseName(fileName)}
        {dirty && <span className="text-amber-700"> • unsaved changes</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        <button onClick={requestNew} className={btn} title="New plan (Ctrl+N)">
          New
        </button>
        <button onClick={requestOpen} className={btn} title="Open plan (Ctrl+O)">
          Open…
        </button>
        <button onClick={() => void save()} className={btn} title="Save (Ctrl+S)">
          Save
        </button>
        <button onClick={() => void save(true)} className={btn} title="Save as (Ctrl+Shift+S)">
          Save as…
        </button>
      </div>
      {pending && (
        <div role="alertdialog" className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p>This plan has unsaved changes that will be lost.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={confirm} className="rounded border border-amber-300 bg-white px-2 py-1">
              {pending === 'new' ? 'Discard and start new' : 'Discard and open'}
            </button>
            <button onClick={() => setPending(null)} className="rounded border bg-white px-2 py-1">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
