import { describe, expect, it } from 'vitest';
import { touchHint } from './touchWords';

describe('touchHint', () => {
  it('speaks of taps and holds, not clicks and keys', () => {
    expect(
      touchHint(
        'Click to select, drag to move. Square grips move one side. Right-click for more. Space selects from any tool.',
      ),
    ).toBe('Tap to select, drag to move. Square grips move one side. Press and hold for more.');
    expect(touchHint('Click to add points. Double-click or press Enter to finish, Esc to cancel.')).toBe(
      'Tap to add points. Double-tap or press Enter to finish, Esc to cancel.',
    );
    expect(touchHint('Drag to move around. Middle-drag pans with any tool.')).toBe(
      'Drag to move around. Two fingers pan and pinch to zoom with any tool.',
    );
  });

  it('leaves a hint with nothing to change as it is', () => {
    expect(touchHint('Type the size and press Enter to set it exactly.')).toBe(
      'Type the size and press Enter to set it exactly.',
    );
  });
});
