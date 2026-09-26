import type { StandardView } from './cameraRig';

/** What the 3D view offers the menus: zooming, standard views and the projection. */
export interface ViewControls3D {
  zoom(factor: number): void;
  extents(): void;
  view(name: StandardView): void;
  setParallel(on: boolean): void;
  parallel(): boolean;
}

let current: ViewControls3D | null = null;
/** A view asked for before the 3D view was showing, applied when it opens. */
let pending: StandardView | null = null;
let parallelWanted = false;

/** Set by the 3D view while it is showing. */
export function setViewControls(c: ViewControls3D | null) {
  current = c;
  if (c) {
    c.setParallel(parallelWanted);
    if (pending) c.view(pending);
    pending = null;
  }
}

export const getViewControls = () => current;

/** Look from a standard view, now or when the 3D view opens. */
export function requestView(name: StandardView) {
  if (current) current.view(name);
  else pending = name;
}

export function toggleParallel() {
  parallelWanted = !(current?.parallel() ?? parallelWanted);
  current?.setParallel(parallelWanted);
}

export const isParallel = () => current?.parallel() ?? parallelWanted;
