/**
 * The Door and Window tools: a see-through copy follows the pointer along the wall under it,
 * snapping to the centre of the piece of wall, the centre of either half, the gap from a corner or
 * a round distance from it, with the clear distances to both ends shown. A click places it, a typed
 * length places it that far from the nearer corner, V flips the hinge and Alt-click picks up the
 * settings of a door or window already drawn.
 */
import { findElementNear } from '../geometry';
import type { Measure } from '../lib/measure';
import { MM_PER_UNIT } from '../lib/scale';
import { formatLength } from '../lib/units';
import { openingAt, openingDims, templateOf } from '../store/openingAt';
import type { PlannerState } from '../store/plannerStore';
import type { Opening, Point, Tool } from '../types';
import { thicknessOf } from '../walls';

interface Store {
  getState: () => PlannerState;
}

export const OPENING_TOOLS: Tool[] = ['door', 'window'];

const toolType = (s: PlannerState): 'door' | 'window' => (s.tool === 'window' ? 'window' : 'door');

/** Show what a click at `raw` would place, or why it can't go there. */
export function openingHover(store: Store, raw: Point) {
  const s = store.getState();
  const at = openingAt(s, toolType(s), raw);
  if (!at.ok) {
    s.setInference(null);
    // Away from walls there is nothing to say; on one, say why it can't go there.
    s.setDraft({ type: 'opening', cursor: raw, ...(at.wall && { error: at.error }) });
    return;
  }
  const { opening, placement, wall } = at;
  const a = (opening.angle * Math.PI) / 180;
  const n = { x: -Math.sin(a), y: Math.cos(a) };
  const towards = (raw.x - opening.x) * n.x + (raw.y - opening.y) * n.y >= 0 ? 1 : -1;
  s.setDraft({
    type: 'opening',
    cursor: raw,
    ghost: opening,
    thickness: thicknessOf(wall),
    dims: openingDims(wall, placement),
    side: { x: n.x * towards, y: n.y * towards },
  });
  s.setInference(placement.snap ? { point: { x: opening.x, y: opening.y }, kind: placement.snap } : null);
}

/** A click: place the door or window (or, with Alt, pick up the settings of one already drawn). */
export function openingPress(store: Store, raw: Point, opts: { alt?: boolean } = {}) {
  const s = store.getState();
  if (opts.alt) {
    pickUpOpening(store, raw);
    return;
  }
  if (s.placeOpening(toolType(s), raw)) openingHover(store, raw);
}

/** Alt-click on a door or window: new ones copy it (type, size, hinge side, sill, material). */
export function pickUpOpening(store: Store, raw: Point): boolean {
  const s = store.getState();
  const hit = findElementNear(s.levelElements(), raw, s.hitTolerance());
  if (hit?.type !== 'door' && hit?.type !== 'window') {
    s.setWarning('Alt-click a door or window to copy its settings.');
    return false;
  }
  const o = hit;
  if (s.tool !== o.type) s.setTool(o.type);
  const { hand } = templateOf(o);
  const mm = (u: number) => u * MM_PER_UNIT;
  if (o.type === 'door')
    s.setSite({
      gate: !!o.gate,
      ...(o.gate ? { gateWidthMm: mm(o.width) } : { doorWidthMm: mm(o.width), doorKind: o.doorKind ?? 'single' }),
      doorHand: hand,
      openingMaterial: { ...s.site.openingMaterial, door: o.material },
    });
  else
    s.setSite({
      windowKind: o.windowKind ?? 'fixed',
      windowWidthMm: mm(o.width),
      windowSillMm: o.sillMm,
      windowHeightMm: o.heightMm,
      openingMaterial: { ...s.site.openingMaterial, window: o.material },
    });
  // Shaped and open windows, and anything else the settings can't hold, come along as a copy.
  store.getState().setOpeningStamp([o]);
  s.setWarning(null);
  openingHover(store, raw);
  return true;
}

/** V: the hinge goes to the other side (for the settings, or the door or window picked up or pasted). */
export function flipOpeningHand(store: Store): boolean {
  const s = store.getState();
  if (!OPENING_TOOLS.includes(s.tool)) return false;
  const [first, ...rest] = s.openingStamp;
  if (first) s.setOpeningStamp([{ ...first, flipHinge: !first.flipHinge }, ...rest], s.stampQueue);
  else s.setSite({ doorHand: s.site.doorHand === 'left' ? 'right' : 'left' });
  const d = store.getState().draft;
  if (d?.type === 'opening') openingHover(store, d.cursor);
  return true;
}

/** A typed length: place the door or window that far from the nearer corner (to its edge). */
export function openingMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  if (m.kind !== 'length') return `Type the distance from the corner to the ${toolType(s)}'s edge, e.g. 2'6.`;
  const d = s.draft;
  if (d?.type !== 'opening') return `Point at a wall first, then type the distance from the corner.`;
  const at = openingAt(s, toolType(s), d.cursor, m.mm);
  if (!at.ok) return at.error;
  s.placeOpening(toolType(s), d.cursor, m.mm);
  openingHover(store, d.cursor);
  return null;
}

/** The Measurements box: the clear distance to the nearer corner. */
export function openingReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  if (d?.type !== 'opening' || !d.dims?.length) return { label: 'From corner', value: '' };
  const near = Math.min(...d.dims.map(([a, b]) => Math.hypot(b.x - a.x, b.y - a.y)));
  return { label: 'From corner', value: formatLength(near * MM_PER_UNIT, s.units) };
}

/** What the tool wants next. */
export function openingHint(s: PlannerState): string {
  const noun = s.openingStamp[0]?.type ?? toolType(s);
  const stamp = s.openingStamp.length
    ? s.stampQueue
      ? `Pasted: click on a wall to put the ${noun} down${s.openingStamp.length > 1 ? ` (${s.openingStamp.length} to go)` : ''}. `
      : `Placing copies of the ${noun} picked up. `
    : '';
  const hand = noun === 'door' ? ' It opens towards the pointer; V flips the hinge.' : ' V flips the hinge.';
  return `${stamp}Point at a wall: it snaps to the centre, the centre of either half, or the gap from a corner. Click to place, or type the distance from the corner.${hand} Alt-click one to copy it.`;
}

/** The door or window a ghost would be (for tests and the 3D view). */
export const ghostOf = (s: PlannerState): Opening | undefined =>
  s.draft?.type === 'opening' ? s.draft.ghost : undefined;
