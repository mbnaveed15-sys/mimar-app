/** Update state reported by the desktop app (see updater.cjs). */
export type UpdateState =
  'unsupported' | 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'available-portable' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  /** Version of the running app. */
  version?: string;
  /** Newest version available, when one was found. */
  latest?: string;
  percent?: number;
  message?: string;
}

export interface DesktopUpdates {
  getStatus: () => Promise<UpdateStatus>;
  check: () => Promise<UpdateStatus>;
  install: () => Promise<void>;
  openDownload: () => Promise<void>;
  onStatus: (callback: (status: UpdateStatus) => void) => () => void;
}

declare global {
  interface Window {
    mimarUpdates?: DesktopUpdates;
  }
}

/** One-line description of the update state for the sidebar. */
export function describeUpdate(s: UpdateStatus): string {
  switch (s.state) {
    case 'checking':
      return 'Checking for updates…';
    case 'up-to-date':
      return 'You have the latest version.';
    case 'downloading':
      return `Downloading Mimar ${s.latest ?? ''}${s.percent ? ` (${s.percent}%)` : ''}…`;
    case 'ready':
      return `Mimar ${s.latest} is ready to install.`;
    case 'available-portable':
      return `Mimar ${s.latest} is available.`;
    case 'error':
      return "Couldn't check for updates. Check your internet connection and try again.";
    default:
      return '';
  }
}
