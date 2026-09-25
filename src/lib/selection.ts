import { elementOutline, rotateElement, rotatePoint, translateElement } from '../geometry';
import type { Bounds, ComponentDef, Group, Id, PlanDoc, PlanElement, Point, Room, Wall } from '../types';
import { newId } from './ids';

/** Something that can be selected: a plan element or a room. */
export type Item = PlanElement | Room;

const isRoom = (item: Item): item is Room => !('type' in item);

export function itemById(doc: PlanDoc, id: Id): Item | undefined {
  return doc.elements.find((e) => e.id === id) ?? doc.rooms.find((r) => r.id === id);
}

/** Ids of everything in a group. */
export function groupMembers(doc: PlanDoc, groupId: Id): Id[] {
  return [...doc.elements, ...doc.rooms].filter((it) => it.groupId === groupId).map((it) => it.id);
}

/**
 * Clicking one item of a group selects the whole group, unless that group is open for editing.
 * Returns the ids with their groups filled in, without duplicates.
 */
export function expandToGroups(doc: PlanDoc, ids: Id[], openGroupId: Id | null): Id[] {
  const out = new Set<Id>();
  for (const id of ids) {
    const item = itemById(doc, id);
    if (!item) continue;
    if (item.groupId && item.groupId !== openGroupId) groupMembers(doc, item.groupId).forEach((m) => out.add(m));
    else out.add(id);
  }
  return [...out];
}

function pointsOf(item: Item): Point[] {
  return isRoom(item) ? item.points : elementOutline(item);
}

