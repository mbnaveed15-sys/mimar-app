import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const shown = (el: HTMLElement) => el.getClientRects().length > 0;

/**
 * Keep Tab inside a dialog while it is open, and give focus back to where it was when it closes.
 * `key` re-runs it when the dialog's content is swapped (the welcome becoming the tour).
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, key?: unknown) {
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) box.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      const root = ref.current;
      if (e.key !== 'Tab' || !root) return;
      const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(shown);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      const inside = root.contains(document.activeElement);
      if (e.shiftKey && (!inside || document.activeElement === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before && before.isConnected && before !== document.body) before.focus();
    };
  }, [ref, key]);
}

/** A pop-up menu: the first item takes focus, and the arrow keys, Home and End move between items. */
export function useMenuKeys(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = () =>
      [...root.querySelectorAll<HTMLElement>('[role^="menuitem"]')].filter(
        (el) => !(el as HTMLButtonElement).disabled && el.getAttribute('aria-disabled') !== 'true',
      );
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      const to =
        e.key === 'ArrowDown'
          ? (i + 1) % list.length
          : e.key === 'ArrowUp'
            ? (i - 1 + list.length) % list.length
            : e.key === 'Home'
              ? 0
              : e.key === 'End'
                ? list.length - 1
                : null;
      if (to === null) return;
      e.preventDefault();
      list[to].focus();
    };
    root.addEventListener('keydown', onKey);
    return () => root.removeEventListener('keydown', onKey);
  }, [ref]);
}
