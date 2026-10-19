/**
 * Drag a number box's label left or right to change its number (each few pixels is one step; Shift for
 * ten steps), as in SketchUp and Blender. Works for every plain number box with a label; length boxes
 * (LengthField) do the same in their own way.
 */
const PX_PER_STEP = 4;

/** Set a React-owned input's value and tell React, as typing would. */
function setNative(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function installNumberScrub(root: Document = document) {
  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    const label = target?.closest?.('label');
    const input = label?.control;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number' || input.disabled) return;
    if (target === input || target?.closest('input, select, button, textarea')) return;
    const startX = e.clientX;
    const start = Number(input.value) || 0;
    const step = Number(input.step) || 1;
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    let moved = false;
    const move = (ev: PointerEvent) => {
      const steps = Math.trunc((ev.clientX - startX) / PX_PER_STEP) * (ev.shiftKey ? 10 : 1);
      if (!steps && !moved) return;
      moved = true;
      ev.preventDefault();
      const next = Math.min(max, Math.max(min, start + steps * step));
      const decimals = (String(step).split('.')[1] ?? '').length;
      setNative(input, next.toFixed(decimals));
    };
    const up = () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerup', up);
      root.removeEventListener('pointercancel', up);
      // Boxes that apply when they lose focus apply now.
      if (moved) input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    };
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
  });
}
