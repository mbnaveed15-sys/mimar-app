/**
 * The Shape tool (flat rectangles, circles, arches and polygons on floors and walls) and Push/Pull
 * (take hold of a face and push it in or pull it out; push a shape through a wall or slab to cut it).
 */
import { wallLength } from '../geometry';
import type { Inference } from '../lib/inference';
import type { Measure } from '../lib/measure';
import { faceOf, pushPull } from '../lib/pushPull';
import { draftOutline, isRealOutline } from '../lib/shapes';
import { formatLength } from '../lib/units';
import { MM_PER_UNIT, type PlannerState } from '../store/plannerStore';
import { getPicker, getPointer } from '../three/picker';
import { levelBaseM, M_PER_UNIT } from '../three/model';
import type { Id, Point, ShapeSurface, Tool, Vec3, Wall } from '../types';
import { thicknessOf } from '../walls';

interface Store {
  getState: () => PlannerState;
}

export const SHAPE_TOOLS: Tool[] = ['shape', 'pushpull'];

const SHAPE_NAMES = { rect: 'rectangle', circle: 'circle', arch: 'arch', polygon: 'polygon' } as const;

type ShapeDraft = Extract<PlannerState['draft'], { type: 'shape' }>;
type PushDraft = Extract<PlannerState['draft'], { type: 'push' }>;

/** A wall's frame in the scene: where it starts, which way it runs, and the height of its foot (metres). */
function wallFrame(s: PlannerState, wall: Wall) {
  const len = wallLength(wall) || 1;
  const u = { x: (wall.x2 - wall.x1) / len, y: (wall.y2 - wall.y1) / len };
  const onGround = wall.kind === 'boundary' && (wall.levelId ?? 'ground') === 'ground';
  const foot = (onGround ? 0 : levelBaseM(s.doc, wall.levelId ?? 'ground', s.wallHeightMm)) + (wall.elevMm ?? 0) / 1000;
  return { len, u, foot };
}

/** A point in the scene as a point on a wall's face: along it from its start, and up from its foot (plan units). */
function onWall(s: PlannerState, wall: Wall, p: Vec3): Point {
  const { u, foot } = wallFrame(s, wall);
  const x = p[0] / M_PER_UNIT - wall.x1;
  const y = p[2] / M_PER_UNIT - wall.y1;
  return { x: x * u.x + y * u.y, y: (p[1] - foot) / M_PER_UNIT };
}

/** A point on a surface as a point in the scene (metres). */
export function surfaceToScene(s: PlannerState, surface: ShapeSurface, p: Point): Vec3 | null {
  if (surface.on === 'floor') {
    const base = levelBaseM(s.doc, surface.levelId ?? s.activeLevel, s.wallHeightMm);
    return [p.x * M_PER_UNIT, base + floorHeightM(s, surface) + 0.01, p.y * M_PER_UNIT];
  }
  const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === surface.wallId);
  if (!wall) return null;
  const { u, foot } = wallFrame(s, wall);
  const out = surface.face * (thicknessOf(wall) / 2 + 1);
  const x = wall.x1 + u.x * p.x - u.y * out;
  const y = wall.y1 + u.y * p.x + u.x * out;
  return [x * M_PER_UNIT, foot + p.y * M_PER_UNIT, y * M_PER_UNIT];
}

/** Height (metres) of a floor surface above its floor's level: a slab's top, plus any height it has. */
function floorHeightM(s: PlannerState, surface: Extract<ShapeSurface, { on: 'floor' }>): number {
  const slab = surface.slabId ? s.doc.elements.find((el) => el.id === surface.slabId && el.type === 'slab') : undefined;
  const slabTop =
    slab?.type === 'slab' ? (s.wallHeightMm + (slab.elevMm ?? 0) + slab.thickness * MM_PER_UNIT) / 1000 : 0;
  return slabTop + surface.elevMm / 1000;
}

/** The draft shape's outline so far, in scene metres (for the 3D preview). */
export function shapeDraftScene(s: PlannerState): Vec3[] {
  const d = s.draft;
  if (d?.type !== 'shape') return [];
  return draftOutline(d.kind, d.points, d.cursor)
    .map((p) => surfaceToScene(s, d.surface, p))
    .filter((p): p is Vec3 => p !== null);
}