function boundsOf(points: Point[]): Bounds | null {
  if (!points.length) return null;
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/** The box around the given items, or null if there are none. */
export function selectionBounds(doc: PlanDoc, ids: Id[]): Bounds | null {
  return boundsOf(ids.flatMap((id) => (itemById(doc, id) ? pointsOf(itemById(doc, id)!) : [])));
}

export function boundsCentre(b: Bounds): Point {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

const inside = (p: Point, r: Bounds) => p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY;

/** Whether segment a–b touches box r. */
function segmentTouches(a: Point, b: Point, r: Bounds): boolean {
  if (inside(a, r) || inside(b, r)) return true;
  // Clip the segment against the box (Liang–Barsky).
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - r.minX],
    [dx, r.maxX - a.x],
    [-dy, a.y - r.minY],
    [dy, r.maxY - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Items picked by a selection box. Dragging left to right (window) takes items entirely inside;
 * right to left (crossing) takes anything the box touches, like SketchUp.
 */
export function itemsInBox(
  items: Item[],
  box: Bounds,
  crossing: boolean,
  /** Where each plan point lands, when the box is drawn somewhere else (the 3D view's screen). */
  project: (p: Point) => Point = (p) => p,
): Id[] {
  return items
    .filter((item) => {
      const pts = pointsOf(item).map(project);
      if (!crossing) return pts.every((p) => inside(p, box));
      const closed = pts.length > 2;
      return (
        pts.some((p, i) => {
          const next = pts[(i + 1) % pts.length];
          return (closed || i < pts.length - 1) && segmentTouches(p, next, box);
        }) ||
        (pts.length === 1 && inside(pts[0], box))
      );
    })
    .map((item) => item.id);
}

const translateRoom = (r: Room, dx: number, dy: number): Room => ({
  ...r,
  points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
});
const rotateRoom = (r: Room, c: Point, deg: number): Room => ({
  ...r,
  points: r.points.map((p) => rotatePoint(p, c, deg)),
});

/** Groups all of whose items are in ids. */
function wholeGroups(doc: PlanDoc, ids: Set<Id>): Set<Id> {
  const out = new Set<Id>();
  for (const g of doc.groups) {
    const members = groupMembers(doc, g.id);
    if (members.length && members.every((m) => ids.has(m))) out.add(g.id);
  }
  return out;
}

/** Items that go along with ids: doors and windows in any wall being changed. */
function withOpenings(doc: PlanDoc, ids: Id[]): Set<Id> {
  const set = new Set(ids);
  for (const el of doc.elements) if ('wallId' in el && set.has(el.wallId)) set.add(el.id);
  return set;
}

/** Move items (and whole groups' placements) by dx, dy. */
export function moveItems(doc: PlanDoc, ids: Id[], dx: number, dy: number): PlanDoc {
  if (!dx && !dy) return doc;
  const set = withOpenings(doc, ids);
  const groups = wholeGroups(doc, set);
  return {
    ...doc,
    elements: doc.elements.map((el) => (set.has(el.id) ? translateElement(el, dx, dy) : el)),
    rooms: doc.rooms.map((r) => (set.has(r.id) ? translateRoom(r, dx, dy) : r)),
    groups: doc.groups.map((g) => (groups.has(g.id) ? { ...g, x: g.x + dx, y: g.y + dy } : g)),
  };
}

/** Turn items (and whole groups' placements) about centre c. */
export function rotateItems(doc: PlanDoc, ids: Id[], c: Point, deg: number): PlanDoc {
  if (!deg) return doc;
  const set = withOpenings(doc, ids);
  const groups = wholeGroups(doc, set);
  return {
    ...doc,
    elements: doc.elements.map((el) => (set.has(el.id) ? rotateElement(el, c, deg) : el)),
    rooms: doc.rooms.map((r) => (set.has(r.id) ? rotateRoom(r, c, deg) : r)),
    groups: doc.groups.map((g) => {
      if (!groups.has(g.id)) return g;
      const p = rotatePoint(g, c, deg);
      return { ...g, x: p.x, y: p.y, rotation: g.rotation + deg };
    }),
  };
}

/** Remove items, the doors and windows in removed walls, and groups left empty. */
export function deleteItems(doc: PlanDoc, ids: Id[]): PlanDoc {
  const set = withOpenings(doc, ids);
  const next = {
    ...doc,
    elements: doc.elements.filter((el) => !set.has(el.id)),
    rooms: doc.rooms.filter((r) => !set.has(r.id)),
  };
  return pruneGroups(next);
}

/** Drop groups that no longer have any items. */
function pruneGroups(doc: PlanDoc): PlanDoc {
  const used = new Set([...doc.elements, ...doc.rooms].map((it) => it.groupId).filter(Boolean));
  const groups = doc.groups.filter((g) => used.has(g.id));
  return groups.length === doc.groups.length ? doc : { ...doc, groups };
}

/**
 * Copy items, moved by dx, dy. Doors and windows are copied with their wall; groups (and component
 * copies) are copied as new groups. Returns the new plan and the new items' ids.
 */
export function copyItems(doc: PlanDoc, ids: Id[], dx: number, dy: number): { doc: PlanDoc; ids: Id[] } {
  const set = withOpenings(doc, ids);
  const idMap = new Map<Id, Id>();
  for (const id of set) idMap.set(id, newId());
  const groupMap = new Map<Id, Group>();
  for (const g of doc.groups) {
    if (!groupMembers(doc, g.id).some((m) => set.has(m))) continue;
    groupMap.set(g.id, { ...g, id: newId(), x: g.x + dx, y: g.y + dy });
  }
  const regroup = <T extends Item>(it: T): T =>
    it.groupId && groupMap.has(it.groupId) ? { ...it, groupId: groupMap.get(it.groupId)!.id } : it;

  const elements: PlanElement[] = [];
  for (const el of doc.elements) {
    if (!set.has(el.id)) continue;
    if ('wallId' in el && !idMap.has(el.wallId)) continue; // a door without its wall can't be copied
    const moved = translateElement({ ...el, id: idMap.get(el.id)! }, dx, dy);
    elements.push(regroup('wallId' in moved ? { ...moved, wallId: idMap.get(moved.wallId)! } : moved));
  }
  const rooms = doc.rooms
    .filter((r) => set.has(r.id))
    .map((r) => regroup(translateRoom({ ...r, id: idMap.get(r.id)! }, dx, dy)));
  return {
    doc: {
      ...doc,
      elements: [...doc.elements, ...elements],
      rooms: [...doc.rooms, ...rooms],
      groups: [...doc.groups, ...groupMap.values()],
    },
    ids: [...elements, ...rooms].map((it) => it.id),
  };
}

/** Put items into a new group (taking them out of any group they were in). */
export function groupItems(
  doc: PlanDoc,
  ids: Id[],
  name: string,
  extra: Partial<Group> = {},
): { doc: PlanDoc; groupId: Id } {
  const set = withOpenings(doc, ids);
  const box = selectionBounds(doc, [...set]);
  const centre = box ? boundsCentre(box) : { x: 0, y: 0 };
  const group: Group = { id: newId(), name, x: centre.x, y: centre.y, rotation: 0, ...extra };
  const put = <T extends Item>(it: T): T => (set.has(it.id) ? { ...it, groupId: group.id, defKey: undefined } : it);
  const next = pruneGroups({
    ...doc,
    elements: doc.elements.map(put),
    rooms: doc.rooms.map(put),
    groups: [...doc.groups, group],
  });
  return { doc: next, groupId: group.id };
}

/** Take a group apart; its items stay where they are. */
export function ungroup(doc: PlanDoc, groupId: Id): PlanDoc {
  const free = <T extends Item>(it: T): T =>
    it.groupId === groupId ? { ...it, groupId: undefined, defKey: undefined } : it;
  return {
    ...doc,
    elements: doc.elements.map(free),
    rooms: doc.rooms.map(free),
    groups: doc.groups.filter((g) => g.id !== groupId),
  };
}

/** A placed item back in its component's own coordinates (around 0,0, unturned). */
function toLocal<T extends Item>(it: T, g: Group): T {
  if (isRoom(it)) return rotateRoom(translateRoom(it, -g.x, -g.y), { x: 0, y: 0 }, -g.rotation) as T;
  return rotateElement(translateElement(it, -g.x, -g.y), { x: 0, y: 0 }, -g.rotation) as T;
}

/** A component item placed at a group's position and rotation. */
function toPlaced<T extends Item>(it: T, g: Group): T {
  if (isRoom(it)) return translateRoom(rotateRoom(it, { x: 0, y: 0 }, g.rotation), g.x, g.y) as T;
  return translateElement(rotateElement(it, { x: 0, y: 0 }, g.rotation), g.x, g.y) as T;
}

/** Items for one copy of a component, with fresh ids, in group g. */
function placeCopy(def: ComponentDef, g: Group): { elements: PlanElement[]; rooms: Room[] } {
  const idMap = new Map(def.elements.map((el) => [el.id, newId()] as const));
  const elements = def.elements
    .filter((el) => !('wallId' in el) || idMap.has(el.wallId))
    .map((el) => {
      const placed = toPlaced({ ...el, id: idMap.get(el.id)!, groupId: g.id, defKey: el.id }, g);
      return 'wallId' in placed ? { ...placed, wallId: idMap.get(placed.wallId)! } : placed;
    });
  const rooms = def.rooms.map((r) => toPlaced({ ...r, id: newId(), groupId: g.id, defKey: r.id }, g));
  return { elements, rooms };
}

/** Turn items into a component: a group whose contents are saved as a reusable definition. */
export function makeComponent(doc: PlanDoc, ids: Id[], name: string): { doc: PlanDoc; groupId: Id } {
  const componentId = newId();
  const grouped = groupItems(doc, ids, name, { componentId });
  const g = grouped.doc.groups.find((x) => x.id === grouped.groupId)!;
  const members = new Set(groupMembers(grouped.doc, g.id));
  const keyed = <T extends Item>(it: T): T => (members.has(it.id) ? { ...it, defKey: it.id } : it);
  const next = { ...grouped.doc, elements: grouped.doc.elements.map(keyed), rooms: grouped.doc.rooms.map(keyed) };
  const def: ComponentDef = {
    id: componentId,
    name,
    elements: next.elements.filter((el) => members.has(el.id)).map((el) => strip(toLocal(el, g))),
    rooms: next.rooms.filter((r) => members.has(r.id)).map((r) => strip(toLocal(r, g))),
  };
  return { doc: { ...next, components: [...next.components, def] }, groupId: g.id };
}

/** A definition item: its id is its key, and it belongs to no group. */
function strip<T extends Item>(it: T): T {
  return { ...it, id: it.defKey ?? it.id, groupId: undefined, defKey: undefined };
}

/**
 * After a component copy was edited, save its contents as the component and rebuild every other
 * copy to match, each at its own position and rotation.
 */
export function syncComponent(doc: PlanDoc, groupId: Id): PlanDoc {
  const g = doc.groups.find((x) => x.id === groupId);
  const def = g?.componentId ? doc.components.find((c) => c.id === g.componentId) : undefined;
  if (!g || !def) return doc;
  // New items added while editing get their own keys.
  const keyOf = (it: Item) => it.defKey ?? it.id;
  const members = new Set(groupMembers(doc, g.id));
  const localIds = new Map<Id, Id>();
  for (const el of doc.elements) if (members.has(el.id)) localIds.set(el.id, keyOf(el));
  const elements = doc.elements
    .filter((el) => members.has(el.id))
    .map((el) => {
      const local = strip(toLocal({ ...el, defKey: keyOf(el) }, g));
      return 'wallId' in local && localIds.has(local.wallId)
        ? { ...local, wallId: localIds.get(local.wallId)! }
        : local;
    });
  const rooms = doc.rooms.filter((r) => members.has(r.id)).map((r) => strip(toLocal({ ...r, defKey: keyOf(r) }, g)));
  const nextDef: ComponentDef = { ...def, elements, rooms };

  const others = doc.groups.filter((x) => x.componentId === def.id && x.id !== g.id);
  const otherIds = new Set(others.map((x) => x.id));
  let next: PlanDoc = {
    ...doc,
    elements: doc.elements
      .filter((el) => !(el.groupId && otherIds.has(el.groupId)))
      .map((el) => (members.has(el.id) ? { ...el, defKey: keyOf(el) } : el)),
    rooms: doc.rooms
      .filter((r) => !(r.groupId && otherIds.has(r.groupId)))
      .map((r) => (members.has(r.id) ? { ...r, defKey: keyOf(r) } : r)),
    components: doc.components.map((c) => (c.id === def.id ? nextDef : c)),
  };
  for (const other of others) {
    const copy = placeCopy(nextDef, other);
    next = { ...next, elements: [...next.elements, ...copy.elements], rooms: [...next.rooms, ...copy.rooms] };
  }
  return next;
}

/** Place a new copy of a component with its centre at `at`. */
export function placeComponent(doc: PlanDoc, componentId: Id, at: Point): { doc: PlanDoc; groupId: Id } | null {
  const def = doc.components.find((c) => c.id === componentId);
  if (!def) return null;
  const g: Group = { id: newId(), name: def.name, componentId, x: at.x, y: at.y, rotation: 0 };
  const copy = placeCopy(def, g);
  return {
    doc: {
      ...doc,
      elements: [...doc.elements, ...copy.elements],
      rooms: [...doc.rooms, ...copy.rooms],
      groups: [...doc.groups, g],
    },
    groupId: g.id,
  };
}

/** Make a component copy independent: it gets its own new component, copied from the old one. */
export function makeUnique(doc: PlanDoc, groupId: Id): PlanDoc {
  const g = doc.groups.find((x) => x.id === groupId);
  const def = g?.componentId ? doc.components.find((c) => c.id === g.componentId) : undefined;
  if (!g || !def) return doc;
  const copies = doc.groups.filter((x) => x.componentId === def.id).length;
  const fresh: ComponentDef = { ...def, id: newId(), name: `${def.name} (${copies})` };
  return {
    ...doc,
    groups: doc.groups.map((x) => (x.id === groupId ? { ...x, componentId: fresh.id, name: fresh.name } : x)),
    components: [...doc.components, fresh],
  };
}

/** Walls among the items, for snapping. */
export function wallsIn(doc: PlanDoc, ids: Set<Id>): Wall[] {
  return doc.elements.filter((el): el is Wall => el.type === 'wall' && ids.has(el.id));
}
