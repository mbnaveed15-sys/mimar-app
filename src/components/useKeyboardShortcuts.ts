import { useEffect } from 'react';
import { matchesKeys, type Command } from '../commands';
import { isMeasureKey } from '../lib/measure';
import { plannerStore } from '../store/plannerStore';
import {
  anchorOf,
  applyMeasure,
  cancel,
  currentDirection,
  MEASURE_TOOLS,
  toggleAxisLock,
  toggleCopy,
} from '../tools/controller';

/** Keys typed into a field, or used to move around a menu or dialog, are not shortcuts. */
const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.isContentEditable ||
    !!target.closest('[role="menu"], [role="menubar"], [role="dialog"], [role="alertdialog"]'));

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/**
 * SketchUp-style keyboard: single keys pick tools, typing goes to the Measurements box, arrows lock
 * an axis while drawing (or nudge the selection), Shift holds the current direction and Ctrl
 * switches Move to copying. Everything else comes from the command list.
 */
export function useKeyboardShortcuts(commands: Command[]) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isTyping(e.target)) return;
      const s = plannerStore.getState();
      const mod = e.ctrlKey || e.metaKey || e.altKey;
      const measuring = !s.view3d && s.tool in MEASURE_TOOLS;

      if (measuring && !mod) {
        if (isMeasureKey(e.key, s.measureText)) {
          e.preventDefault();
          s.setMeasureText(s.measureText + e.key);
          return;
        }
        if (e.key === 'Backspace' && s.measureText) {
          e.preventDefault();
          s.setMeasureText(s.measureText.slice(0, -1));
          return;
        }
        if (e.key === 'Enter' && s.measureText) {
          e.preventDefault();
          if (applyMeasure(plannerStore, s.measureText)) s.setMeasureText('');
          return;
        }
      }

      if (e.key === 'Escape') {
        if (!cancel(plannerStore)) s.select(null);
        return;
      }
      if (e.key === 'Enter') {
        const d = s.draft;
        if (d?.type === 'mask') s.finishMask();
        else if (d?.type === 'wall' || d?.type === 'tape') s.setDraft(null);
        return;
      }
      if (e.key in ARROWS && !mod) {
        if (!s.view3d && anchorOf(s)) {
          e.preventDefault();
          toggleAxisLock(plannerStore, e.key === 'ArrowRight' ? 'x' : 'y');
          return;
        }
        if (s.selectedId && !s.view3d) {
          e.preventDefault();
          // One grid square per press; hold Shift for a finer 1/5 step.
          const step = e.shiftKey ? s.gridPx / 5 : s.gridPx;
          const [dx, dy] = ARROWS[e.key];
          s.nudgeSelected(dx * step, dy * step);
          return;
        }
      }
      if (e.key === 'Shift' && !e.repeat && anchorOf(s) && !s.axisLock) {
        const dir = currentDirection(s);
        if (dir && Math.hypot(dir.x, dir.y) > 0) s.setShiftLock(dir);
        return;
      }
      if (e.key === 'Control' && !e.repeat && s.draft?.type === 'move') {
        toggleCopy(plannerStore);
        return;
      }

      for (const cmd of commands) {
        if (!cmd.keys?.some((k) => matchesKeys(e, k))) continue;
        e.preventDefault();
        if (!cmd.enabled || cmd.enabled(s)) cmd.run();
        return;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'Shift') plannerStore.getState().setShiftLock(null);
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [commands]);
}
