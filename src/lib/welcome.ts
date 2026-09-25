import { browserStorage } from './storage';

const SEEN_KEY = 'mimar.welcome';

/** Has the welcome been seen (or turned off)? Automated test browsers skip it unless asked. */
export function shouldWelcome(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('welcome')) return true;
    if (navigator.webdriver) return false;
    return browserStorage()?.getItem(SEEN_KEY) !== 'done';
  } catch {
    return false;
  }
}

export function markSeen() {
  try {
    browserStorage()?.setItem(SEEN_KEY, 'done');
  } catch {
    // Only a convenience.
  }
}
