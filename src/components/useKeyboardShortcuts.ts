import { useEffect } from 'react';
import { plannerStore } from '../store/plannerStore';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const s = plannerStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (e.key === 'Enter' && s.draft?.type === 'mask') {
        s.finishMask();
      } else if (e.key === 'Escape') {
        s.setDraft(null);
        s.select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        s.deleteElement(s.selectedId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
