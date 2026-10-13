import { useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { plannerStore } from '../store/plannerStore';
import { DRAG_PX } from '../tools/controller';

type SvgPointer = PointerEvent<Element>;

interface Handlers {
  down: (e: SvgPointer) => void;
  move: (e: SvgPointer) => void;
  up: (e: SvgPointer) => void;
  doubleClick: (e: MouseEvent<Element>) => void;
  contextMenu: (e: MouseEvent<Element>) => void;
  /** Undo whatever the first finger started, because a second finger turned it into a pinch. */
  abort: () => void;
  /**
   * Two or three fingers moved: by (dx, dy) screen pixels, spread by `scale`, twisted by `turn`, about
   * (x, y) in the element. Two fingers pan and zoom (and in 3D a twist turns the model); three fingers
   * turn the 3D view.
   */
  gesture: (g: Gesture) => void;
}

export interface Gesture {
  dx: number;
  dy: number;
  scale: number;
  x: number;
  y: number;
  /** Radians the two fingers turned by, clockwise on screen (0 until a twist is clearly meant). */
  turn: number;
  fingers: 2 | 3;
}

/** A finger waits this long before it counts as a press (a second finger may still come). */
const PRESS_DELAY_MS = 120;
const LONG_PRESS_MS = 550;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;
/** Native mouse-compatibility events this soon after a touch are ignored; the touch was handled. */
const TOUCH_ECHO_MS = 800;
/** Two or three fingers down and up within this, barely moving, are a tap: Undo or Redo. */
const MULTI_TAP_MS = 300;
const MULTI_TAP_PX = 12;
/** Fingers twist this far (radians, about 8°) before a twist turns the model, so a pinch doesn't. */
const TWIST_START = 0.14;

interface Snapshot {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  button: number;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  target: EventTarget;
  currentTarget: Element;
  preventDefault: () => void;
}

const snapshot = (e: SvgPointer): Snapshot => ({
  pointerId: e.pointerId,
  pointerType: e.pointerType,
  clientX: e.clientX,
  clientY: e.clientY,
  button: e.button,
  shiftKey: e.shiftKey,
  ctrlKey: e.ctrlKey,
  metaKey: e.metaKey,
  altKey: e.altKey,
  target: e.target,
  currentTarget: e.currentTarget,
  preventDefault: () => {},
});

/**
 * Touch on the plan: one finger draws and selects like the mouse; two fingers pinch to zoom and
 * drag to pan; a long press (with Select) opens the item's menu; a double tap works like a
 * double-click; a quick two-finger tap undoes and a three-finger tap redoes. Mouse and pen go
 * straight through.
 */
export function useTouch(handlers: Handlers) {
  const h = useRef(handlers);
  // Timers fire after render, so they always see the latest handlers.
  useLayoutEffect(() => {
    h.current = handlers;
  });
  const state = useRef({
    touches: new Map<number, { x: number; y: number }>(),
    mode: 'idle' as 'idle' | 'pending' | 'single' | 'gesture' | 'menu',
    pending: null as Snapshot | null,
    start: { x: 0, y: 0 },
    moved: false,
    pressTimer: 0,
    longTimer: 0,
    lastTap: { time: 0, x: 0, y: 0 },
    lastTouch: 0,
    gesture: { x: 0, y: 0, dist: 1, angle: 0 },
    /** The gesture so far: when it began, most fingers, how far they went, how much they turned. */
    multi: { time: 0, most: 0, travel: 0, spread: 0, twist: 0, twisting: false },
    element: null as Element | null,
  });

  useEffect(() => {
    const st = state.current;
    return () => {
      clearTimeout(st.pressTimer);
      clearTimeout(st.longTimer);
    };
  }, []);

  const clearTimers = () => {
    clearTimeout(state.current.pressTimer);
    clearTimeout(state.current.longTimer);
  };

  /** Let a waiting finger press through as a normal press. */
  const flush = () => {
    const st = state.current;
    if (st.mode !== 'pending' || !st.pending) return;
    clearTimeout(st.pressTimer);
    st.mode = 'single';
    const e = st.pending;
    st.pending = null;
    h.current.down(e as unknown as SvgPointer);
  };

  /** Middle of the fingers, and how far apart the first two are and the angle between them. */
  const fingers = () => {
    const pts = [...state.current.touches.values()];
    const [a, b] = pts;
    return {
      x: pts.reduce((sum, p) => sum + p.x, 0) / pts.length,
      y: pts.reduce((sum, p) => sum + p.y, 0) / pts.length,
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  };

  const longPress = () => {
    const st = state.current;
    const s = plannerStore.getState();
    if (st.moved || st.touches.size !== 1 || s.tool !== 'select') return;
    flush();
    h.current.abort();
    st.mode = 'menu';
    const e = {
      clientX: st.start.x,
      clientY: st.start.y,
      currentTarget: st.element,
      preventDefault: () => {},
    };
    h.current.contextMenu(e as unknown as MouseEvent<Element>);
  };

  function onPointerDown(e: SvgPointer) {
    const st = state.current;
    if (e.pointerType !== 'touch') {
      plannerStore.getState().setTouchInput(false);
      h.current.down(e);
      return;
    }
    plannerStore.getState().setTouchInput(true);
    st.lastTouch = Date.now();
    st.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    st.element = e.currentTarget;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a convenience.
    }
    if (st.touches.size === 1) {
      st.mode = 'pending';
      st.pending = snapshot(e);
      st.start = { x: e.clientX, y: e.clientY };
      st.moved = false;
      st.pressTimer = window.setTimeout(flush, PRESS_DELAY_MS);
      st.longTimer = window.setTimeout(longPress, LONG_PRESS_MS);
      return;
    }
    if (st.touches.size === 2 || st.touches.size === 3) {
      clearTimers();
      if (st.mode === 'single') h.current.abort();
      if (st.mode !== 'gesture')
        st.multi = { time: Date.now(), most: 0, travel: 0, spread: 0, twist: 0, twisting: false };
      st.multi.most = Math.max(st.multi.most, st.touches.size);
      st.pending = null;
      st.mode = 'gesture';
      st.gesture = fingers();
    }
  }

  function onPointerMove(e: SvgPointer) {
    const st = state.current;
    if (e.pointerType !== 'touch') {
      h.current.move(e);
      return;
    }
    if (!st.touches.has(e.pointerId)) return;
    st.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.mode === 'gesture') {
      if (st.touches.size < 2) return;
      const now = fingers();
      const r = e.currentTarget.getBoundingClientRect();
      const three = st.touches.size >= 3;
      const dx = now.x - st.gesture.x;
      const dy = now.y - st.gesture.y;
      // The angle's change, kept within a half turn either way.
      const turn = Math.atan2(Math.sin(now.angle - st.gesture.angle), Math.cos(now.angle - st.gesture.angle));
      const m = st.multi;
      m.travel += Math.hypot(dx, dy);
      m.spread += Math.abs(now.dist - st.gesture.dist);
      if (!three) {
        m.twist += turn;
        if (Math.abs(m.twist) > TWIST_START) m.twisting = true;
      }
      h.current.gesture({
        dx,
        dy,
        scale: three ? 1 : now.dist / st.gesture.dist,
        x: now.x - r.left,
        y: now.y - r.top,
        turn: !three && m.twisting ? turn : 0,
        fingers: three ? 3 : 2,
      });
      st.gesture = now;
      return;
    }
    if (st.mode === 'menu') return;
    if (Math.hypot(e.clientX - st.start.x, e.clientY - st.start.y) > DRAG_PX) {
      st.moved = true;
      clearTimeout(st.longTimer);
      flush();
    }
    if (st.mode === 'single') h.current.move(e);
  }

  function onPointerUp(e: SvgPointer) {
    const st = state.current;
    if (e.pointerType !== 'touch') {
      h.current.up(e);
      return;
    }
    st.touches.delete(e.pointerId);
    st.lastTouch = Date.now();
    if (st.mode === 'gesture' || st.mode === 'menu') {
      if (st.touches.size > 0) return;
      // A quick tap with two fingers undoes; with three, redoes.
      const m = st.multi;
      if (
        st.mode === 'gesture' &&
        Date.now() - m.time < MULTI_TAP_MS &&
        m.travel + m.spread < MULTI_TAP_PX &&
        !m.twisting
      ) {
        const s = plannerStore.getState();
        if (m.most >= 3) s.redo();
        else s.undo();
      }
      st.mode = 'idle';
      return;
    }
    clearTimers();
    flush();
    if (st.mode === 'single') h.current.up(e);
    st.mode = 'idle';
    if (st.moved) return;
    const now = Date.now();
    const tap = st.lastTap;
    if (now - tap.time < DOUBLE_TAP_MS && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < DOUBLE_TAP_PX) {
      st.lastTap = { time: 0, x: 0, y: 0 };
      h.current.doubleClick(e as unknown as MouseEvent<Element>);
    } else st.lastTap = { time: now, x: e.clientX, y: e.clientY };
  }

  /** Was this mouse event made up by the browser from a touch we already handled? */
  const fromTouch = () => Date.now() - state.current.lastTouch < TOUCH_ECHO_MS;

  return { onPointerDown, onPointerMove, onPointerUp, fromTouch };
}
