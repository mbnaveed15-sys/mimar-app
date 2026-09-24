import { useMemo } from 'react';
import { levelOf, type PlanDoc } from '../types';
import { usePlanner } from './plannerStore';

/** The plan with only the active floor's elements and rooms, for drawing and summaries. */
export function useLevelDoc(offset = 0): PlanDoc | null {
  const doc = usePlanner((s) => s.doc);
  const activeLevel = usePlanner((s) => s.activeLevel);
  return useMemo(() => {
    const index = doc.levels.findIndex((l) => l.id === activeLevel) + offset;
    const level = doc.levels[index];
    if (!level) return null;
    return {
      ...doc,
      elements: doc.elements.filter((el) => levelOf(el) === level.id),
      rooms: doc.rooms.filter((r) => levelOf(r) === level.id),
    };
  }, [doc, activeLevel, offset]);
}
