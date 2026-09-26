import { createStore } from 'zustand';
import type { Point } from '../types';

/** Where the 3D camera stands and looks, on the plan: shown on the 2D side in split view. */
export interface CameraEye {
  /** Where it stands and the point it turns about, in plan units. */
  at: Point;
  target: Point;
  /** How wide it sees across, in degrees (0 for a parallel view). */
  fovDeg: number;
}

export const cameraEye = createStore<{ eye: CameraEye | null }>(() => ({ eye: null }));

/** Set by the 3D view each time it draws (only when the camera has moved); null when it closes. */
export function setCameraEye(eye: CameraEye | null) {
  const was = cameraEye.getState().eye;
  const same =
    was &&
    eye &&
    Math.abs(was.at.x - eye.at.x) < 0.5 &&
    Math.abs(was.at.y - eye.at.y) < 0.5 &&
    Math.abs(was.target.x - eye.target.x) < 0.5 &&
    Math.abs(was.target.y - eye.target.y) < 0.5 &&
    was.fovDeg === eye.fovDeg;
  if (!same) cameraEye.setState({ eye });
}
