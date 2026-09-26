import { useEffect } from 'react';
import { matchesKeys, type Command } from '../commands';
import { isMeasureKey } from '../lib/measure';
import { mirrorItems } from '../lib/modify';
import { MM_PER_UNIT, plannerStore } from '../store/plannerStore';
import {
  anchorOf,
  applyMeasure,
  cancel,
  currentDirection,
  MEASURE_TOOLS,
  toggleAxisLock,
  toggleCopy,
  toggleHeightLock,
} from '../tools/controller';
import { aliasStep, ALIAS_GAP_MS } from '../lib/aliases';
import { finishStep } from '../tools/finish';
import { armCopyNext } from '../tools/controller';
import { SIMPLE_TOOLS, type Tool } from '../types';

// AutoCAD aliases typed as quick letter sequences, and the last tool for Enter to go back to.
let aliasBuffer = '';
let aliasAt = 0;
let lastTool: Tool | null = null;
plannerStore.subscribe((state, prev) => {
  if (state.tool !== prev.tool && prev.tool !== 'select') lastTool = prev.tool;
  if (state.tool !== prev.tool && state.tool !== 'select') lastTool = state.tool;
});

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
      const kind = MEASURE_TOOLS[s.tool];
      const measuring = !!kind && kind !== 'none';

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
        // Cancel the current step, then close an open group, then drop the selection.
        if (cancel(plannerStore)) return;
        if (s.selectedIds.length) s.select(null);
        else if (s.openGroupId) s.closeGroup();
        return;
      }
      if (e.key === 'Enter') {
        if (finishStep(plannerStore)) return;
        // Nothing to finish, back on the Select tool: repeat the last tool, as AutoCAD repeats a command.
        if (!s.draft && s.tool === 'select' && lastTool) s.setTool(lastTool);
        return;
      }
      const upDown = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if (upDown && e.altKey && !e.ctrlKey && !e.metaKey && s.selectedIds.length && !s.draft) {
        e.preventDefault();
        // Alt+up/down raises or lowers by a grid square; with Shift by 1/5 of one.
        const step = (e.shiftKey ? s.gridPx / 5 : s.gridPx) * MM_PER_UNIT;
        s.raiseSelected(e.key === 'ArrowUp' ? step : -step);
        return;
      }
      if (e.key in ARROWS && !mod) {
        if (upDown && toggleHeightLock(plannerStore)) {
          e.preventDefault();
          return;
        }
        if (anchorOf(s)) {
          e.preventDefault();
          toggleAxisLock(plannerStore, e.key === 'ArrowRight' ? 'x' : 'y');
          return;
        }
        if (s.selectedId) {
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
      if (e.key === 'Control' && !e.repeat && s.draft?.type === 'mirror') {
        // Ctrl switches Mirror between making a copy and flipping the originals.
        const d = { ...s.draft, flip: !s.draft.flip };
        s.setDraft(d);
        s.commitFromBase((base) => mirrorItems(base, d.ids, d.a, d.b, d.flip).doc);
        return;
      }

      // AutoCAD aliases: CO, TR, EX… typed quickly pick that tool (the first letter picked its own).
      if (!mod && !e.shiftKey && /^[a-z]$/i.test(e.key)) {
        const now = performance.now();
        const step = aliasStep(now - aliasAt < ALIAS_GAP_MS ? aliasBuffer : '', e.key);
        aliasBuffer = step.buffer;
        aliasAt = now;
        if (step.hit === 'wait') {
          e.preventDefault();
          return;
        }
        if (step.hit) {
          e.preventDefault();
          if (!SIMPLE_TOOLS.includes(step.hit.tool) && s.mode === 'simple') s.setMode('pro');
          s.setTool(step.hit.tool);
          armCopyNext(!!step.hit.copy);
          return;
        }
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
