import { useEffect } from 'react';
import { plannerStore } from '../store/plannerStore';
import { useFileActions } from './useFileActions';

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function useKeyboardShortcuts(onNewRequested: () => void, onOpenRequested: () => void) {
  const { save } = useFileActions();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const s = plannerStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (mod && key === 'o') {
        e.preventDefault();
        onOpenRequested();
      } else if (mod && key === 'n') {
        e.preventDefault();
        onNewRequested();
      } else if (mod && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        s.undo();
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        s.redo();
      } else if (mod) {
        return;
      } else if (e.key === 'Enter' && s.draft?.type === 'mask') {
        s.finishMask();
      } else if (e.key === 'Escape') {
        s.setDraft(null);
        s.select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
        s.deleteElement(s.selectedId);
      } else if (e.key in ARROWS && s.selectedId) {
        e.preventDefault();
        // One grid square per press; hold Shift for a finer 1/5 step.
        const step = e.shiftKey ? s.gridPx / 5 : s.gridPx;
        const [dx, dy] = ARROWS[e.key];
        s.nudgeSelected(dx * step, dy * step);
      } else if (key === 'r' && s.selectedId) {
        s.rotateSelected(e.shiftKey ? -90 : 90);
      } else if (e.key === '+' || e.key === '=') {
        s.zoomBy(1.25);
      } else if (e.key === '-') {
        s.zoomBy(1 / 1.25);
      } else if (e.key === '0') {
        s.fitToPlan();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save, onNewRequested, onOpenRequested]);
}
