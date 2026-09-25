import { useEffect, useState } from 'react';
import { onWebUpdate } from '../lib/pwa';
import { describeUpdate, type UpdateStatus } from '../lib/updates';
import { Mark } from './Mark';

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

  // The web version: a new release has been downloaded in the background.
  const [applyWebUpdate, setApplyWebUpdate] = useState<(() => void) | null>(null);
  useEffect(() => onWebUpdate((apply) => setApplyWebUpdate(() => apply)), []);

  const busy = status.state === 'checking' || status.state === 'downloading';
  const btn = 'm-btn text-xs';
  const message = describeUpdate(status);

  return (
    <div className="flex flex-col gap-1 text-xs text-muted" data-testid="update-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5">
          <Mark size={16} />
          Mimar {status.version ?? __APP_VERSION__}
        </span>
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
          className={
            status.state === 'ready' || status.state === 'available-portable' ? 'font-medium text-accent-ink' : ''
          }
        >
          {message}
        </p>
      )}
      {status.state === 'ready' && bridge && (
        <button onClick={() => bridge.install()} className="m-btn m-btn-primary text-xs">
          Restart to update
        </button>
      )}
      {status.state === 'available-portable' && bridge && (
        <button onClick={() => bridge.openDownload()} className="m-btn m-btn-primary text-xs">
          Download Mimar {status.latest}
        </button>
      )}
      {applyWebUpdate && (
        <>
          <p role="status" className="font-medium text-accent-ink">
            A new version of Mimar is ready. Your plan is kept.
          </p>
          <button onClick={applyWebUpdate} className="m-btn m-btn-primary text-xs">
            Reload to update
          </button>
        </>
      )}
      {!bridge && (
        <a
          href="https://github.com/mbnaveed15-sys/mimar-app/releases/latest"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Get the Windows app
        </a>
      )}
    </div>
  );
}
