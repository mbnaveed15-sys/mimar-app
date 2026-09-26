import { describe, expect, it } from 'vitest';
import { aliasStep, ALIASES } from './aliases';

describe('AutoCAD aliases', () => {
  it('spells aliases from quick letters, holding back letters that start one', () => {
    let b = aliasStep('', 't'); // T: the Tape measure, and it starts TR
    expect(b.hit).toBeNull();
    b = aliasStep(b.buffer, 'r');
    expect(b.hit).toBe(ALIASES.TR);
    // C, H, A: H would be Pan, but CH starts CHA, so it waits.
    b = aliasStep(aliasStep('', 'c').buffer, 'h');
    expect(b.hit).toBe('wait');
    expect(aliasStep(b.buffer, 'a').hit).toBe(ALIASES.CHA);
    // L, L: no alias, so each L is its own shortcut.
    expect(aliasStep(aliasStep('', 'l').buffer, 'l').hit).toBeNull();
    expect(ALIASES.CO).toMatchObject({ tool: 'move', copy: true });
  });
});
