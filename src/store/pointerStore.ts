import { createStore, useStore } from 'zustand';
import type { Point } from '../types';

/** Where the pointer is on the plan, for the X,Y readout in the bottom bar (kept apart so moving it redraws only that). */
export const pointerStore = createStore<{ at: Point | null }>()(() => ({ at: null }));

export const setPlanPointer = (at: Point | null) => pointerStore.setState({ at });

export const usePlanPointer = () => useStore(pointerStore, (s) => s.at);
