/**
 * What the door and window tools would place where the pointer is: a new opening built from the
 * tool's settings (or from a door or window picked up or pasted), on the nearest wall, placed by
 * the rules in openingPlace (inside a piece of wall, clear of corners and other openings).
 */
import { nearestWall, wallLength } from '../geometry';
import { pointAlong } from '../lib/arc';
import { DOOR_WIDTH_MM, WINDOW_SIZE_MM } from '../lib/openingKinds';
import {
  flipsTowards,
  handOf,
  placeAtDistance,
  placeOnWallPiece,
  type Hand,
  type OpeningSnap,
  type PlaceContext,
  type Placement,
} from '../lib/openingPlace';
import { MM_PER_UNIT } from '../lib/scale';
import { formatLength } from '../lib/units';
import { levelOf, type Id, type Opening, type PlanDoc, type PlanElement, type Point, type Wall } from '../types';
import { wallsOf } from '../walls';
import type { PlannerState } from './plannerStore';

export type OpeningAt =
  | { ok: true; opening: Opening; placement: Extract<Placement, { ok: true }>; wall: Wall }
  | { ok: false; error: string; wall?: Wall };

/** The id of the see-through copy shown before placing. */
export const GHOST_ID = 'draft-opening';

/** "door", "window" or "gate", for messages. */
export const nounOf = (o: Pick<Opening, 'type' | 'gate'>) => (o.gate ? 'gate' : o.type);

/** The rules for placing on the floor being drawn. */
export function placeContext(s: PlannerState, noun: string, elements: PlanElement[], ignoreId?: Id): PlaceContext {
  return {
    walls: wallsOf(elements),
    openings: elements.filter((el): el is Opening => el.type === 'door' || el.type === 'window'),
    gap: s.openingGapMm / MM_PER_UNIT,
    grid: s.grid.snap ? s.gridPx : null,
    tolerance: 8 * s.reach() * s.pxUnits(),
    ignoreId,
    fmt: (u) => formatLength(u * MM_PER_UNIT, s.units),
    noun,
  };
}

/** A new door or window from the tool's settings, without a place yet; and the hand for a door. */
function fromSettings(s: PlannerState, type: 'door' | 'window'): { template: Omit<Opening, PlaceKeys>; hand: Hand } {
  const { site } = s;
  const mmToUnits = (mm: number) => mm / s.scaleMMperPx;
  const material =
    site.openingMaterial?.[type] ?? (s.doc.materials.find((m) => m.id === s.selectedMat) ?? s.doc.materials[0])?.id;
  if (type === 'door') {
    const gate = site.gate;
    const widthMm = gate ? site.gateWidthMm : (site.doorWidthMm ?? DOOR_WIDTH_MM[site.doorKind]);
    return {
      template: {
        type,
        width: mmToUnits(widthMm),
        material,
        ...(gate ? { gate: true } : {}),
        ...(!gate && site.doorKind !== 'single' && { doorKind: site.doorKind }),
      },
      hand: site.doorHand,
    };
  }
  const size = WINDOW_SIZE_MM[site.windowKind];
  const sillMm = site.windowSillMm ?? size.sillMm;
  const heightMm = site.windowHeightMm ?? size.heightMm;
  return {
    template: {
      type,
      width: mmToUnits(site.windowWidthMm ?? size.width),
      material,
      windowKind: site.windowKind,
      ...(sillMm !== undefined && { sillMm }),
      ...(heightMm !== undefined && { heightMm }),
    },
    hand: site.doorHand,
  };
}

/** The keys that say where an opening is; everything else is copied from a template. */
type PlaceKeys = 'id' | 'wallId' | 'x' | 'y' | 'angle';

/** A door or window to copy: all it is but where it stands (and its group, and floor). */
export function templateOf(o: Opening): { template: Omit<Opening, PlaceKeys>; hand: Hand } {
  const copy: Partial<Opening> = { ...o };
  for (const key of [
    'id',
    'wallId',
    'x',
    'y',
    'angle',
    'groupId',
    'defKey',
    'levelId',
    'flipSide',
    'flipHinge',
  ] as const)
    delete copy[key];
  return { template: copy as Omit<Opening, PlaceKeys>, hand: handOf(o) };
}

/**
 * The flips for a new opening at its place: a door opens towards the side the pointer is on (a
 * window's outside is the other side: it is placed from inside), with the hinge on the chosen hand
 * seen from the pointer's side.
 */
function facing(o: Opening, p: Point, hand: Hand): Pick<Opening, 'flipSide' | 'flipHinge'> {
  const { flipSide, flipHinge } = flipsTowards(o, p, hand);
  return { flipSide: flipSide || undefined, flipHinge: flipHinge || undefined };
}

/** Drop keys whose value is undefined, so new openings stay as tidy as before. */
export function tidy<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * An opening made from a template, on the wall of `elements` nearest p (or a typed distance from the
 * nearer corner), or why it can't go there.
 */
