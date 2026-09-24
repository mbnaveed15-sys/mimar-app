import type { GridPrefs } from './prefs';

/** Grid lines closer than this on screen are hidden, so the grid never turns into a solid wash. */
const MIN_GAP_PX = 8;

export type GridLook = Pick<GridPrefs, 'major' | 'style' | 'strength'>;

/** Which lines to draw at this zoom: minor lines disappear before they crowd together. */
export function gridLevels(step: number, major: GridLook['major'], k: number) {
  const px = (units: number) => units / k;
  if (major === 0) {
    let minor = step;
    while (px(minor) < MIN_GAP_PX) minor *= 5;
    return { minor, major: null };
  }
  let big = step * major;
  if (px(step) >= MIN_GAP_PX) return { minor: step, major: big };
  while (px(big) < MIN_GAP_PX) big *= major;
  return { minor: null, major: big };
}
