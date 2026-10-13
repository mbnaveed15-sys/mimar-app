import type { SavedCamera } from '../types';
import type { StandardView } from './cameraRig';

/** What the 3D view offers the menus: zooming, standard views and the projection. */
export interface ViewControls3D {
  zoom(factor: number): void;
  extents(): void;
  view(name: StandardView): void;
  setParallel(on: boolean): void;
  parallel(): boolean;
  /** The camera, to save as a view. */
  camera(): SavedCamera;
  /** Look from a saved view's camera. */
  setCamera(c: SavedCamera): void;
}

let current: ViewControls3D | null = null;
/** A view asked for before the 3D view was showing, applied when it opens. */
let pending: StandardView | null = null;
/** A saved camera asked for before the 3D view was showing. */
let pendingCamera: SavedCamera | null = null;
let parallelWanted = false;

/** Set by the 3D view while it is showing. */
export function setViewControls(c: ViewControls3D | null) {
  current = c;
  if (c) {
    c.setParallel(parallelWanted);
    if (pending) c.view(pending);
    if (pendingCamera) c.setCamera(pendingCamera);
    pending = null;
    pendingCamera = null;
  }
}

export const getViewControls = () => current;

/** Look from a standard view, now or when the 3D view opens. */
export function requestView(name: StandardView) {
  if (current) current.view(name);
  else pending = name;
}

/** Look from a saved camera, now or when the 3D view opens. */
export function requestCamera(c: SavedCamera) {
  if (current) current.setCamera(c);
  else pendingCamera = c;
}

export function toggleParallel() {
  parallelWanted = !(current?.parallel() ?? parallelWanted);
  current?.setParallel(parallelWanted);
}

export const isParallel = () => current?.parallel() ?? parallelWanted;
