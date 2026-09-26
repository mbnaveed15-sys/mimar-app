import { nearestWall, wallParam } from '../geometry';
import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import {
  breakWall,
  chamferWalls,
  distanceToLine,
  extendWall,
  filletWalls,
  joinWalls,
  mirrorItems,
  offsetWall,
  scaleItems,
  stretchItems,
  trimAt,
} from '../lib/modify';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import type { Id, PlanDoc, Point, Wall } from '../types';

/** The bits of a zustand store these tools need. */
interface Store {
  getState: () => PlannerState;
}

const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const tolOf = (s: PlannerState) => 10 * s.pxUnits();

function wallAt(s: PlannerState, raw: Point): Wall | null {
  return nearestWall(s.pickableElements(), raw, s.hitTolerance() * 1.5);
}

function wallById(s: PlannerState, id: Id): Wall | undefined {
  return s.doc.elements.find((e): e is Wall => e.type === 'wall' && e.id === id);
}

/** The selection, or whatever was clicked (which becomes the selection). */
function selectionFor(store: Store, raw: Point): Id[] | null {
  const s = store.getState();
  const hit = s.pickableElements().find((el) => el.id === wallAt(s, raw)?.id) ?? null;
  if (!s.selectedIds.length && hit) s.select(hit.id);
  const ids = store.getState().selectedIds;
  return ids.length ? ids : null;
}

/** Where the active step draws from, for snapping. */
export function modifyAnchor(s: PlannerState): Point | null {
  const d = s.draft;
  if (d?.type === 'mirror') return d.a;
  if (d?.type === 'stretch' && d.base) return d.base;
  if (d?.type === 'scale') return d.base;
  return null;
}

/** Offset preview: the parallel wall at the pointer's distance (snapped to the grid). */
function offsetDraft(s: PlannerState, wall: Wall, side: Point, d?: number) {
  let distance = d ?? distanceToLine(wall, side);
  if (d === undefined && s.grid.snap) distance = Math.max(s.gridPx, Math.round(distance / s.gridPx) * s.gridPx);
  const w = offsetWall(wall, distance, side);
  return { type: 'offset' as const, wallId: wall.id, side, dist: distance, x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 };
}

/** Commit a change that cuts walls, and say so if doors or windows went with the cut. */
function commitCounted(store: Store, recipe: (doc: PlanDoc) => PlanDoc) {
  const openings = () =>
    store.getState().doc.elements.filter((el) => el.type === 'door' || el.type === 'window').length;
  const before = openings();
  store.getState().commit(recipe);
  const lost = before - openings();
  if (lost > 0)
    store
      .getState()
      .setWarning(
        `The cut went through ${lost === 1 ? 'a door or window' : `${lost} doors or windows`}, so ${lost === 1 ? 'it was' : 'they were'} removed. Undo (Ctrl+Z) to bring ${lost === 1 ? 'it' : 'them'} back.`,
      );
}

/** The second wall of Join, Fillet, Chamfer, or the second point of Break. */
function finishPair(store: Store, raw: Point, first: { wallId: Id; point: Point }) {
  const s = store.getState();
  const tol = tolOf(s);
  const a = wallById(s, first.wallId);
  if (!a) return s.setDraft(null);
  const b = wallAt(s, raw);
  if (s.tool === 'breakWall') {
    if (b?.id !== a.id) return s.setWarning('Click the same wall again where the gap should end.');
    const t1 = wallParam(a, first.point);
    const t2 = dist(raw, first.point) <= tol ? t1 : wallParam(a, raw);
    s.setDraft(null);
    s.setWarning(null);
    return commitCounted(store, (doc) => breakWall(doc, a.id, t1, t2));
  }
  if (!b || b.id === a.id) return s.setWarning('Click a second wall.');
  let next = null;
  if (s.tool === 'join') next = joinWalls(s.doc, a.id, b.id, tol);
  if (s.tool === 'fillet') next = filletWalls(s.doc, a.id, first.point, b.id, raw, s.filletRadius);
  if (s.tool === 'chamfer') next = chamferWalls(s.doc, a.id, first.point, b.id, raw, ...s.chamferDist);
  if (!next) {
    const why: Record<string, string> = {
      join: 'Join needs two walls in a straight line with each other.',
      fillet: 'These walls cannot meet: they are parallel, or the radius is too big for them.',
      chamfer: 'These walls cannot be chamfered: they are parallel, or the distances are too big.',
    };
    s.setDraft(null);
    return s.setWarning(why[s.tool]);
  }
  const result = next;
  s.commit(() => result);
  s.setDraft(null);
  s.setWarning(null);
}

