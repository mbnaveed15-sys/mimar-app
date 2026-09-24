import { describe, expect, it } from 'vitest';
import { chooseScale } from './exportPdf';

describe('PDF scale', () => {
  it('picks the most detailed standard scale that fits', () => {
    // Drawing space on A4 landscape is 277 x 170 mm, with 12 mm kept clear on every side.
    // A 30 x 20 ft house (9.1 x 6.1 m) fits at 1:50.
    expect(chooseScale(9144, 6096, 277, 170)).toBe(50);
    // A 12 x 9 m house needs 1:100.
    expect(chooseScale(12000, 9000, 277, 170)).toBe(100);
    // A 1 kanal plot (about 30 x 15 m) needs 1:200.
    expect(chooseScale(30000, 15000, 277, 170)).toBe(200);
  });
});