const snapTo = (v: number, step: number) => Math.round(v / step) * step;

/** Where the pointer is on a wall's face (snapped to the grid), or null when it isn't over that plane. */
function pointerOnWall(s: PlannerState, wallId: Id, face: 1 | -1): Point | null {
  const picker = getPicker();
  const wall = s.doc.elements.find((el): el is Wall => el.type === 'wall' && el.id === wallId);
  if (!picker || !wall) return null;
  const origin = surfaceToScene(s, { on: 'wall', wallId, face }, { x: 0, y: 0 });
  const { u } = wallFrame(s, wall);
  if (!origin) return null;
  const { x, y } = getPointer();
  const hit = picker.onPlane(x, y, origin, [-u.y * face, 0, u.x * face]);
  if (!hit) return null;
  const p = onWall(s, wall, hit);
  const step = s.gridPx;
  return s.grid.snap ? { x: snapTo(p.x, step), y: snapTo(p.y, step) } : p;
}

/** The surface a shape starts on: a wall's face, a slab's or block's top, or the floor. */
function surfaceAt(s: PlannerState): { surface: ShapeSurface; wallPoint?: Point } {
  const picker = getPicker();
  const floor: ShapeSurface = { on: 'floor', elevMm: 0, levelId: s.activeLevel };
  if (!picker) return { surface: floor };
  const { x, y } = getPointer();
  const hit = picker.faceAt(x, y);
  const el = hit && s.pickableElements().find((e) => e.id === hit.id);
  if (!hit || !el) return { surface: floor };
  const face = faceOf(el, hit.normal, hit.point);
  if (el.type === 'wall' && face?.part === 'side') {
    const p = onWall(s, el, hit.point);
    const step = s.gridPx;
    return {
      surface: { on: 'wall', wallId: el.id, face: face.sign },
      wallPoint: s.grid.snap ? { x: snapTo(p.x, step), y: snapTo(p.y, step) } : p,
    };
  }
  if (el.type === 'slab' && face?.part === 'top') return { surface: { ...floor, slabId: el.id } };
  if (el.type === 'block' && face?.part === 'top' && el.heightMm > 0)
    return { surface: { ...floor, elevMm: (el.elevMm ?? 0) + el.heightMm, slabId: el.slabId } };
  return { surface: floor };
}

/** Make the drawn shape (a flat block on a floor, or a flat window on a wall) and end the draft. */
function finishShape(store: Store, d: ShapeDraft, cursor: Point) {
  const s = store.getState();
  const points = d.kind === 'polygon' ? d.points : draftOutline(d.kind, d.points, cursor);
  s.setDraft(null);
  // Ignore clicks and slivers: at least 1" (or 25 mm) each way.
  if (!isRealOutline(points, 2.54 * 2.54)) return;
  if (d.surface.on === 'wall') s.addWallShape(d.surface.wallId, d.surface.face, d.kind, points);
  else s.addFloorShape(points, d.kind, { elevMm: d.surface.elevMm, slabId: d.surface.slabId });
  s.setWarning(null);
}

/** Where a shape draft's pointer is now: on its wall, or the snapped floor point. */
function cursorFor(s: PlannerState, d: ShapeDraft, inf: Inference): Point {
  if (d.surface.on === 'wall') return pointerOnWall(s, d.surface.wallId, d.surface.face) ?? d.cursor;
  return inf.point;
}

function pushTo(store: Store, d: PushDraft, mm: number, dragged = d.dragged) {
  const s = store.getState();
  const { id, face } = d;
  s.commitFromBase((base) => pushPull(base, id, face, mm, { wallHeightMm: s.wallHeightMm }).doc);
  s.setDraft({ ...d, dist: mm, dragged });
}

function finishPush(store: Store) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'push') return;
  const base = s.batchBase;
  const result = base ? pushPull(base, d.id, d.face, d.dist, { wallHeightMm: s.wallHeightMm }).result : 'none';
  s.endBatch();
  s.setDraft(null);
  if (result === 'none' && d.face.part === 'into')
    s.setWarning('Push the shape at least half-way into the wall to cut the opening.');
  else if (result === 'none' && d.dist < 0)
    s.setWarning('Push the shape at least half-way down into the slab to make a void.');
  else s.setWarning(null);
}

