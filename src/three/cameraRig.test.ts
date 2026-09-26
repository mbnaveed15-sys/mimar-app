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

  it('zooms to extents looking the same way, and gives the standard views', () => {
    const r = rig();
    r.orbit(120, 40);
    const [az, el] = [r.azimuth, r.elevation];
    r.dolly(0.1);
    r.extents({ x: 5, z: 4 }, 10);
    expect([r.azimuth, r.elevation]).toEqual([az, el]);
    expect(r.target.x).toBeCloseTo(5);
    r.view('top', { x: 5, z: 4 }, 10);
    expect(r.camera.position.x).toBeCloseTo(5, 1);
    expect(r.camera.position.y).toBeGreaterThan(10);
    r.view('front', { x: 5, z: 4 }, 10);
    // From the road (+z), level.
    expect(r.camera.position.z).toBeGreaterThan(r.target.z + 5);
    expect(r.camera.position.y).toBeCloseTo(r.target.y);
  });

  it('turns about the point under the pointer, keeping the camera where it is', () => {
    const r = rig();
    const eye = r.camera.position.clone();
    r.pivotAbout(new Vector3(0, 0, 0));
    expect(r.camera.position.distanceTo(eye)).toBeCloseTo(0);
    expect(r.target.length()).toBeCloseTo(0);
  });

  it('never looks from under the ground', () => {
    const r = rig();
    r.view('front', { x: 0, z: 0 }, 10);
    r.pan(0, -100000, 800);
    expect(r.target.y).toBeGreaterThanOrEqual(0);
    expect(r.camera.position.y).toBeGreaterThanOrEqual(0.2 - 1e-9);
  });

  it('frames the same view through a parallel camera', () => {
    const r = rig();
    expect(r.active).toBe(r.camera);
    r.parallel = true;
    r.apply();
    expect(r.active).toBe(r.ortho);
    const halfH = r.distance * Math.tan(((r.camera.fov / 2) * Math.PI) / 180);
    expect(r.ortho.top).toBeCloseTo(halfH);
    expect(r.ortho.right).toBeCloseTo(halfH * r.camera.aspect);
    expect(r.ortho.position.distanceTo(r.camera.position)).toBeCloseTo(0);
  });
});
