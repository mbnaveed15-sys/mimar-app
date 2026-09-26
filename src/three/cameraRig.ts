import { MathUtils, OrthographicCamera, PerspectiveCamera, Vector3 } from 'three';

const MIN_ELEVATION = MathUtils.degToRad(2);
const MAX_ELEVATION = MathUtils.degToRad(89.9);
const ORBIT_SPEED = 0.008; // radians per pixel
/** The camera never goes lower than this above the ground (metres). */
const MIN_EYE = 0.2;

/** The standard views, SketchUp style: from above, from each side, and the three-quarter view. */
export type StandardView = 'top' | 'front' | 'back' | 'left' | 'right' | 'iso';

/** Direction to look from, as azimuth and elevation in degrees. The plan's front (the road) is +z. */
const VIEWS: Record<StandardView, { azimuth: number; elevation: number }> = {
  top: { azimuth: 0, elevation: 89.9 },
  front: { azimuth: 0, elevation: 0 },
  back: { azimuth: 180, elevation: 0 },
  left: { azimuth: -90, elevation: 0 },
  right: { azimuth: 90, elevation: 0 },
  iso: { azimuth: 35, elevation: 35 },
};

/**
 * The 3D camera, SketchUp style: it circles round a target point. Orbit turns it, pan slides the
 * target sideways and up, and dolly moves nearer or further (towards the point under the pointer).
 * It can look through a perspective camera or a parallel (orthographic) one of the same framing.
 */
export class CameraRig {
  target = new Vector3(0, 1, 0);
  distance = 20;
  azimuth = MathUtils.degToRad(35);
  elevation = MathUtils.degToRad(42);
  /** Parallel projection: no perspective, as for plans and elevations. */
  parallel = false;
  readonly ortho = new OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
  /** The lowest the camera looks from (a standard side view looks from level). */
  private minElevation = MIN_ELEVATION;

  constructor(readonly camera: PerspectiveCamera) {}

  /** The camera to render and pick with. */
  get active(): PerspectiveCamera | OrthographicCamera {
    return this.parallel ? this.ortho : this.camera;
  }

  /** Put the camera where the rig says. */
  apply() {
    const flat = Math.cos(this.elevation) * this.distance;
    this.camera.position.set(
      this.target.x + flat * Math.sin(this.azimuth),
      this.target.y + Math.sin(this.elevation) * this.distance,
      this.target.z + flat * Math.cos(this.azimuth),
    );
    // Never below the ground: lift the view instead.
    if (this.camera.position.y < MIN_EYE) {
      const lift = MIN_EYE - this.camera.position.y;
      this.target.y += lift;
      this.camera.position.y += lift;
    }
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    // The parallel camera frames what the perspective one shows at the target.
    const halfH = this.distance * Math.tan(MathUtils.degToRad(this.camera.fov) / 2);
    const halfW = halfH * this.camera.aspect;
    Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.ortho.position.copy(this.camera.position);
    this.ortho.quaternion.copy(this.camera.quaternion);
    this.ortho.updateProjectionMatrix();
    this.ortho.updateMatrixWorld();
  }

  /** Turn round the target by a drag of (dx, dy) pixels. */
  orbit(dx: number, dy: number) {
    this.minElevation = MIN_ELEVATION;
    this.azimuth -= dx * ORBIT_SPEED;
    this.elevation = MathUtils.clamp(this.elevation + dy * ORBIT_SPEED, this.minElevation, MAX_ELEVATION);
    this.apply();
  }

  /**
   * Turn round this point from now on (the point under the pointer when an orbit starts), keeping
   * the camera where it is.
   */
  pivotAbout(point: Vector3) {
    const offset = this.camera.position.clone().sub(point);
    const d = offset.length();
    if (d < 0.5) return;
    this.target.copy(point);
    this.distance = d;
    this.elevation = MathUtils.clamp(Math.asin(offset.y / d), MIN_ELEVATION, MAX_ELEVATION);
    this.azimuth = Math.atan2(offset.x, offset.z);
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
    // The point turned about stays on or above the ground.
    this.target.y = Math.max(0, this.target.y);
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

  /** How far back to stand to see a building of this size whole. */
  private fitDistance(size: number) {
    const radius = size * 0.75 + 1.5;
    const vFov = MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    return radius / Math.sin(Math.min(vFov, hFov) / 2);
  }

  /**
   * Look at a building of the given size from above one corner, far enough back to see it all.
   * `steep` looks down more, which suits drawing on an empty plan.
   */
  fit(centre: { x: number; z: number }, size: number, steep = false) {
    this.minElevation = MIN_ELEVATION;
    this.target.set(centre.x, 1, centre.z);
    this.distance = this.fitDistance(size);
    // Square on to the plan when drawing from scratch, so screen directions match the plan's.
    this.azimuth = MathUtils.degToRad(steep ? 0 : 35);
    this.elevation = MathUtils.degToRad(steep ? 62 : 42);
    this.apply();
  }

  /** Zoom extents: frame the whole building, looking the same way as now. */
  extents(centre: { x: number; z: number }, size: number) {
    this.target.set(centre.x, 1, centre.z);
    this.distance = this.fitDistance(size);
    this.apply();
  }

  /** One of the standard views, framing the whole building. */
  view(name: StandardView, centre: { x: number; z: number }, size: number) {
    const v = VIEWS[name];
    // Side views look from level, which orbiting then keeps above.
    this.minElevation = Math.min(MIN_ELEVATION, MathUtils.degToRad(v.elevation));
    this.azimuth = MathUtils.degToRad(v.azimuth);
    this.elevation = MathUtils.degToRad(v.elevation);
    this.extents(centre, size);
  }
}
