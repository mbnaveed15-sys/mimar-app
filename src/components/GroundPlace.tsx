import { isSiteLevel } from '../lib/levels';
import { plannerStore, usePlanner } from '../store/plannerStore';
import { GROUND_LEVEL, levelOf, SITE_LEVEL } from '../types';

/**
 * On Ground: whether the items sit on its floor or on its lawn under it, and a switch to move them
 * (doors and windows go with their walls). Nothing for items on other floors.
 */
export function GroundPlace({ ids }: { ids: string[] }) {
  const levels = usePlanner((s) => s.doc.levels);
  const place = usePlanner((s) => {
    const picked = new Set(ids);
    const on = new Set([...s.doc.elements, ...s.doc.rooms].filter((it) => picked.has(it.id)).map((it) => levelOf(it)));
    if (![...on].every((id) => id === GROUND_LEVEL || isSiteLevel(s.doc, id))) return null;
    if (on.size !== 1) return 'both';
    return isSiteLevel(s.doc, [...on][0]) ? 'lawn' : 'floor';
  });
  if (!place || !levels.length) return null;
  const move = (levelId: string) => plannerStore.getState().setItemsLevel(ids, levelId);
  return (
    <div className="flex items-center gap-2" data-testid="ground-place">
      <span className="text-muted">On</span>
      <div className="flex gap-1" role="group" aria-label="On the ground floor or the lawn">
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={place === 'floor'}
          title="On the ground floor, at the plinth's top"
          onClick={() => move(GROUND_LEVEL)}
        >
          Floor
        </button>
        <button
          className="m-btn px-2 py-0.5"
          aria-pressed={place === 'lawn'}
          title="On the lawn under the floor (plinth walls, platforms, steps, the garden)"
          onClick={() => move(SITE_LEVEL)}
        >
          Lawn
        </button>
      </div>
    </div>
  );
}