/** How far the pointer has taken the face, in mm (inches or 10 mm steps). */
function pushDistance(s: PlannerState, d: PushDraft): number | null {
  const picker = getPicker();
  if (!picker) return null;
  const { x, y } = getPointer();
  const t = picker.alongLine(x, y, d.origin, d.normal);
  if (t === null) return null;
  const step = s.units === 'imperial' ? 25.4 : 10;
  return Math.round((t * 1000) / step) * step;
}

export function shapePress(store: Store, inf: Inference) {
  const s = store.getState();
  const d = s.draft;
  if (s.tool === 'shape') {
    if (d?.type !== 'shape') {
      const { surface, wallPoint } = surfaceAt(s);
      const start = wallPoint ?? inf.point;
      s.setDraft({ type: 'shape', kind: s.shapeKind, surface, points: [start], cursor: start });
      return;
    }
    const at = cursorFor(s, d, inf);
    if (d.kind !== 'polygon') return finishShape(store, d, at);
    // A polygon closes when its first corner is clicked again.
    const first = d.points[0];
    const tol = 10 * s.reach() * s.pxUnits();
    if (d.points.length >= 3 && Math.hypot(at.x - first.x, at.y - first.y) <= tol) return finishShape(store, d, at);
    s.setDraft({ ...d, points: [...d.points, at], cursor: at });
    return;
  }

  // Push/Pull: a second click finishes a push started with a click.
  if (d?.type === 'push') return finishPush(store);
  const picker = getPicker();
  if (!picker) {
    s.setWarning('Push/Pull works in the 3D view: switch with Ctrl+2 (or 3D view at the top).');
    return;
  }
  const { x, y } = getPointer();
  const hit = picker.faceAt(x, y);
  const el = hit && s.pickableElements().find((e) => e.id === hit.id);
  if (!hit || !el) {
    s.setWarning('Click a face of a wall, slab, column, beam, block or shape to push or pull it.');
    return;
  }
  const face = faceOf(el, hit.normal, hit.point);
  if (!face) {
    s.setWarning(
      el.type === 'window' || el.type === 'door'
        ? 'Doors and windows move along their wall; draw a shape on the wall to cut a new opening.'
        : 'That face can’t be pushed or pulled.',
    );
    return;
  }
  s.setWarning(null);
  s.select(el.id);
  s.beginBatch();
  s.setDraft({ type: 'push', id: el.id, face, origin: hit.point, normal: hit.normal, dist: 0 });
}

export function shapeHover(store: Store, inf: Inference | null) {
  const s = store.getState();
  const d = s.draft;
  if (d?.type === 'shape') {
    // On a wall the floor's snap marker would only mislead.
    if (d.surface.on === 'wall') s.setInference(null);
    if (inf) s.setDraft({ ...d, cursor: cursorFor(s, d, inf) });
    return;
  }
  if (d?.type === 'push') {
    const mm = pushDistance(s, d);
    if (mm !== null && mm !== d.dist) pushTo(store, d, mm, true);
    return;
  }
  if (s.tool === 'pushpull') {
    // Light up what a click would take hold of.
    const picker = getPicker();
    const { x, y } = getPointer();
    const hit = picker?.faceAt(x, y);
    const el = hit && s.pickableElements().find((e) => e.id === hit.id);
    s.setHoverId(el && faceOf(el, hit.normal, hit.point) ? el.id : null);
  }
}

export function shapeRelease(store: Store, dragged: boolean) {
  const s = store.getState();
  const d = s.draft;
  // A drag draws a shape (other than a polygon) or pushes a face in one go.
  if (d?.type === 'shape' && dragged && d.kind !== 'polygon' && d.points.length === 1) finishShape(store, d, d.cursor);
  if (d?.type === 'push' && dragged) finishPush(store);
}

