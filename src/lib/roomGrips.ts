/**
 * Room corner grips: dragging a room's corner moves the ends of the walls that meet there, so the
 * room (and any other room sharing that corner) reshapes with them. Pure: plan in, plan out.
 */
import { detectRoom, labelPoint } from '../rooms';
import { thicknessOf } from '../walls';
import { levelOf, type Id, type PlanDoc, type PlanElement, type Point, type Room, type Wall } from '../types';

const near = (a: Point, b: Point, r: number) => Math.hypot(a.x - b.x, a.y - b.y) <= r;

/** How far from a room corner a wall's end can be and still meet there: a room corner sits on the walls' faces. */
const reachOf = (w: Wall) => thicknessOf(w) * 0.75 + 0.5;

/** The ends of walls on the room's floor that meet at a corner: [wall id, which end]. */
export function wallEndsAt(doc: PlanDoc, room: Room, corner: Point): { id: Id; end: 'start' | 'end' }[] {
  const level = levelOf(room);
  const out: { id: Id; end: 'start' | 'end' }[] = [];
  for (const el of doc.elements) {
    if (el.type !== 'wall' || levelOf(el) !== level || el.locked || el.plotId) continue;
    const r = reachOf(el);
    if (near({ x: el.x1, y: el.y1 }, corner, r)) out.push({ id: el.id, end: 'start' });
    if (near({ x: el.x2, y: el.y2 }, corner, r)) out.push({ id: el.id, end: 'end' });
  }
  return out;
}

/** Move one end of a wall, keeping a curved wall's shape (its bow grows with its length). */
function moveEnd(w: Wall, end: 'start' | 'end', dx: number, dy: number): Wall {
  const next: Wall = end === 'start' ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy } : { ...w, x2: w.x2 + dx, y2: w.y2 + dy };
  const was = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
  if (w.bow && was) next.bow = (w.bow * Math.hypot(next.x2 - next.x1, next.y2 - next.y1)) / was;
  return next;
}

/**
 * Drag corner `index` of a room to `to`. The walls meeting there follow; the room and every other
 * room on its floor that shared the corner are found again from the walls (keeping their names).
 * Returns the plan unchanged when the room or corner isn't there, or when a wall would shrink to nothing.
 */
export function dragRoomCorner(doc: PlanDoc, roomId: Id, index: number, to: Point): PlanDoc {
  const room = doc.rooms.find((r) => r.id === roomId);
  const corner = room?.points[index];
  if (!room || !corner) return doc;
  const dx = to.x - corner.x;
  const dy = to.y - corner.y;
  if (!dx && !dy) return doc;
  const ends = wallEndsAt(doc, room, corner);
  const moved = new Map<Id, Wall>();
  for (const { id, end } of ends) {
    const w = (moved.get(id) ?? doc.elements.find((el) => el.id === id)) as Wall;
    const next = moveEnd(w, end, dx, dy);
    if (Math.hypot(next.x2 - next.x1, next.y2 - next.y1) < 1) return doc;
    moved.set(id, next);
  }
  const elements = moved.size ? doc.elements.map((el) => moved.get(el.id) ?? el) : doc.elements;
  const level = levelOf(room);
  const levelEls: PlanElement[] = elements.filter((el) => levelOf(el) === level);
  const reach = Math.max(1, ...ends.map(({ id }) => reachOf(moved.get(id)!)));
  const rooms = doc.rooms.map((r) => {
    if (levelOf(r) !== level) return r;
    const i = r.id === room.id ? index : r.points.findIndex((p) => near(p, corner, reach));
    if (i < 0) return r;
    const shifted = r.points.map((p, j) => (j === i ? { x: p.x + dx, y: p.y + dy } : p));
    // With walls moved, the room is what the walls now close in; without, just its corner moves.
    const found = moved.size ? detectRoom(levelEls, labelPoint(shifted)) : null;
    return { ...r, points: found ?? shifted };
  });
  return { ...doc, elements, rooms };
}

/**
 * Drag a wall, or one of its ends: the ends of the other walls on its floor that meet it there go
 * with it (so corners stay closed), and the rooms with a corner there are found again from the walls.
 * Returns the plan unchanged when the wall isn't there or a wall would shrink to nothing.
 */
export function dragWallJoints(
  doc: PlanDoc,
  wallId: Id,
  moves: { end: 'start' | 'end'; dx: number; dy: number }[],
): PlanDoc {
  const wall = doc.elements.find((el): el is Wall => el.id === wallId && el.type === 'wall');
  if (!wall || moves.every((m) => !m.dx && !m.dy)) return doc;
  const level = levelOf(wall);
  const corners = moves.map((m) => ({
    ...m,
    at: m.end === 'start' ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 },
  }));
  const moved = new Map<Id, Wall>();
  for (const c of corners) {
    for (const el of doc.elements) {
      if (el.type !== 'wall' || levelOf(el) !== level) continue;
      // Other walls follow unless they are locked or a plot's own; the wall dragged always does.
      if (el.id !== wallId && (el.locked || el.plotId)) continue;
      const ends: ('start' | 'end')[] =
        el.id === wallId
          ? [c.end]
          : (['start', 'end'] as const).filter((e) =>
              near(
                e === 'start' ? { x: el.x1, y: el.y1 } : { x: el.x2, y: el.y2 },
                c.at,
                Math.max(1, thicknessOf(el) / 2),
              ),
            );
      for (const end of ends) {
        const next = moveEnd(moved.get(el.id) ?? el, end, c.dx, c.dy);
        if (Math.hypot(next.x2 - next.x1, next.y2 - next.y1) < 1) return doc;
        moved.set(el.id, next);
      }
    }
  }
  const elements = doc.elements.map((el) => moved.get(el.id) ?? el);
  const levelEls: PlanElement[] = elements.filter((el) => levelOf(el) === level);
  const reach = Math.max(1, ...[...moved.values()].map(reachOf));
  const rooms = doc.rooms.map((r) => {
    if (levelOf(r) !== level) return r;
    let hit = false;
    const shifted = r.points.map((p) => {
      const c = corners.find((k) => near(p, k.at, reach));
      if (!c) return p;
      hit = true;
      return { x: p.x + c.dx, y: p.y + c.dy };
    });
    return hit ? { ...r, points: detectRoom(levelEls, labelPoint(shifted)) ?? shifted } : r;
  });
  return { ...doc, elements, rooms };
}
