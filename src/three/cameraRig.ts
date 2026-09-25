import { MathUtils, PerspectiveCamera, Vector3 } from 'three';

const MIN_ELEVATION = MathUtils.degToRad(2);
const MAX_ELEVATION = MathUtils.degToRad(89);
const ORBIT_SPEED = 0.008; // radians per pixel

/**
 * The 3D camera, SketchUp style: it circles round a target point. Orbit turns it, pan slides the
 * target sideways and up, and dolly moves nearer or further (towards the point under the pointer).
 */
export class CameraRig {
  target = new Vector3(0, 1, 0);
  distance = 20;
  azimuth = MathUtils.degToRad(35);
  elevation = MathUtils.degToRad(42);

  constructor(readonly camera: PerspectiveCamera) {}

  /** Put the camera where the rig says. */
  apply() {
    const flat = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      this.target.x + flat * Math.sin(this.azimuth),
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + flat * Math.cos(this.azimuth),
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }

  /** Turn round the target by a drag of (dx, dy) pixels. */
  orbit(dx: number, dy: number) {
    this.azimuth -= dx * ORBIT_SPEED;
    this.elevation = MathUtils.clamp(this.elevation + dy * ORBIT_SPEED, MIN_ELEVATION, MAX_ELEVATION);
    this.apply();
  }

  /** Metres covered by one screen pixel at the target, for a view `heightPx` tall. */
  metresPerPixel(heightPx: number) {
    return (2 * this.distance * Math.tan(MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, heightPx);
  }

  /** Slide the view so what was under the pointer follows a drag of (dx, dy) pixels. */
  pan(dx: number, dy: number, heightPx: number) {
    const m = this.metresPerPixel(heightPx);
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    this.target.addScaledVector(right, -dx * m).addScaledVector(up, dy * m);
    this.apply();
  }

  /** Move nearer (factor < 1) or further (> 1), keeping `towards` (if given) under the pointer. */
  dolly(factor: number, towards?: Vector3) {
    const next = MathUtils.clamp(this.distance * factor, 0.5, 3000);
    const applied = next / this.distance;
    if (towards) this.target.lerp(towards, 1 - applied);
    this.distance = next;
    this.apply();
  }

  /**
   * Look at a building of the given size from above one corner, far enough back to see it all.
   * `steep` looks down more, which suits drawing on an empty plan.
   */
  fit(centre: { x: number; z: number }, size: number, steep = false) {
    const radius = size * 0.75 + 1.5;
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    this.target.set(centre.x, 1, centre.z);
    this.distance = radius / Math.sin(Math.min(vFov, hFov) / 2);
    this.azimuth = MathUtils.degToRad(35);
    this.elevation = MathUtils.degToRad(steep ? 62 : 42);
    this.apply();
  }
}