/** Pointer pressed with a Modify tool. */
export function modifyPress(store: Store, raw: Point, inf: Inference, opts: { ctrl?: boolean }) {
  const s = store.getState();
  const d = s.draft;
  const p = inf.point;
  const tol = tolOf(s);
  switch (s.tool) {
    case 'offset': {
      if (d?.type === 'offset') {
        const wall = wallById(s, d.wallId);
        if (wall) s.addElements([offsetWall(wall, d.dist, d.side)]);
        s.setDraft(null);
        return;
      }
      const wall = wallAt(s, raw);
      if (!wall) return s.setWarning('Click the wall to offset, then click the side and distance.');
      s.setWarning(null);
      s.setDraft(offsetDraft(s, wall, raw));
      return;
    }
    case 'trim': {
      const wall = wallAt(s, raw);
      if (!wall) return s.setWarning('Click the piece of a wall to cut away.');
      commitCounted(store, (doc) => trimAt(doc, wall.id, raw, tol));
      return s.setWarning(null);
    }
    case 'extend': {
      const wall = wallAt(s, raw);
      if (!wall) return s.setWarning('Click near the end of the wall to lengthen.');
      const next = extendWall(s.doc, wall.id, raw);
      if (!next) return s.setWarning('There is no wall for this one to meet in that direction.');
      s.commit(() => next);
      return s.setWarning(null);
    }
    case 'breakWall':
    case 'join':
    case 'fillet':
    case 'chamfer': {
      if (d?.type === 'pick') return finishPair(store, raw, d);
      const wall = wallAt(s, raw);
      if (!wall) return s.setWarning(s.tool === 'breakWall' ? 'Click the wall to break.' : 'Click the first wall.');
      s.setWarning(null);
      // Remember where on the wall it was clicked (projected onto its centre line).
      const t = Math.max(0, Math.min(1, wallParam(wall, raw)));
      const point = { x: wall.x1 + t * (wall.x2 - wall.x1), y: wall.y1 + t * (wall.y2 - wall.y1) };
      s.setDraft({ type: 'pick', wallId: wall.id, point });
      return;
    }
    case 'mirror': {
      if (d?.type === 'mirror') {
        if (dist(d.a, p) <= tol) return;
        let ids: Id[] = [];
        s.commitFromBase((base) => {
          const out = mirrorItems(base, d.ids, d.a, p, d.flip);
          ids = out.ids;
          return out.doc;
        });
        s.endBatch();
        s.setDraft(null);
        return s.setSelection(ids);
      }
      const ids = selectionFor(store, raw);
      if (!ids) return s.setWarning('Select what to mirror, then click two points on the mirror line.');
      s.setWarning(null);
      s.beginBatch();
      s.setDraft({ type: 'mirror', ids, a: p, b: p, flip: !!opts.ctrl });
      return;
    }
    case 'stretch': {
      if (d?.type !== 'stretch') {
        s.setDraft({ type: 'stretch', x1: raw.x, y1: raw.y, x2: raw.x, y2: raw.y, boxDone: false });
        return;
      }
      if (!d.boxDone) return s.setDraft({ ...d, x2: raw.x, y2: raw.y, boxDone: true });
      if (!d.base) {
        s.beginBatch();
        return s.setDraft({ ...d, base: p, to: p });
      }
      s.endBatch();
      return s.setDraft(null);
    }
    case 'scale': {
      if (d?.type !== 'scale') {
        const ids = selectionFor(store, raw);
        if (!ids) return s.setWarning('Select what to scale, then click the point it grows from.');
        s.setWarning(null);
        return s.setDraft({ type: 'scale', ids, base: p, factor: 1 });
      }
      if (!d.ref) {
        if (dist(p, d.base) <= tol) return;
        s.beginBatch();
        return s.setDraft({ ...d, ref: p });
      }
      s.endBatch();
      return s.setDraft(null);
    }
  }
}

