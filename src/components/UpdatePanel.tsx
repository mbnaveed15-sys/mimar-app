import { useEffect, useState } from 'react';
import { describeUpdate, type UpdateStatus } from '../lib/updates';

/** App version and update status. Updates are only available in the Windows desktop app. */
export function UpdatePanel() {
  const bridge = typeof window !== 'undefined' ? window.mimarUpdates : undefined;
  const [status, setStatus] = useState<UpdateStatus>({ state: bridge ? 'idle' : 'unsupported' });

  useEffect(() => {
    if (!bridge) return;
    let live = true;
    bridge.getStatus().then((s) => live && setStatus(s));
    const off = bridge.onStatus((s) => live && setStatus(s));
    return () => {
      live = false;
      off();
    };
  }, [bridge]);

  const busy = status.state === 'checking' || status.state === 'downloading';
  const btn = 'rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-40';
  const message = describeUpdate(status);

  return (
    <div className="mt-2 flex flex-col gap-1 border-t pt-2 text-xs text-gray-600" data-testid="update-panel">
      <div className="flex items-center justify-between gap-2">
        <span>Mimar {status.version ?? __APP_VERSION__}</span>
        {bridge && status.state !== 'unsupported' && (
          <button
            onClick={() => bridge.check().then(setStatus)}
            disabled={busy || status.state === 'ready'}
            className={btn}
          >
            Check for updates
          </button>
        )}
      </div>
      {message && (
        <p
          role="status"
          className={status.state === 'ready' || status.state === 'available-portable' ? 'text-blue-800' : ''}
        >
          {message}
        </p>
      )}
      {status.state === 'ready' && bridge && (
        <button
          onClick={() => bridge.install()}
          className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white"
        >
          Restart to update
        </button>
      )}
      {status.state === 'available-portable' && bridge && (
        <button
          onClick={() => bridge.openDownload()}
          className="rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white"
        >
          Download Mimar {status.latest}
        </button>
      )}
    </div>
  );
}
