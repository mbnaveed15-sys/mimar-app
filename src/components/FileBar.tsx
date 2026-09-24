import { useCallback, useEffect, useState } from 'react';
import { baseName } from '../lib/files';
import { usePlanner } from '../store/plannerStore';
import { isDirty, useFileActions } from './useFileActions';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Icon } from './Icon';

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

  const btn = 'm-btn flex-1 px-1.5 text-xs';
  return (
    <div className="flex flex-col gap-2">
      <div className="truncate text-xs text-muted" title={fileName} data-testid="file-name">
        {baseName(fileName)}
        {dirty && <span className="font-medium text-accent-ink"> • unsaved changes</span>}
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button onClick={requestNew} className={btn} title="New plan (Ctrl+N)">
          <Icon name="new" size={16} />
          New
        </button>
        <button onClick={requestOpen} className={btn} title="Open plan (Ctrl+O)">
          <Icon name="open" size={16} />
          Open…
        </button>
        <button onClick={() => void save()} className={btn} title="Save (Ctrl+S)">
          <Icon name="save" size={16} />
          Save
        </button>
        <button onClick={() => void save(true)} className={btn} title="Save as (Ctrl+Shift+S)">
          <Icon name="save" size={16} />
          Save as…
        </button>
      </div>
      {pending && (
        <div role="alertdialog" className="rounded-md border border-accent bg-accent-soft p-2 text-xs text-ink">
          <p>This plan has unsaved changes that will be lost.</p>
          <div className="mt-2 flex gap-2">
            <button onClick={confirm} className="m-btn m-btn-danger">
              {pending === 'new' ? 'Discard and start new' : 'Discard and open'}
            </button>
            <button onClick={() => setPending(null)} className="m-btn">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
