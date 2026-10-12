import { createStore } from 'zustand';

/** How far a phone's bottom sheet is open: one row of tabs, half the screen, or all of it. */
export type Sheet = 'peek' | 'half' | 'full';
/** The height of the sheet's peeking row (px): its handle and tabs. */
export const PEEK_PX = 60;

/** Whether the panel over the plan (a narrow window) is open, and how far a phone's sheet is. */
export const overStore = createStore<{ open: boolean; sheet: Sheet }>(() => ({ open: false, sheet: 'peek' }));

/** Open the panel where it is put away (over the plan, or a phone's sheet), e.g. for a menu command. */
export function revealPanel() {
  overStore.setState((s) => ({ open: true, sheet: s.sheet === 'peek' ? 'half' : s.sheet }));
}