/** Pointer moved with a Modify tool: update previews. */
export function modifyHover(store: Store, raw: Point, inf: Inference, shift: boolean) {
  const s = store.getState();
  const d = s.draft;
  const p = inf.point;
  if (d?.type === 'offset') {
    const wall = wallById(s, d.wallId);
    if (wall) s.setDraft(offsetDraft(s, wall, raw));
  } else if (d?.type === 'mirror') {
    s.setDraft({ ...d, b: p });
    if (dist(d.a, p) > 0) s.commitFromBase((base) => mirrorItems(base, d.ids, d.a, p, d.flip).doc);
  } else if (d?.type === 'stretch') {
    if (!d.boxDone) s.setDraft({ ...d, x2: raw.x, y2: raw.y });
    else if (d.base) {
      s.setDraft({ ...d, to: p });
      const box = boxOf(d);
      const base = d.base;
      s.commitFromBase((b) => stretchItems(b, box, p.x - base.x, p.y - base.y));
    }
  } else if (d?.type === 'scale' && d.ref) {
    let factor = dist(p, d.base) / dist(d.ref, d.base);
    if (!shift) factor = Math.max(0.05, Math.round(factor * 20) / 20);
    const { ids, base } = d;
    s.commitFromBase((b) => scaleItems(b, ids, base, factor));
    s.setDraft({ ...d, factor });
  }
}

const boxOf = (d: { x1: number; y1: number; x2: number; y2: number }) => ({
  minX: Math.min(d.x1, d.x2),
  minY: Math.min(d.y1, d.y2),
  maxX: Math.max(d.x1, d.x2),
  maxY: Math.max(d.y1, d.y2),
});

/** Pointer released: a Stretch box drawn by dragging is done. */
export function modifyRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'stretch' && !d.boxDone && dragged) s.setDraft({ ...d, boxDone: true });
}

/** Enter with Break's first point picked: split the wall there. */
export function modifyEnter(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (s.tool === 'breakWall' && d?.type === 'pick') {
    const wall = wallById(s, d.wallId);
    s.setDraft(null);
    if (wall) commitCounted(store, (doc) => breakWall(doc, wall.id, wallParam(wall, d.point)));
    return true;
  }
  return false;
}

/** A typed value for a Modify tool. Returns an error message, or null when it was used. */
export function modifyMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  const d = s.draft;
  const units = (mm: number) => mm / MM_PER_UNIT;
  switch (s.tool) {
    case 'offset': {
      if (d?.type !== 'offset' || m.kind !== 'length') return 'Click the wall to offset, then type the distance.';
      const wall = wallById(s, d.wallId);
      if (wall) s.addElements([offsetWall(wall, Math.abs(units(m.mm)), d.side)]);
      s.setDraft(null);
      return null;
    }
    case 'fillet':
      if (m.kind !== 'length') return `Type a radius, e.g. 2' (0 for a square corner).`;
      s.setFilletRadius(units(Math.abs(m.mm)));
      return null;
    case 'chamfer': {
      const pair = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : null;
      if (!pair) return `Type the chamfer distances, e.g. 2',2'.`;
      s.setChamferDist([units(Math.abs(pair[0])), units(Math.abs(pair[1]))]);
      return null;
    }
    case 'breakWall': {
      if (d?.type !== 'pick' || m.kind !== 'length') return 'Click where the gap starts, then type its width.';
      const wall = wallById(s, d.wallId);
      if (!wall) return null;
      const L = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      const t1 = wallParam(wall, d.point);
      // The gap runs towards the pointer.
      const toward = s.inference ? wallParam(wall, s.inference.point) : 1;
      const t2 = t1 + (toward >= t1 ? 1 : -1) * (units(Math.abs(m.mm)) / L);
      s.setDraft(null);
      commitCounted(store, (doc) => breakWall(doc, wall.id, t1, t2));
      return null;
    }
    case 'stretch': {
      if (d?.type !== 'stretch' || !d.base || m.kind !== 'length')
        return 'Draw the box, click a base point, then type a distance.';
      const dir = sub(d.to ?? d.base, d.base);
      const L = Math.hypot(dir.x, dir.y) || 1;
      const k = units(m.mm) / L;
      const box = boxOf(d);
      s.commitFromBase((b) => stretchItems(b, box, dir.x * k || units(m.mm), dir.y * k));
      s.endBatch();
      s.setDraft(null);
      return null;
    }
    case 'scale': {
      if (d?.type !== 'scale') return 'Select what to scale and click the point it grows from, then type a factor.';
      let factor: number | null = null;
      if (m.kind === 'factor') factor = m.factor;
      else if (m.kind === 'length' && d.ref) factor = units(Math.abs(m.mm)) / dist(d.ref, d.base);
      if (!factor) return 'Type a factor such as 2 or 0.5 (or click a reference point first, then type a length).';
      const { ids, base } = d;
      const f = factor;
      if (!s.batchBase) s.beginBatch();
      s.commitFromBase((b) => scaleItems(b, ids, base, f));
      s.endBatch();
      s.setDraft(null);
      return null;
    }
    default:
      return `${s.tool[0].toUpperCase()}${s.tool.slice(1)} does not take typed values.`;
  }
}

