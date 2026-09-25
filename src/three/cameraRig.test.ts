import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraRig } from './cameraRig';

const rig = () => {
  const camera = new PerspectiveCamera(45, 1.5, 0.1, 2000);
  const r = new CameraRig(camera);
  r.fit({ x: 5, z: 4 }, 10);
  return r;
};

describe('3D camera', () => {
  it('fits the building and orbits round it without going under the ground', () => {
    const r = rig();
    expect(r.camera.position.distanceTo(r.target)).toBeCloseTo(r.distance);
    const d = r.distance;
    r.orbit(200, 0);
    expect(r.camera.position.distanceTo(r.target)).toBeCloseTo(d);
    r.orbit(0, -100000);
    expect(r.camera.position.y).toBeGreaterThan(r.target.y);
  });

  it('pans the target across the screen and zooms towards the pointer', () => {
    const r = rig();
    const before = r.target.clone();
    r.pan(100, 0, 800);
    expect(r.target.distanceTo(before)).toBeCloseTo(100 * r.metresPerPixel(800));
    const point = new Vector3(0, 0, 0);
    const gap = r.target.distanceTo(point);
    r.dolly(0.5, point);
    expect(r.target.distanceTo(point)).toBeCloseTo(gap / 2);
    expect(r.distance).toBeGreaterThan(0.4);
  });
});