/** A typed size: width and height (or depth) for a rectangle or arch, the radius of a circle, a push's distance. */
export function shapeMeasure(store: Store, m: Measure): string | null {
  const s = store.getState();
  const d = s.draft;
  const units = (mm: number) => mm / MM_PER_UNIT;
  if (d?.type === 'push') {
    if (m.kind !== 'length') return "Type how far to push or pull, e.g. 2' (a minus sign pushes in).";
    // Keep going the way the pointer went (pushing in for a shape on a wall).
    const sign = d.dist < 0 || (d.dist === 0 && d.face.part === 'into') ? -1 : 1;
    pushTo(store, d, m.mm < 0 ? m.mm : sign * m.mm);
    finishPush(store);
    return null;
  }
  if (d?.type !== 'shape')
    return s.tool === 'pushpull' ? 'Click a face first, then type a distance.' : 'Click where the shape starts first.';
  const [a] = d.points;
  const dir = { x: Math.sign(d.cursor.x - a.x) || 1, y: Math.sign(d.cursor.y - a.y) || 1 };
  if (d.kind === 'circle') {
    if (m.kind !== 'length') return "Type the radius, e.g. 2'.";
    const r = units(Math.abs(m.mm));
    finishShape(store, d, { x: a.x + r, y: a.y });
    return null;
  }
  if (d.kind === 'polygon') {
    if (m.kind !== 'length') return 'Type the length of the next side.';
    const last = d.points[d.points.length - 1];
    const v = { x: d.cursor.x - last.x, y: d.cursor.y - last.y };
    const len = Math.hypot(v.x, v.y) || 1;
    const next = { x: last.x + (v.x / len) * units(m.mm), y: last.y + (v.y / len) * units(m.mm) };
    s.setDraft({ ...d, points: [...d.points, next], cursor: next });
    return null;
  }
  const [w, h] = m.kind === 'pair' ? [m.a, m.b] : m.kind === 'length' ? [m.mm, m.mm] : [0, 0];
  if (!w || !h) return `Type width and height, e.g. 3',4'.`;
  finishShape(store, d, { x: a.x + dir.x * units(Math.abs(w)), y: a.y + dir.y * units(Math.abs(h)) });
  return null;
}

/** Enter finishes a polygon. */
export function shapeEnter(store: Store): boolean {
  const s = store.getState();
  const d = s.draft;
  if (d?.type !== 'shape' || d.kind !== 'polygon') return false;
  if (d.points.length >= 3) finishShape(store, d, d.points[d.points.length - 1]);
  else s.setDraft(null);
  return true;
}

export function shapeHint(s: PlannerState): string {
  const d = s.draft;
  if (s.tool === 'shape') {
    const name = SHAPE_NAMES[s.shapeKind];
    if (d?.type === 'shape') {
      if (d.kind === 'polygon') return 'Click each corner; click the first one again (or press Enter) to close it.';
      if (d.kind === 'circle') return 'Click to set the radius, or type it.';
      return `Click the opposite corner, or type width and height (e.g. 3',4').`;
    }
    return s.view3d
      ? `Click on a floor, slab or wall face to start a ${name}. Then use Push/Pull (P) on it.`
      : `Click on the floor to start a ${name}. In 3D you can draw on walls and slabs too.`;
  }
  if (d?.type === 'push')
    return d.face.part === 'into'
      ? 'Push into the wall (at least half-way) to cut the opening, or type a depth.'
      : 'Move to push or pull, then click (or type a distance and press Enter).';
  return s.view3d
    ? 'Click a face to push or pull it: a wall’s top or side, a slab, column, beam, block or shape.'
    : 'Push/Pull works in the 3D view (Ctrl+2).';
}

export function shapeReadout(s: PlannerState): { label: string; value: string } {
  const d = s.draft;
  if (d?.type === 'push') return { label: 'Distance', value: formatLength(d.dist, s.units) };
  if (d?.type !== 'shape') return { label: s.tool === 'pushpull' ? 'Distance' : 'Dimensions', value: '' };
  const [a] = d.points;
  const len = (v: number) => formatLength(Math.abs(v) * MM_PER_UNIT, s.units);
  if (d.kind === 'circle') return { label: 'Radius', value: len(Math.hypot(d.cursor.x - a.x, d.cursor.y - a.y)) };
  if (d.kind === 'polygon') {
    const last = d.points[d.points.length - 1];
    return { label: 'Length', value: len(Math.hypot(d.cursor.x - last.x, d.cursor.y - last.y)) };
  }
  return { label: 'Dimensions', value: `${len(d.cursor.x - a.x)}, ${len(d.cursor.y - a.y)}` };
}