export function placeTemplate(
  s: PlannerState,
  elements: PlanElement[],
  template: Omit<Opening, PlaceKeys>,
  hand: Hand,
  p: Point,
  typedMm?: number,
): OpeningAt {
  const noun = nounOf(template);
  const wall = nearestWall(elements, p, s.hitTolerance() * 1.5);
  if (!wall) return { ok: false, error: `Point at a wall to place a ${noun}.` };
  const ctx = placeContext(s, noun, elements);
  const at =
    typedMm !== undefined
      ? placeAtDistance(wall, p, template.width, typedMm / MM_PER_UNIT, ctx)
      : placeOnWallPiece(wall, p, template.width, ctx);
  if (!at.ok) return { ok: false, error: at.error, wall };
  const placed = { ...template, id: GHOST_ID, wallId: wall.id, x: at.x, y: at.y, angle: at.angle } as Opening;
  const opening = tidy({ ...placed, ...facing(placed, p, hand) });
  return { ok: true, opening, placement: at, wall };
}

/**
 * The opening the door or window tool would place at p (or a typed distance from the nearer corner),
 * or why it can't go there. It is made from the picked-up or pasted opening when there is one.
 */
export function openingAt(s: PlannerState, type: 'door' | 'window', p: Point, typedMm?: number): OpeningAt {
  const stamp = s.openingStamp[0];
  const { template, hand } = stamp ? templateOf(stamp) : fromSettings(s, type);
  return placeTemplate(s, s.levelElements(), template, hand, p, typedMm);
}

/** Where the clear distances go: from each end of the piece to the opening's near edge, on the centre line. */
export function openingDims(wall: Wall, at: Extract<Placement, { ok: true }>): [Point, Point][] {
  const len = wallLength(wall) || 1;
  const pt = (s: number) => pointAlong(wall, s / len);
  const out: [Point, Point][] = [];
  if (at.before > 0.5) out.push([pt(at.piece.a), pt(at.s - at.width / 2)]);
  if (at.after > 0.5) out.push([pt(at.s + at.width / 2), pt(at.piece.b)]);
  return out;
}

/**
 * A door or window slid along its wall to near p, in the plan `doc`: it keeps its gaps and snaps
 * like a new one. Where it was (and no snap) when it can't go there.
 */
export function slideOpening(
  s: PlannerState,
  doc: PlanDoc,
  o: Opening,
  p: Point,
): { opening: Opening; snap: OpeningSnap | null } {
  const wall = doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === o.wallId);
  if (!wall) return { opening: o, snap: null };
  const level = levelOf(o);
  const elements = doc.elements.filter((el) => levelOf(el) === level);
  const at = placeOnWallPiece(wall, p, o.width, placeContext(s, nounOf(o), elements, o.id));
  if (!at.ok) return { opening: o, snap: null };
  return { opening: { ...o, x: at.x, y: at.y, angle: at.angle }, snap: at.snap };
}

/**
 * A door or window with a new width (or where it is, if none), kept in its wall clear of the
 * corners and other openings: it stays centred where it was if it can, or moves the least it must.
 * Null when there is no room for it in its piece of wall.
 */
export function refitOpening(s: PlannerState, doc: PlanDoc, o: Opening, width = o.width): Opening | null {
  const wall = doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === o.wallId);
  if (!wall) return null;
  const level = levelOf(o);
  const elements = doc.elements.filter((el) => levelOf(el) === level);
  const ctx = { ...placeContext(s, nounOf(o), elements, o.id), noSnap: true };
  const at = placeOnWallPiece(wall, o, width, ctx);
  return at.ok ? { ...o, x: at.x, y: at.y, angle: at.angle, width } : null;
}

/**
 * The doors and windows among `ids` that are on their own (their wall isn't among them), when that
 * is all `ids` holds; otherwise none. Shapes only drawn on a wall's face are left out.
 */
export function loneOpenings(doc: PlanDoc, ids: Id[]): Opening[] {
  const set = new Set(ids);
  const out: Opening[] = [];
  for (const id of ids) {
    const el = doc.elements.find((e) => e.id === id);
    if ((el?.type !== 'door' && el?.type !== 'window') || set.has(el.wallId) || el.flat) return [];
    out.push(el);
  }
  return out;
}

/** The plan's items on one floor. */
const onLevel = (doc: PlanDoc, level: Id) => doc.elements.filter((el) => levelOf(el) === level);

/**
 * A copy of a door or window on the wall nearest p in `doc` (on the floor being drawn), opening
 * towards p with the same hinge side, clear of corners and other openings; null when it can't go.
 */
export function copyOpeningTo(s: PlannerState, doc: PlanDoc, o: Opening, p: Point, id: Id): Opening | null {
  const { template, hand } = templateOf(o);
  const at = placeTemplate(s, onLevel(doc, s.activeLevel), template, hand, p);
  return at.ok ? { ...at.opening, id, ...(o.levelId && { levelId: o.levelId }) } : null;
}

/** A copy of a door or window beside it on its wall (either side), or null when there is no room. */
export function besideOpening(s: PlannerState, doc: PlanDoc, o: Opening, id: Id): Opening | null {
  const a = (o.angle * Math.PI) / 180;
  const step = o.width + s.openingGapMm / MM_PER_UNIT;
  for (const dir of [1, -1]) {
    const at = { x: o.x + Math.cos(a) * step * dir, y: o.y + Math.sin(a) * step * dir };
    const copy = refitOpening(s, doc, { ...o, id, ...at, groupId: undefined, defKey: undefined });
    if (copy) return tidy(copy);
  }
  return null;
}

/** Fit a mirrored door or window in its wall (for mirrorItems). */
export const fitterFor = (s: PlannerState) => (o: Opening, doc: PlanDoc) => refitOpening(s, doc, o);
