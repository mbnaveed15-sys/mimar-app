import { useMemo } from 'react';
import { layerOf, withoutHidden } from '../lib/layers';
import { onSharedLevel, sharedLevelIds } from '../lib/levels';
import { levelOf, type PlanDoc } from '../types';
import { usePlanner } from './plannerStore';

/**
 * The plan with only the active floor's elements and rooms (on Ground, its floor and lawn together),
 * for drawing and summaries; `offset` gives the floor above or below instead.
 */
export function useLevelDoc(offset = 0): PlanDoc | null {
  const full = usePlanner((s) => s.doc);
  const showFurniture = usePlanner((s) => s.showFurniture);
  const frameView = usePlanner((s) => s.frameView);
  // Hidden items are left out of what is drawn; so are footings, tie and plinth beams unless only the
  // structure is shown.
  const doc = useMemo(() => {
    const shown = withoutHidden(full, { layers: full.layers, showFurniture });
    return frameView ? shown : { ...shown, elements: shown.elements.filter((el) => layerOf(el) !== 'foundations') };
  }, [full, showFurniture, frameView]);
  const activeLevel = usePlanner((s) => s.activeLevel);
  return useMemo(() => {
    // Ground's floor and lawn are one: the floors above and below are past both.
    const shared = sharedLevelIds(doc, activeLevel);
    const at = doc.levels.findIndex((l) => l.id === shared[offset > 0 ? shared.length - 1 : 0]);
    const level = offset ? doc.levels[at + offset] : doc.levels.find((l) => l.id === activeLevel);
    // A floor hidden in the floor menu doesn't show as the floor below (the one being drawn always shows).
    if (!level || (offset && level.hidden)) return null;
    const on = offset ? (it: { levelId?: string }) => levelOf(it) === level.id : onSharedLevel(doc, activeLevel);
    return { ...doc, elements: doc.elements.filter(on), rooms: doc.rooms.filter(on) };
  }, [doc, activeLevel, offset]);
}
