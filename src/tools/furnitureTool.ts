/**
 * The Furniture tool: the chosen item follows the pointer see-through, turned as it will be placed,
 * snapping its back against a room's wall (and into corners), else its corners to what is near, else
 * the grid. V (or Turn 90°) turns it before it is placed, and a typed angle sets its turn.
 */
import { snapsOn } from '../lib/checks';
import { FURNITURE_CATALOG } from '../furniture/catalog';
import { snapToFurniture, snapToWalls } from '../lib/furnitureSnap';
import type { Measure } from '../lib/measure';
import { snap } from '../geometry';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Furniture, Point, Wall } from '../types';
import { cornerSnap } from './controller';
import { kindPlaced, PLACING_TOOLS, serviceOf } from '../lib/services';

interface Store {
  getState: () => PlannerState;
}

/** Walls on the floor being drawn that furniture can back onto. */
function wallsShown(s: PlannerState): Wall[] {
  return s.visibleElements().filter((el): el is Wall => el.type === 'wall');
}

/** The item the Furniture tool places, centred at `p` and turned as set. */
export function furnitureAt(s: PlannerState, p: Point): Furniture {
  const kind = kindPlaced(s);
  const size = FURNITURE_CATALOG[kind];
  return {
    id: 'furniture-ghost',
    type: 'furniture',
    kind,
    x: p.x,
    y: p.y,
    w: size.w / MM_PER_UNIT,
    h: size.d / MM_PER_UNIT,
    ...(s.furnitureAngle ? { rotation: s.furnitureAngle } : {}),
    levelId: s.activeLevel,
  };
}

/**
 * Where an item at `raw` goes: against a wall when one is near (turned to it), else with a corner on
 * whatever is near, else on the grid. With snapping off (or Alt held while it is on) it stays put.
 */
export function placeFurniture(s: PlannerState, item: Furniture, raw: Point): Furniture {
  if (!snapsOn(s)) {
    s.setInference(null);
    return { ...item, x: raw.x, y: raw.y };
  }
  // Lights, fans and detectors hang from the ceiling: they don't back onto walls.
  const walled = serviceOf(item)?.mount === 'ceiling' ? null : snapFurniture(s, item, raw, s.furnitureAngle);
  if (walled) {
    s.setInference(null);
    return walled;
  }
  const at = { ...item, x: raw.x, y: raw.y };
  const found = cornerSnap(s, at, 0, 0, raw);
  s.setInference(found?.inf ?? null);
  if (found) return { ...at, x: raw.x + found.shift.x, y: raw.y + found.shift.y };
  const g = s.grid.snap ? snap(raw, s.gridPx) : raw;
  return { ...at, x: g.x, y: g.y };
}

/**
 * The item centred near `p` backed onto the nearest wall, turned `extra` degrees more (the Furniture
 * tool's angle while placing; none dragging an item, so it backs onto the wall). Null with no wall near.
 */
export function againstWall(s: PlannerState, item: Furniture, p: Point, extra = 0): Furniture | null {
  const walled = snapToWalls(item, p, wallsShown(s), extra);
  return walled && { ...item, ...walled, rotation: walled.rotation || undefined };
}

/**
 * The item centred near `p` against a wall (as `againstWall`) and lined up beside other furniture
 * near it: along the wall only, when it is against one. Null when neither is near.
 */
export function snapFurniture(s: PlannerState, item: Furniture, p: Point, extra = 0): Furniture | null {
  const walled = againstWall(s, item, p, extra);
  const base = walled ?? { ...item, x: p.x, y: p.y };
  const others = s
    .visibleElements()
    // Furniture lines up with furniture, and service points with service points.
    .filter(
      (el): el is Furniture =>
        el.type === 'furniture' && el.id !== item.id && !el.hidden && !serviceOf(el) === !serviceOf(item),
    );
  const beside = snapToFurniture(base, { x: base.x, y: base.y }, others);
  if (beside) {
    if (!walled) return { ...base, x: beside.x, y: beside.y };
    // Against a wall it only slides along it: its back stays on the wall.
    const a = ((walled.rotation ?? 0) * Math.PI) / 180;
    const back = { x: -Math.sin(a), y: Math.cos(a) };
    const off = (beside.x - walled.x) * back.x + (beside.y - walled.y) * back.y;
    if (Math.abs(off) < 0.5) return { ...walled, x: beside.x, y: beside.y };
  }
  return walled;
}

/** Pointer moved with the Furniture tool: move the see-through item. */
export function furnitureHover(store: Store, raw: Point) {
  const s = store.getState();
  const placed = placeFurniture(s, furnitureAt(s, raw), raw);
  s.setFurnitureGhost({ x: placed.x, y: placed.y, rotation: placed.rotation ?? 0 });
}

/** Pointer pressed with the Furniture tool: put the item down where it shows. */
export function furniturePress(store: Store, raw: Point) {
  const s = store.getState();
  const placed = placeFurniture(s, furnitureAt(s, raw), raw);
  s.addFurniture({ x: placed.x, y: placed.y }, placed.rotation ?? 0);
  s.setFurnitureGhost({ x: placed.x, y: placed.y, rotation: placed.rotation ?? 0 });
}

/** Turn the item the Furniture tool places by `deg` (V: 90°). False when that tool isn't in use. */
export function turnFurniture(store: Store, deg = 90): boolean {
  const s = store.getState();
  if (!PLACING_TOOLS.includes(s.tool)) return false;
  s.setFurnitureAngle(s.furnitureAngle + deg);
  const g = s.furnitureGhost;
  // Show the turn at once, without waiting for the pointer to move.
  if (g) furnitureHover(store, { x: g.x, y: g.y });
  return true;
}

/** A typed angle sets the turn of the items placed next. */
export function furnitureMeasure(store: Store, m: Measure): string | null {
  if (m.kind !== 'angle') return 'Type an angle in degrees, e.g. 90 or 45.';
  turnFurniture(store, m.deg - store.getState().furnitureAngle);
  return null;
}

export function furnitureReadout(s: PlannerState): { label: string; value: string } {
  return { label: 'Angle', value: `${Math.round(s.furnitureAngle)}°` };
}

export const SERVICES_HINT =
  'Click to place the item. Switches, sockets and other wall items turn their back to the nearest wall; lights and fans go anywhere. Then join them up with the Wire or pipe tool (Shift+U).';

export const FURNITURE_HINT =
  'Click to place the item. Near a wall it turns its back to it and sits flush; V turns it 90°, or type an angle. Hold Alt to place it freely.';
