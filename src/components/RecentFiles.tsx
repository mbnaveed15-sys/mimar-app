import { useEffect, useRef, useState } from 'react';
import { clearRecent, listRecent, type RecentFile } from '../lib/recent';
import { baseName } from '../lib/files';
import { useFocusTrap } from './useFocus';

const when = (at: number) =>
  new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** The plans opened or saved lately: click one to open it. */
export function RecentDialog({ onOpen, onClose }: { onOpen: (r: RecentFile) => void; onClose: () => void }) {
  const [list, setList] = useState<RecentFile[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const isTop = useFocusTrap(ref);
  useEffect(() => {
    let live = true;
    void listRecent().then((l) => live && setList(l));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && isTop() && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, isTop]);
  const desktop = typeof window !== 'undefined' && !!window.mimarRecent;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-start justify-center bg-black/30 pt-[12vh]"
      onPointerDown={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Recent plans"
        onPointerDown={(e) => e.stopPropagation()}
        className="flex max-h-[76vh] w-[92vw] max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-raised p-4 text-ink shadow-popover"
      >
        <h2 className="font-semibold">Recent plans</h2>
        {!desktop && (
          <p className="mt-1 text-xs text-muted">
            In the browser, a copy of each plan is kept as it was when last opened or saved here.
          </p>
        )}
        <div className="mt-3 flex min-h-0 flex-col gap-1 overflow-auto" data-testid="recent-list">
          {list === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-muted">No plans opened or saved yet.</p>
          ) : (
            list.map((r, i) => (
              <button
                key={r.key}
                autoFocus={i === 0}
                className="m-btn flex-col items-start gap-0 py-1.5 text-left"
                onClick={() => onOpen(r)}
              >
                <span className="font-medium">{baseName(r.name)}</span>
                <span className="w-full truncate text-xs text-muted" title={r.path}>
                  {r.path ?? 'Copy in this browser'} · {when(r.at)}
                </span>
              </button>
            ))
          )}
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <button className="m-btn" disabled={!list?.length} onClick={() => void clearRecent().then(() => setList([]))}>
            Clear the list
          </button>
          <button className="m-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
