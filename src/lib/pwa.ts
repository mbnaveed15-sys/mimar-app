/** The web version: works offline, and offers to reload when a new release has been downloaded. */

type Listener = (apply: () => void) => void;
const listeners = new Set<Listener>();
let pending: (() => void) | null = null;

/** Call `listener` (now, if one is already waiting) when a new version is ready to use. */
export function onWebUpdate(listener: Listener): () => void {
  listeners.add(listener);
  if (pending) listener(pending);
  return () => listeners.delete(listener);
}

function ready(worker: ServiceWorker) {
  pending = () => {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
    worker.postMessage('skip-waiting');
  };
  for (const l of listeners) l(pending);
}

const HOUR = 60 * 60 * 1000;

/** Only the browser version (served over http/https) uses a service worker; the desktop app updates itself. */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(window.location.protocol) || window.mimarUpdates) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const watch = (worker: ServiceWorker | null) =>
          worker?.addEventListener('statechange', () => {
            // "Installed" with a page already controlled means an update (not the first visit).
            if (worker.state === 'installed' && navigator.serviceWorker.controller) ready(worker);
          });
        if (reg.waiting && navigator.serviceWorker.controller) ready(reg.waiting);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        setInterval(() => reg.update().catch(() => {}), HOUR);
      })
      .catch(() => {
        // Offline use is a bonus; the app works without it.
      });
  });
}
