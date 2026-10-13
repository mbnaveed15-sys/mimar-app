import { describe, expect, it } from 'vitest';
import type { Dormer, Point, Roof, Skylight } from '../../types';
import { roofShape, triangulateHoles } from './roof';
import { dormerFrontAt, dormerInMm, dormerMovedIn, dormerParts, faceUnder, skylightParts } from './roofOpenings';
import { buildModel, roofMesh } from '../../three/model';
import { emptyDoc, normaliseDoc } from '../storage';
import { quantities } from '../quantities';
import { mapOutline } from '../../geometry';
import { MM_PER_UNIT } from '../scale';

// A 12 m × 8 m hip roof outline at 35°, 450 mm overhang.
const roof: Roof = {
  id: 'r',
  type: 'roof',
  points: [
    { x: 0, y: 0 },
    { x: 1200, y: 0 },
    { x: 1200, y: 800 },
    { x: 0, y: 800 },
  ],
  shape: 'hip',
  pitchDeg: 35,
  overhangMm: 450,
  thicknessMm: 150,
};
const area = (pts: Point[]) =>
  Math.abs(pts.reduce((s, a, i) => s + a.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * a.y, 0)) / 2;
const sky: Skylight = { id: 's', x: 600, y: 200, wMm: 780, lMm: 980 };

describe('holes in a face', () => {
  it('triangulates an outline round a hole, covering just the ring', () => {
    const outer = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hole = [
      { x: 3, y: 3 },
      { x: 6, y: 3 },
      { x: 6, y: 5 },
      { x: 3, y: 5 },
    ];
    const all = [...outer, ...hole];
    const tris = triangulateHoles(outer, [hole]);
    const sum = tris.reduce((s, [a, b, c]) => s + area([all[a], all[b], all[c]]), 0);
    expect(sum).toBeCloseTo(100 - 6);
  });
});

describe('skylights', () => {
  it('lie in the slope of the face they are on, their length along it', () => {
    const p = skylightParts(roof, sky)!;
    expect(p).not.toBeNull();
    expect(p.edge).toBe(0);
    const [a, , c] = p.hole;
    // 780 wide along the eaves; 980 long up the slope (shorter in plan).
    expect(Math.abs(p.hole[1].x - a.x) * MM_PER_UNIT).toBeCloseTo(780);
    const run = Math.abs(c.y - a.y);
    const rise = Math.abs(c.z - a.z);
    expect(Math.hypot(run, rise) * MM_PER_UNIT).toBeCloseTo(980);
    expect(rise / run).toBeCloseTo(Math.tan((35 * Math.PI) / 180));
    // The glass sits inside the frame.
    expect(area(p.glass)).toBeLessThan(area(p.hole));
  });

  it('do not go across a hip or off the roof', () => {
    expect(skylightParts(roof, { ...sky, x: 30, y: 30 })).toBeNull();
    expect(skylightParts(roof, { ...sky, x: 2000 })).toBeNull();
  });

  it('cut the roof in 3D, with a frame and glass, and count with the windows', () => {
    const doc = { ...emptyDoc(), elements: [{ ...roof, skylights: [sky] }] };
    const model = buildModel(doc, { wallHeightMm: 3048, showFurniture: false });
    const main = model.roofs!.find((r) => r.holes)!;
    expect(main.holes!.flat()).toHaveLength(1);
    expect(model.roofs!.some((r) => r.role === 'glass')).toBe(true);
    const plain = roofMesh({ ...main, holes: undefined });
    const cut = roofMesh(main);
    expect(cut.indices.length).toBeGreaterThan(plain.indices.length);
    const before = quantities({ ...emptyDoc(), elements: [roof] }, 3048).total;
    const after = quantities(doc, 3048).total;
    expect(after.windows - before.windows).toBe(1);
    expect(after.roofSqft).toBeLessThan(before.roofSqft);
  });
});

describe('dormers', () => {
  const at = dormerFrontAt(roof, { x: 600, y: 250 })!;
  const dormer: Dormer = { id: 'd', ...at, wMm: 1500, kind: 'gable', wallMm: 1000 };

  it('stand 600 mm in from the eaves, at the point clicked along them', () => {
    expect(at.x).toBeCloseTo(600);
    expect(at.y * MM_PER_UNIT).toBeCloseTo(600);
    expect(dormerInMm(roof, dormer)).toBeCloseTo(600);
    expect(dormerInMm(roof, dormerMovedIn(roof, dormer, 900))).toBeCloseTo(900);
  });

  it('run back up the slope until their roof meets the main roof', () => {
    const p = dormerParts(roof, dormer)!;
    expect(p.edge).toBe(0);
    expect(p.walls).toHaveLength(3);
    expect(p.roof).toHaveLength(2);
    expect(p.window.length).toBe(4);
    // The ridge ends on the main roof.
    const f = faceUnder(roof, dormer)!;
    const back = p.roof[0][2];
    const r = (back.x - f.a.x) * f.v.x + (back.y - f.a.y) * f.v.y;
    expect(back.z).toBeCloseTo(f.za + f.s * r);
    // The ridge is the dormer's top: its slopes as steep as the roof's.
    expect(p.roof[0][1].z - p.roof[0][0].z).toBeCloseTo(
      0.75 * 100 * Math.tan((35 * Math.PI) / 180) * (10 / MM_PER_UNIT),
    );
    const shed = dormerParts(roof, { ...dormer, kind: 'shed' })!;
    expect(shed.roof).toHaveLength(1);
    expect(shed.ridge).toBeUndefined();
  });

  it('need a steep enough slope and room up it', () => {
    expect(dormerParts({ ...roof, pitchDeg: 10 }, dormer)).toBeNull();
    expect(dormerParts(roof, { ...dormer, wallMm: 4000 })).toBeNull();
    expect(dormerParts({ ...roof, shape: 'flat' }, dormer)).toBeNull();
  });

  it('go into the 3D model as walls, a window and a little roof, and move with their roof', () => {
    const doc = { ...emptyDoc(), elements: [{ ...roof, dormers: [dormer] }] };
    const model = buildModel(doc, { wallHeightMm: 3048, showFurniture: false });
    expect(model.roofs!.length).toBe(2);
    expect(model.panels.filter((p) => p.id === 'r' && p.role === 'glass')).toHaveLength(1);
    const moved = mapOutline({ ...roof, dormers: [dormer] }, (p) => ({ x: p.x + 100, y: p.y }));
    expect(moved.dormers![0].x).toBeCloseTo(dormer.x + 100);
    expect(roofShape(moved).faces).toHaveLength(roofShape(roof).faces.length);
    // Saved and opened again.
    const back = normaliseDoc(JSON.parse(JSON.stringify(doc)));
    expect((back.elements[0] as Roof).dormers).toEqual([dormer]);
  });
});