/** Label and live value for the Measurements box. */
export function modifyReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  const len = (u: number) => formatLength(u * MM_PER_UNIT, s.units);
  switch (s.tool) {
    case 'offset':
      return { label: 'Distance', value: d?.type === 'offset' ? len(d.dist) : '' };
    case 'fillet':
      return { label: 'Radius', value: len(s.filletRadius) };
    case 'chamfer':
      return { label: 'Distances', value: `${len(s.chamferDist[0])}, ${len(s.chamferDist[1])}` };
    case 'breakWall':
      return { label: 'Gap', value: '' };
    case 'stretch':
      return { label: 'Distance', value: d?.type === 'stretch' && d.base && d.to ? len(dist(d.to, d.base)) : '' };
    case 'scale':
      return { label: 'Scale', value: d?.type === 'scale' ? `${d.factor.toFixed(2)}×` : '' };
    default:
      return { label: '', value: '' };
  }
}

/** What the Modify tool wants next. */
export function modifyHint(s: PlannerState): string {
  const d = s.draft;
  switch (s.tool) {
    case 'offset':
      return d?.type === 'offset'
        ? 'Click to place the parallel wall, or type its distance and press Enter.'
        : 'Click the wall to offset (make a parallel copy of).';
    case 'mirror':
      return d?.type === 'mirror'
        ? `Click the second point of the mirror line. ${d.flip ? 'Flipping the originals (Ctrl to copy instead).' : 'Making a mirrored copy (Ctrl to flip the originals instead).'}`
        : 'Select what to mirror, then click the first point of the mirror line.';
    case 'trim':
      return 'Click the piece of a wall to cut away, up to the walls crossing it. (Shift+click with the Eraser does the same.)';
    case 'extend':
      return 'Click near the end of a wall to lengthen it to the next wall.';
    case 'breakWall':
      return d?.type === 'pick'
        ? 'Click again on the wall where the gap ends, press Enter to just split it, or type the gap width.'
        : 'Click the wall where it should break.';
    case 'join':
      return d?.type === 'pick'
        ? 'Click the second wall, in line with the first.'
        : 'Click the first of two walls in a straight line.';
    case 'fillet':
      return d?.type === 'pick'
        ? 'Click the second wall. The corner keeps the parts you clicked.'
        : `Click the first wall. Radius ${formatLength(s.filletRadius * MM_PER_UNIT, s.units)}: type one (e.g. 2') for a rounded corner.`;
    case 'chamfer':
      return d?.type === 'pick'
        ? 'Click the second wall.'
        : `Click the first wall. Type distances (e.g. 2',2') to change the cut.`;
    case 'stretch':
      if (d?.type !== 'stretch') return 'Drag a box around the wall ends to stretch (or click two corners).';
      if (!d.boxDone) return 'Click the other corner of the box.';
      return d.base ? 'Click where to stretch to, or type a distance.' : 'Click the base point to stretch from.';
    case 'scale':
      if (d?.type !== 'scale') return 'Select what to scale, then click the point it grows from.';
      return d.ref
        ? 'Click to set the new size (0.05 steps; Shift for any), or type a factor or length.'
        : 'Click a reference point (its distance is the size to change), or type a factor such as 2.';
    default:
      return '';
  }
}
