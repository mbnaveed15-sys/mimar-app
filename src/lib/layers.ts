import type { Id, PlanDoc, PlanElement, Room } from '../types';

/** Every item goes on the layer for its kind, automatically. */
export const LAYERS = [
  { id: 'walls', label: 'Walls' },
  { id: 'doors', label: 'Doors & gates' },
  { id: 'windows', label: 'Windows' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'columns', label: 'Columns' },
  { id: 'beams', label: 'Beams' },
  { id: 'slabs', label: 'Slabs' },
  { id: 'stairs', label: 'Stairs & ramps' },
  { id: 'plot', label: 'Plot & setbacks' },
  { id: 'lines', label: 'Layout lines' },
] as const;

export type LayerId = (typeof LAYERS)[number]['id'];

export interface LayerFlags {
  hidden?: boolean;
  locked?: boolean;
}

export type LayerState = Partial<Record<LayerId, LayerFlags>>;

const BY_TYPE: Record<PlanElement['type'], LayerId> = {
  wall: 'walls',
  door: 'doors',
  window: 'windows',
  furniture: 'furniture',
  column: 'columns',
  beam: 'beams',
  slab: 'slabs',
  stair: 'stairs',
  plot: 'plot',
  line: 'lines',
};

export const layerOf = (item: PlanElement | Room): LayerId => ('type' in item ? BY_TYPE[item.type] : 'rooms');

/** What decides visibility: the plan's layer settings, and the Furniture layer switch. */
export interface Visibility {
  layers?: LayerState;
  showFurniture: boolean;
}

/** Hidden on its own, or its layer is hidden. */
export function isHidden(item: PlanElement | Room, v: Visibility): boolean {
  const layer = layerOf(item);
  return !!item.hidden || !!v.layers?.[layer]?.hidden || (layer === 'furniture' && !v.showFurniture);
}

/** Locked on its own, or its layer is locked: it shows and snaps, but can't be picked or changed. */
export function isLocked(item: PlanElement | Room, v: Visibility): boolean {
  return !!item.locked || !!v.layers?.[layerOf(item)]?.locked;
}

/** The plan without hidden items (doors and windows go with a hidden wall). */
export function withoutHidden(doc: PlanDoc, v: Visibility): PlanDoc {
  const hiddenWalls = new Set<Id>(
    doc.elements.filter((el) => el.type === 'wall' && isHidden(el, v)).map((el) => el.id),
  );
  return {
    ...doc,
    elements: doc.elements.filter((el) => !isHidden(el, v) && !('wallId' in el && hiddenWalls.has(el.wallId))),
    rooms: doc.rooms.filter((r) => !isHidden(r, v)),
  };
}

/** How many items each layer holds. */
export function layerCounts(doc: PlanDoc): Record<LayerId, number> {
  const counts = Object.fromEntries(LAYERS.map((l) => [l.id, 0])) as Record<LayerId, number>;
  for (const el of doc.elements) counts[layerOf(el)]++;
  counts.rooms += doc.rooms.length;
  return counts;
}
