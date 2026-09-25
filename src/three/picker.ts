import type { Id, Vec3 } from '../types';

/** A face of an item under the pointer in 3D: where it was hit and the way the face points. */
export interface FaceHit {
  id: Id;
  point: Vec3;
  normal: Vec3;
}

/** What the 3D view can tell the tools about a screen position. */
export interface Picker3D {
  /** The item face under a screen position, on the floor being drawn. */
  faceAt(clientX: number, clientY: number): FaceHit | null;
  /** Where the line of sight through a screen position meets a plane. */
  onPlane(clientX: number, clientY: number, point: Vec3, normal: Vec3): Vec3 | null;
  /**
   * How far (metres) along the line from `origin` in direction `dir` the pointer is: the point on
   * that line nearest the line of sight through the screen position.
   */
  alongLine(clientX: number, clientY: number, origin: Vec3, dir: Vec3): number | null;
}

let current: Picker3D | null = null;
let pointer = { x: 0, y: 0 };

/** Set by the 3D view while it is showing. */
export function setPicker(p: Picker3D | null) {
  current = p;
}

export function getPicker(): Picker3D | null {
  return current;
}

/** The last pointer position on screen, kept by the plan input for tools that need it. */
export function setPointer(x: number, y: number) {
  pointer = { x, y };
}

export function getPointer() {
  return pointer;
}
