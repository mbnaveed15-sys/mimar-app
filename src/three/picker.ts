import type { Id, Point, Vec3 } from '../types';

/** A face of an item under the pointer in 3D: where it was hit and the way the face points. */
export interface FaceHit {
  id: Id;
  point: Vec3;
  normal: Vec3;
  /** In the 2D plan: the line the face makes, to light it up. */
  edge?: [Point, Point];
}

/** What the view on screen (3D, or the 2D plan seen from above) can tell the tools about a position. */
export interface Picker3D {
  /** The 3D view (the 2D plan only knows about faces seen from above). */
  is3d: boolean;
  /** Light up the face a click would take hold of (or nothing). */
  highlight(hit: FaceHit | null): void;
  /** The item face under a screen position, on the floor being drawn. */
  faceAt(clientX: number, clientY: number): FaceHit | null;
  /** Where the line of sight through a screen position meets a plane. */
  onPlane(clientX: number, clientY: number, point: Vec3, normal: Vec3): Vec3 | null;
  /**
   * How far (metres) along the line from `origin` in direction `dir` the pointer is: the point on
   * that line nearest the line of sight through the screen position.
   */
  alongLine(clientX: number, clientY: number, origin: Vec3, dir: Vec3): number | null;
  /**
   * Where the other items start and stop along one axis of the scene (0 = x, 1 = up, 2 = z), in
   * metres: their tops and bottoms, or their sides, for Push/Pull to snap to.
   */
  extentsAlong?(axis: 0 | 1 | 2, exceptId: Id): number[];
}

/** Each view on screen registers its picker; in split view both do, and the one in use answers. */
const pickers = new Map<boolean, Picker3D>();
let active3d = false;
let pointer = { x: 0, y: 0 };

/** Set by a view while it is showing. */
export function setPicker(p: Picker3D) {
  pickers.set(p.is3d, p);
}

/** Taken away by a view when it closes (only if it is still the one registered). */
export function clearPicker(p: Picker3D) {
  if (pickers.get(p.is3d) === p) pickers.delete(p.is3d);
}

/** Which view is in use: the 3D one, or the 2D plan (in split view, the one under the pointer). */
export function setActivePicker(is3d: boolean) {
  active3d = is3d;
}

export function getPicker(): Picker3D | null {
  return pickers.get(active3d) ?? (pickers.size === 1 ? [...pickers.values()][0] : null);
}

/** Tests: forget every registered picker. */
export function resetPickers() {
  pickers.clear();
  active3d = false;
}

/** The last pointer position on screen, kept by the plan input for tools that need it. */
export function setPointer(x: number, y: number) {
  pointer = { x, y };
}

export function getPointer() {
  return pointer;
}
